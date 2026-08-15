import { onCall, HttpsError } from "firebase-functions/v2/https";
import { buildCatchUpReminderSchedule, canMutateCrBoard, crTaskCreateSchema, crTaskUpdateSchema, type CrTaskStatus } from "@mba/domain";
import { ZodError } from "zod";
import { db, FieldValue, Timestamp } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor } from "./helpers.js";

type StoredCrTask = {
  title: string;
  notes: string;
  status: CrTaskStatus;
  dueAt: FirebaseFirestore.Timestamp | null;
  version: number;
  scheduleVersion: number;
};

function requireCr(actor: Awaited<ReturnType<typeof requireActor>>) {
  if (!canMutateCrBoard(actor)) throw new HttpsError("permission-denied", "An active CR role is required");
}

function handleCrTaskError(error: unknown): never {
  if (error instanceof ZodError) {
    throw new HttpsError("invalid-argument", error.issues[0]?.message ?? "Invalid CR task data");
  }
  asHttpsError(error);
}

function taskTimestamp(value: string | null | undefined) {
  return value ? Timestamp.fromDate(new Date(value)) : null;
}

function dueTimesMatch(left: FirebaseFirestore.Timestamp | null, right: FirebaseFirestore.Timestamp | null) {
  return left === right || (left !== null && right !== null && left.toMillis() === right.toMillis());
}

function scheduleJobs(
  tx: FirebaseFirestore.Transaction,
  taskId: string,
  dueAt: FirebaseFirestore.Timestamp,
  scheduleVersion: number,
) {
  const now = new Date();
  const reminders = buildCatchUpReminderSchedule(dueAt.toDate(), now);
  for (const reminder of reminders) {
    const jobId = `crtask_${taskId}_v${scheduleVersion}_${reminder.stage}`;
    tx.set(db.doc(`reminderJobs/${jobId}`), {
      kind: "cr_task",
      crTaskId: taskId,
      scheduleVersion,
      stage: reminder.stage,
      fireAt: Timestamp.fromDate(reminder.fireAt),
      status: "scheduled",
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
}

async function activeCrs() {
  return db.collection("users")
    .where("roles.cr", "==", true)
    .where("status", "==", "active")
    .get();
}

export const createCrTask = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    requireCr(actor);
    const input = crTaskCreateSchema.parse(request.data);
    const taskId = `crtask_${actor.uid}_${input.idempotencyKey}`;
    const taskRef = db.doc(`crTasks/${taskId}`);
    const auditRef = db.collection("auditEvents").doc();
    const dueAt = taskTimestamp(input.dueAtIso);
    const recipients = await activeCrs();

    const created = await db.runTransaction(async (tx) => {
      const existing = await tx.get(taskRef);
      if (existing.exists) return false;
      tx.create(taskRef, {
        title: input.title,
        notes: input.notes,
        status: "assigned",
        dueAt,
        createdBy: actor.uid,
        updatedBy: actor.uid,
        creatorSnapshot: { displayName: actor.displayName, rollNumber: actor.rollNumber },
        version: 1,
        scheduleVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.create(auditRef, {
        actorUid: actor.uid,
        action: "crTask.created",
        resourceType: "crTask",
        resourceId: taskId,
        after: { title: input.title, status: "assigned", dueAtIso: input.dueAtIso || null },
        createdAt: FieldValue.serverTimestamp(),
      });
      if (dueAt) scheduleJobs(tx, taskId, dueAt, 1);
      for (const recipient of recipients.docs) {
        tx.set(recipient.ref.collection("notifications").doc(`cr_task_created_${taskId}_${recipient.id}`), {
          type: "cr_task_created",
          title: "New CR task",
          body: `${actor.displayName} added "${input.title}" to the shared CR Board.`,
          crTaskId: taskId,
          createdAt: FieldValue.serverTimestamp(),
          readAt: null,
        });
      }
      return true;
    });
    return { taskId, idempotent: !created };
  } catch (error) { handleCrTaskError(error); }
});

export const updateCrTask = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    requireCr(actor);
    const input = crTaskUpdateSchema.parse(request.data);
    const taskRef = db.doc(`crTasks/${input.taskId}`);
    const auditRef = db.collection("auditEvents").doc();
    const recipients = await activeCrs();

    const result = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(taskRef);
      if (!snapshot.exists) throw new HttpsError("not-found", "CR task not found");
      const current = snapshot.data() as StoredCrTask;
      if (current.version !== input.expectedVersion) {
        throw new HttpsError("aborted", "This task was changed by another CR. Refresh it before saving again.");
      }

      const nextTitle = input.title ?? current.title;
      const nextNotes = input.notes ?? current.notes;
      const nextStatus = input.status ?? current.status;
      const nextDueAt = input.dueAtIso === undefined ? current.dueAt : taskTimestamp(input.dueAtIso);
      const dueChanged = !dueTimesMatch(current.dueAt, nextDueAt);
      const statusChanged = nextStatus !== current.status;
      const reopenChanged = current.status === "completed" || nextStatus === "completed";
      const scheduleChanged = dueChanged || (statusChanged && reopenChanged);
      const nextScheduleVersion = current.scheduleVersion + (scheduleChanged ? 1 : 0);
      const nextVersion = current.version + 1;
      const update: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
        title: nextTitle,
        notes: nextNotes,
        status: nextStatus,
        dueAt: nextDueAt,
        version: nextVersion,
        scheduleVersion: nextScheduleVersion,
        updatedBy: actor.uid,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (statusChanged && nextStatus === "completed") {
        update.completedAt = FieldValue.serverTimestamp();
        update.completedBy = actor.uid;
      } else if (statusChanged && current.status === "completed") {
        update.completedAt = FieldValue.delete();
        update.completedBy = FieldValue.delete();
      }

      tx.update(taskRef, update);
      tx.create(auditRef, {
        actorUid: actor.uid,
        action: statusChanged && current.status === "completed" ? "crTask.reopened" : statusChanged ? "crTask.statusChanged" : dueChanged ? "crTask.deadlineChanged" : "crTask.updated",
        resourceType: "crTask",
        resourceId: input.taskId,
        before: { title: current.title, notes: current.notes, status: current.status, dueAt: current.dueAt },
        after: { title: nextTitle, notes: nextNotes, status: nextStatus, dueAt: nextDueAt },
        createdAt: FieldValue.serverTimestamp(),
      });
      if (nextStatus !== "completed" && nextDueAt && (dueChanged || (statusChanged && current.status === "completed"))) {
        scheduleJobs(tx, input.taskId, nextDueAt, nextScheduleVersion);
      }
      if (dueChanged) {
        for (const recipient of recipients.docs) {
          tx.set(recipient.ref.collection("notifications").doc(`cr_task_deadline_${input.taskId}_v${nextScheduleVersion}_${recipient.id}`), {
            type: "cr_task_deadline_changed",
            title: "CR task deadline updated",
            body: nextDueAt
              ? `The deadline for "${nextTitle}" was updated.`
              : `The deadline for "${nextTitle}" was removed.`,
            crTaskId: input.taskId,
            createdAt: FieldValue.serverTimestamp(),
            readAt: null,
          });
        }
      }
      return { dueChanged, nextTitle, nextDueAt, version: nextVersion, scheduleVersion: nextScheduleVersion };
    });
    return { taskId: input.taskId, version: result.version };
  } catch (error) { handleCrTaskError(error); }
});
