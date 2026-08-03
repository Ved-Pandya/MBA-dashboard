import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { completionSchema, exemptionSchema, type TaskTarget, type TaskType } from "@mba/domain";
import { db, FieldValue, Timestamp } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor, requireTaskManager, writeAudit } from "./helpers.js";

async function setCompletion(uid: string, taskId: string, status: "completed" | "pending") {
  const assignmentRef = db.doc(`taskAssignments/${taskId}_${uid}`);
  const statsRef = db.doc(`taskStats/${taskId}`);
  const auditRef = db.collection("auditEvents").doc();
  return db.runTransaction(async (tx) => {
    const assignment = await tx.get(assignmentRef);
    if (!assignment.exists) throw new HttpsError("not-found", "Task assignment not found");
    const beforeStatus = assignment.get("status") as string;
    if (beforeStatus === "exempt") throw new HttpsError("failed-precondition", "Exempt assignments cannot be changed by students");
    if (beforeStatus === status) return { idempotent: true };
    const taskStatus = assignment.get("taskSnapshot.taskStatus");
    if (taskStatus !== "published") throw new HttpsError("failed-precondition", "This task is not open");
    const now = Timestamp.now();
    const completed = status === "completed";
    tx.update(assignmentRef, {
      status,
      completedAt: completed ? now : FieldValue.delete(),
      completedBy: completed ? uid : FieldValue.delete(),
      completionMethod: completed ? "self" : FieldValue.delete(),
      completedLate: completed ? now.toMillis() > assignment.get("taskSnapshot.dueAt").toMillis() : FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(statsRef, {
      pendingCount: FieldValue.increment(completed ? -1 : 1),
      completedCount: FieldValue.increment(completed ? 1 : -1),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.create(auditRef, {
      actorUid: uid,
      action: completed ? "assignment.completed" : "assignment.reopened",
      resourceType: "taskAssignment",
      resourceId: assignmentRef.id,
      before: { status: beforeStatus },
      after: { status },
      createdAt: FieldValue.serverTimestamp(),
    });
    return { ok: true };
  });
}

export const setMyCompletion = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = completionSchema.parse(request.data);
    return await setCompletion(actor.uid, input.taskId, "completed");
  } catch (error) { asHttpsError(error); }
});

export const reopenMyCompletion = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = completionSchema.parse(request.data);
    return await setCompletion(actor.uid, input.taskId, "pending");
  } catch (error) { asHttpsError(error); }
});

export const setTaskExemption = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = exemptionSchema.parse(request.data);
    const taskSnap = await db.doc(`tasks/${input.taskId}`).get();
    if (!taskSnap.exists) throw new HttpsError("not-found", "Task not found");
    const task = taskSnap.data() as { taskType: TaskType; target: TaskTarget; status: string };
    requireTaskManager(actor, task.taskType, task.target);
    if (task.status !== "published") throw new HttpsError("failed-precondition", "Only published tasks support exemptions");
    const assignmentRef = db.doc(`taskAssignments/${input.taskId}_${input.uid}`);
    const statsRef = db.doc(`taskStats/${input.taskId}`);
    await db.runTransaction(async (tx) => {
      const assignment = await tx.get(assignmentRef);
      if (!assignment.exists) throw new HttpsError("not-found", "Assignment not found");
      const before = assignment.get("status") as string;
      if (before === "exempt") return;
      tx.update(assignmentRef, { status: "exempt", exemptionReason: input.reason, updatedAt: FieldValue.serverTimestamp() });
      tx.set(statsRef, {
        pendingCount: before === "pending" ? FieldValue.increment(-1) : FieldValue.increment(0),
        completedCount: before === "completed" ? FieldValue.increment(-1) : FieldValue.increment(0),
        exemptCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await writeAudit({ actorUid: actor.uid, action: "assignment.exempted", resourceType: "taskAssignment", resourceId: `${input.taskId}_${input.uid}`, reason: input.reason });
    return { ok: true };
  } catch (error) { asHttpsError(error); }
});

const readSchema = z.object({ notificationIds: z.array(z.string().min(1)).min(1).max(100) });

export const markNotificationsRead = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const { notificationIds } = readSchema.parse(request.data);
    const writer = db.bulkWriter();
    for (const id of notificationIds) {
      writer.set(db.doc(`users/${actor.uid}/notifications/${id}`), { readAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    await writer.close();
    return { updated: notificationIds.length };
  } catch (error) { asHttpsError(error); }
});

const exportSchema = z.object({ taskId: z.string().min(1).optional(), scopeKey: z.string().min(1).optional(), status: z.enum(["pending", "completed", "exempt"]).optional() });

export const getComplianceExport = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = exportSchema.parse(request.data ?? {});
    let query: FirebaseFirestore.Query = db.collection("taskAssignments");
    if (input.taskId) query = query.where("taskId", "==", input.taskId);
    if (input.scopeKey) query = query.where("scopeKey", "==", input.scopeKey);
    if (input.status) query = query.where("status", "==", input.status);
    if (!actor.roles.systemAdmin && !actor.roles.cr) {
      if (!input.scopeKey) throw new HttpsError("invalid-argument", "POC exports require one exact scopeKey");
      const [kind, id] = input.scopeKey.split(":");
      const allowed = kind === "wing" ? actor.scopes.wingPocWings[id ?? ""] : actor.scopes.subjectPocOfferings[id ?? ""];
      if (!allowed) throw new HttpsError("permission-denied", "Scope is outside your role grant");
    }
    const snap = await query.limit(2_000).get();
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = ["taskId,rollNumber,displayName,section,wing,status,completedAt"];
    for (const doc of snap.docs) {
      const data = doc.data();
      rows.push([
        data.taskId, data.studentSnapshot?.rollNumber, data.studentSnapshot?.displayName,
        data.sectionId, data.wingId, data.status, data.completedAt?.toDate?.().toISOString() ?? "",
      ].map(escape).join(","));
    }
    return { csv: rows.join("\n"), count: snap.size };
  } catch (error) { asHttpsError(error); }
});
