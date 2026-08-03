import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { buildReminderSchedule, taskDraftSchema, type TaskTarget, type TaskType } from "@mba/domain";
import { db, FieldValue, Timestamp } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor, requireString, requireTaskManager, writeAudit, type Actor } from "./helpers.js";

interface StoredTask {
  title: string;
  description: string;
  taskType: TaskType;
  status: "draft" | "publishing" | "published" | "closed" | "cancelled";
  target: TaskTarget;
  dueAt: Timestamp;
  dueTimezone: string;
  resourceUrl?: string;
  ownerUid: string;
  version: number;
  audienceVersion: number;
  scheduleVersion: number;
  audienceSyncStatus: "not_started" | "processing" | "ready" | "failed";
}

const idSchema = z.object({ taskId: z.string().min(1), reason: z.string().trim().max(500).optional() });

function toStoredDraft(input: z.infer<typeof taskDraftSchema>, actor: Actor) {
  return {
    title: input.title,
    description: input.description,
    taskType: input.taskType,
    target: input.target,
    dueAt: Timestamp.fromDate(new Date(input.dueAtIso)),
    dueTimezone: "Asia/Kolkata",
    resourceUrl: input.resourceUrl || null,
    ownerUid: actor.uid,
  };
}

async function loadTask(taskId: string): Promise<{ ref: FirebaseFirestore.DocumentReference; data: StoredTask }> {
  const ref = db.doc(`tasks/${taskId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Task not found");
  return { ref, data: snap.data() as StoredTask };
}

async function eligibleRecipients(target: TaskTarget) {
  let query: FirebaseFirestore.Query = db.collection("users").where("status", "in", ["active", "invited"]);
  query = target.kind === "wing"
    ? query.where("wingId", "==", target.wingId)
    : query.where("sectionId", "==", target.sectionId);
  const snap = await query.get();
  return snap.docs.map((doc) => ({ uid: doc.id, ...doc.data() })) as Array<Record<string, unknown> & { uid: string }>;
}

async function validateCatalogTarget<T extends TaskTarget>(target: T): Promise<T> {
  if (target.kind === "subject_offering") {
    const offering = await db.doc(`subjectOfferings/${target.subjectOfferingId}`).get();
    if (!offering.exists || offering.get("active") !== true) throw new HttpsError("failed-precondition", "Subject offering is not active");
    const sectionId = offering.get("sectionId") as "A" | "B";
    if (target.sectionId !== sectionId || target.scopeKey !== `subject:${target.subjectOfferingId}`) {
      throw new HttpsError("invalid-argument", "Subject target does not match the server catalog");
    }
    return { ...target, sectionId, scopeKey: `subject:${target.subjectOfferingId}` } as T;
  }
  const wing = await db.doc(`wings/${target.wingId}`).get();
  if (!wing.exists || wing.get("active") !== true || target.scopeKey !== `wing:${target.wingId}`) {
    throw new HttpsError("failed-precondition", "Wing target does not match the server catalog");
  }
  return target;
}

export const previewTaskRecipients = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = taskDraftSchema.parse(request.data);
    const target = await validateCatalogTarget(input.target);
    requireTaskManager(actor, input.taskType, target);
    const recipients = await eligibleRecipients(target);
    return {
      count: recipients.length,
      sample: recipients.slice(0, 12).map((student) => ({
        uid: student.uid,
        displayName: student.displayName,
        rollNumber: student.rollNumber,
        sectionId: student.sectionId,
        wingId: student.wingId,
      })),
    };
  } catch (error) {
    asHttpsError(error);
  }
});

export const createTask = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = taskDraftSchema.parse(request.data);
    const target = await validateCatalogTarget(input.target);
    requireTaskManager(actor, input.taskType, target);
    input.target = target;
    const ref = input.idempotencyKey
      ? db.doc(`tasks/${actor.uid}_${input.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "")}`)
      : db.collection("tasks").doc();
    const existing = await ref.get();
    if (existing.exists) return { taskId: ref.id, idempotent: true };
    await ref.create({
      ...toStoredDraft(input, actor),
      status: "draft",
      version: 1,
      audienceVersion: 0,
      scheduleVersion: 0,
      audienceSyncStatus: "not_started",
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actor.uid,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    });
    await writeAudit({ actorUid: actor.uid, action: "task.created", resourceType: "task", resourceId: ref.id, after: toStoredDraft(input, actor) });
    return { taskId: ref.id };
  } catch (error) {
    asHttpsError(error);
  }
});

export const updateTask = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const taskId = requireString((request.data as Record<string, unknown>)?.taskId, "taskId");
    const input = taskDraftSchema.parse(request.data);
    input.target = await validateCatalogTarget(input.target);
    const { ref, data: task } = await loadTask(taskId);
    requireTaskManager(actor, task.taskType, task.target);
    if (["closed", "cancelled", "publishing"].includes(task.status)) {
      throw new HttpsError("failed-precondition", `Cannot edit a ${task.status} task`);
    }
    if (task.status === "published") {
      if (input.taskType !== task.taskType || input.target.scopeKey !== task.target.scopeKey) {
        throw new HttpsError("failed-precondition", "Type and audience are immutable after publication");
      }
      const newVersion = task.version + 1;
      const newScheduleVersion = task.scheduleVersion + 1;
      const dueAt = Timestamp.fromDate(new Date(input.dueAtIso));
      await ref.update({
        title: input.title,
        description: input.description,
        resourceUrl: input.resourceUrl || null,
        dueAt,
        version: newVersion,
        scheduleVersion: newScheduleVersion,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor.uid,
      });
      await propagatePublishedTask(taskId, { ...task, ...input, dueAt, version: newVersion, scheduleVersion: newScheduleVersion });
      await createReminderJobs(taskId, dueAt.toDate(), newScheduleVersion);
    } else {
      await ref.update({ ...toStoredDraft(input, actor), version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
    }
    await writeAudit({ actorUid: actor.uid, action: "task.updated", resourceType: "task", resourceId: taskId, before: task, after: input });
    return { ok: true };
  } catch (error) {
    asHttpsError(error);
  }
});

async function createReminderJobs(taskId: string, dueAt: Date, scheduleVersion: number) {
  const writer = db.bulkWriter();
  for (const job of buildReminderSchedule(dueAt)) {
    const id = `${taskId}_v${scheduleVersion}_${job.stage}`;
    writer.set(db.doc(`reminderJobs/${id}`), {
      taskId,
      scheduleVersion,
      stage: job.stage,
      fireAt: Timestamp.fromDate(job.fireAt),
      status: "scheduled",
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await writer.close();
}

async function propagatePublishedTask(taskId: string, task: StoredTask) {
  const assignments = await db.collection("taskAssignments").where("taskId", "==", taskId).get();
  const writer = db.bulkWriter();
  for (const assignment of assignments.docs) {
    if (assignment.get("status") !== "pending") continue;
    writer.update(assignment.ref, {
      "taskSnapshot.title": task.title,
      "taskSnapshot.dueAt": task.dueAt,
      "taskSnapshot.resourceUrl": task.resourceUrl ?? null,
      taskVersion: task.version,
      updatedAt: FieldValue.serverTimestamp(),
    });
    const notificationId = `task-update-${taskId}-v${task.version}-${assignment.get("uid")}`;
    writer.set(db.doc(`users/${assignment.get("uid")}/notifications/${notificationId}`), {
      type: "deadline_updated",
      title: "Deadline updated",
      body: `${task.title} has new details or a new deadline.`,
      taskId,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
    });
  }
  await writer.close();
}

export const publishTask = onCall({ ...callableOptions, timeoutSeconds: 540 }, async (request) => {
  const actor = await requireActor(request);
  const taskId = requireString((request.data as Record<string, unknown>)?.taskId, "taskId");
  const operationRef = db.doc(`operations/publish_${taskId}`);
  try {
    const { ref, data: task } = await loadTask(taskId);
    requireTaskManager(actor, task.taskType, task.target);
    if (task.status === "published") return { taskId, idempotent: true };
    if (task.status !== "draft" && task.status !== "publishing") {
      throw new HttpsError("failed-precondition", "Only draft tasks can be published");
    }
    const recipients = await eligibleRecipients(task.target);
    if (!recipients.length) throw new HttpsError("failed-precondition", "Task has no eligible recipients");

    const audienceVersion = Math.max(1, task.audienceVersion + 1);
    const scheduleVersion = Math.max(1, task.scheduleVersion + 1);
    await ref.update({ status: "publishing", audienceSyncStatus: "processing", updatedAt: FieldValue.serverTimestamp() });
    await operationRef.set({ type: "publish", taskId, status: "processing", total: recipients.length, actorUid: actor.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    const existingAssignments = await db.collection("taskAssignments").where("taskId", "==", taskId).get();
    const existingUids = new Set(existingAssignments.docs.map((doc) => String(doc.get("uid"))));
    const writer = db.bulkWriter();
    for (const student of recipients) {
      const assignmentId = `${taskId}_${student.uid}`;
      if (!existingUids.has(student.uid)) {
        writer.create(db.doc(`taskAssignments/${assignmentId}`), {
          taskId,
          uid: student.uid,
          taskType: task.taskType,
          scopeKey: task.target.scopeKey,
          sectionId: student.sectionId,
          wingId: student.wingId,
          subjectOfferingId: task.target.subjectOfferingId ?? null,
          status: "pending",
          taskSnapshot: { title: task.title, dueAt: task.dueAt, resourceUrl: task.resourceUrl ?? null, taskStatus: "published" },
          studentSnapshot: { displayName: student.displayName, rollNumber: student.rollNumber },
          taskVersion: task.version,
          audienceVersion,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      writer.set(db.doc(`users/${student.uid}/notifications/publish_${assignmentId}`), {
        type: "task_published",
        title: "New deadline assigned",
        body: `${task.title} has been added to your dashboard.`,
        taskId,
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    await writer.close();
    await createReminderJobs(taskId, task.dueAt.toDate(), scheduleVersion);
    await db.runTransaction(async (tx) => {
      tx.set(db.doc(`taskStats/${taskId}`), {
        eligibleCount: recipients.length,
        pendingCount: recipients.length,
        completedCount: 0,
        exemptCount: 0,
        updatedAt: FieldValue.serverTimestamp(),
        reconciledAt: FieldValue.serverTimestamp(),
      });
      tx.update(ref, {
        status: "published",
        audienceSyncStatus: "ready",
        audienceVersion,
        scheduleVersion,
        publishedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(operationRef, { status: "complete", processed: recipients.length, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    await writeAudit({ actorUid: actor.uid, action: "task.published", resourceType: "task", resourceId: taskId, after: { recipients: recipients.length, audienceVersion, scheduleVersion } });
    return { taskId, recipients: recipients.length };
  } catch (error) {
    await operationRef.set({ status: "failed", error: error instanceof Error ? error.message : "Unknown error", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    asHttpsError(error);
  }
});

async function transitionTask(actor: Actor, taskId: string, status: "closed" | "cancelled", reason?: string) {
  const { ref, data: task } = await loadTask(taskId);
  requireTaskManager(actor, task.taskType, task.target);
  if (task.status !== "published") throw new HttpsError("failed-precondition", "Only published tasks can be closed or cancelled");
  const version = task.version + 1;
  await ref.update({ status, version, [`${status}At`]: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid });
  const assignments = await db.collection("taskAssignments").where("taskId", "==", taskId).get();
  const writer = db.bulkWriter();
  for (const assignment of assignments.docs) {
    writer.update(assignment.ref, { "taskSnapshot.taskStatus": status, taskVersion: version, updatedAt: FieldValue.serverTimestamp() });
    const uid = assignment.get("uid");
    writer.set(db.doc(`users/${uid}/notifications/${status}_${taskId}_${uid}`), {
      type: `task_${status}`,
      title: status === "closed" ? "Task closed" : "Task cancelled",
      body: `${task.title} has been ${status}.`,
      taskId,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
    });
  }
  await writer.close();
  await writeAudit({ actorUid: actor.uid, action: `task.${status}`, resourceType: "task", resourceId: taskId, reason });
  return { ok: true };
}

export const closeTask = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = idSchema.parse(request.data);
    return await transitionTask(actor, input.taskId, "closed", input.reason);
  } catch (error) { asHttpsError(error); }
});

export const cancelTask = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = idSchema.parse(request.data);
    return await transitionTask(actor, input.taskId, "cancelled", input.reason);
  } catch (error) { asHttpsError(error); }
});

export const syncTaskRecipients = onCall({ ...callableOptions, timeoutSeconds: 540 }, async (request) => {
  try {
    const actor = await requireActor(request);
    const taskId = requireString((request.data as Record<string, unknown>)?.taskId, "taskId");
    const { ref, data: task } = await loadTask(taskId);
    requireTaskManager(actor, task.taskType, task.target);
    if (task.status !== "published") throw new HttpsError("failed-precondition", "Only published tasks can sync recipients");
    const eligible = await eligibleRecipients(task.target);
    const eligibleIds = new Set(eligible.map((user) => user.uid));
    const current = await db.collection("taskAssignments").where("taskId", "==", taskId).get();
    const currentIds = new Set(current.docs.map((doc) => String(doc.get("uid"))));
    const audienceVersion = task.audienceVersion + 1;
    const writer = db.bulkWriter();
    let added = 0;
    let exempted = 0;

    for (const student of eligible) {
      if (currentIds.has(student.uid)) continue;
      added += 1;
      writer.create(db.doc(`taskAssignments/${taskId}_${student.uid}`), {
        taskId, uid: student.uid, taskType: task.taskType, scopeKey: task.target.scopeKey,
        sectionId: student.sectionId, wingId: student.wingId, subjectOfferingId: task.target.subjectOfferingId ?? null,
        status: "pending", taskSnapshot: { title: task.title, dueAt: task.dueAt, resourceUrl: task.resourceUrl ?? null, taskStatus: "published" },
        studentSnapshot: { displayName: student.displayName, rollNumber: student.rollNumber },
        taskVersion: task.version, audienceVersion, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    }
    for (const assignment of current.docs) {
      if (eligibleIds.has(String(assignment.get("uid"))) || assignment.get("status") !== "pending") continue;
      exempted += 1;
      writer.update(assignment.ref, { status: "exempt", exemptionReason: "audience_changed", audienceVersion, updatedAt: FieldValue.serverTimestamp() });
    }
    await writer.close();
    await ref.update({ audienceVersion, updatedAt: FieldValue.serverTimestamp() });
    await db.doc(`taskStats/${taskId}`).set({
      eligibleCount: FieldValue.increment(added), pendingCount: FieldValue.increment(added - exempted), exemptCount: FieldValue.increment(exempted), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await writeAudit({ actorUid: actor.uid, action: "task.recipients_synced", resourceType: "task", resourceId: taskId, after: { added, exempted, audienceVersion } });
    return { added, exempted, audienceVersion };
  } catch (error) { asHttpsError(error); }
});
