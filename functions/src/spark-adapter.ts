import type { CallableFunction } from "firebase-functions/v2/https";
import { notificationCopy, type ReminderStage } from "@mba/domain";
import { activateMyAccount } from "./account.js";
import { initializeAppConfig, saveSubjectOffering } from "./catalog.js";
import { getComplianceExport, markNotificationsRead, reopenMyCompletion, setMyCompletion, setTaskExemption } from "./completion.js";
import { adminAuth, db, FieldValue, Timestamp } from "./firebase.js";
import { commitRosterImport, updateRoleAssignments, validateRosterImport } from "./roster.js";
import { cancelTask, closeTask, createTask, previewTaskRecipients, publishTask, syncTaskRecipients, updateTask } from "./tasks.js";

const callableHandlers: Record<string, CallableFunction<unknown, unknown>> = {
  activateMyAccount,
  initializeAppConfig,
  saveSubjectOffering,
  validateRosterImport,
  commitRosterImport,
  updateRoleAssignments,
  previewTaskRecipients,
  createTask,
  updateTask,
  publishTask,
  syncTaskRecipients,
  closeTask,
  cancelTask,
  setMyCompletion,
  reopenMyCompletion,
  setTaskExemption,
  markNotificationsRead,
  getComplianceExport,
};

export async function verifySparkIdToken(idToken: string) {
  if (!idToken) throw new Error("Authentication token is required");
  return adminAuth.verifyIdToken(idToken, true);
}

export async function invokeSparkCallable(name: string, data: unknown, idToken: string) {
  const handler = callableHandlers[name];
  if (!handler) {
    const error = new Error("Unknown operation") as Error & { code?: string };
    error.code = "not-found";
    throw error;
  }
  const token = await verifySparkIdToken(idToken);
  return handler.run({
    data,
    auth: { uid: token.uid, token, rawToken: idToken },
    acceptsStreaming: false,
    rawRequest: {} as never,
  });
}

async function claimPulse() {
  const ref = db.doc("systemHealth/sparkRuntime");
  const now = Timestamp.now();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const nextPulseAt = snap.get("nextPulseAt") as Timestamp | undefined;
    if (nextPulseAt && nextPulseAt.toMillis() > now.toMillis()) return false;
    tx.set(ref, {
      nextPulseAt: Timestamp.fromMillis(now.toMillis() + 2 * 60_000),
      lastPulseStartedAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
}

async function deliverReminder(jobId: string, job: { taskId: string; scheduleVersion: number; stage: ReminderStage }) {
  const taskRef = db.doc(`tasks/${job.taskId}`);
  const task = await taskRef.get();
  if (!task.exists || task.get("status") !== "published" || task.get("scheduleVersion") !== job.scheduleVersion) {
    await db.doc(`reminderJobs/${jobId}`).update({
      status: "skipped",
      leaseUntil: FieldValue.delete(),
      skipReason: "stale_or_inactive_task",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return 0;
  }

  const assignments = await db.collection("taskAssignments")
    .where("taskId", "==", job.taskId)
    .where("status", "==", "pending")
    .limit(1_000)
    .get();
  let deliveries = 0;

  for (let index = 0; index < assignments.docs.length; index += 20) {
    const group = assignments.docs.slice(index, index + 20);
    const results = await Promise.all(group.map(async (assignment) => {
      const uid = String(assignment.get("uid"));
      const deliveryId = `${jobId}_${uid}`;
      const deliveryRef = db.doc(`reminderDeliveries/${deliveryId}`);
      const notificationRef = db.doc(`users/${uid}/notifications/${deliveryId}`);
      return db.runTransaction(async (tx) => {
        const [freshAssignment, freshTask, existingDelivery] = await Promise.all([
          tx.get(assignment.ref),
          tx.get(taskRef),
          tx.get(deliveryRef),
        ]);
        if (existingDelivery.exists && ["sent", "skipped"].includes(String(existingDelivery.get("status")))) return false;
        const eligible = freshAssignment.exists
          && freshAssignment.get("status") === "pending"
          && freshTask.exists
          && freshTask.get("status") === "published"
          && freshTask.get("scheduleVersion") === job.scheduleVersion;
        if (!eligible) {
          tx.set(deliveryRef, {
            jobId,
            taskId: job.taskId,
            uid,
            stage: job.stage,
            scheduleVersion: job.scheduleVersion,
            status: "skipped",
            skipReason: "recipient_no_longer_pending",
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          return false;
        }
        const copy = notificationCopy(job.stage, String(freshTask.get("title")));
        tx.set(notificationRef, {
          type: "deadline_reminder",
          ...copy,
          taskId: job.taskId,
          createdAt: FieldValue.serverTimestamp(),
          readAt: null,
        });
        tx.set(deliveryRef, {
          jobId,
          taskId: job.taskId,
          uid,
          stage: job.stage,
          scheduleVersion: job.scheduleVersion,
          status: "sent",
          attempts: FieldValue.increment(1),
          sentAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return true;
      });
    }));
    deliveries += results.filter(Boolean).length;
  }

  if (job.stage === "minus2h" || job.stage === "overdue15m") {
    const ownerUid = String(task.get("ownerUid"));
    await db.doc(`users/${ownerUid}/notifications/${jobId}_owner_summary`).set({
      type: "poc_pending_summary",
      title: job.stage === "minus2h" ? "2-hour compliance summary" : "Overdue compliance summary",
      body: `${assignments.size} students are still pending for ${task.get("title")}.`,
      taskId: job.taskId,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
    }, { merge: true });
  }
  await db.doc(`reminderJobs/${jobId}`).update({
    status: "complete",
    leaseUntil: FieldValue.delete(),
    recipientCount: assignments.size,
    completedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return deliveries;
}

async function processDueReminderJobs() {
  const now = Timestamp.now();
  const [scheduled, abandoned] = await Promise.all([
    db.collection("reminderJobs")
    .where("status", "==", "scheduled")
    .where("fireAt", "<=", now)
    .orderBy("fireAt", "asc")
    .limit(10)
    .get(),
    db.collection("reminderJobs")
      .where("status", "==", "processing")
      .where("leaseUntil", "<=", now)
      .orderBy("leaseUntil", "asc")
      .limit(10)
      .get(),
  ]);
  const due = [...scheduled.docs, ...abandoned.docs]
    .filter((doc, index, all) => all.findIndex((candidate) => candidate.id === doc.id) === index)
    .slice(0, 10);
  let processedJobs = 0;
  let deliveries = 0;
  for (const snap of due) {
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(snap.ref);
      if (!fresh.exists) return false;
      const status = String(fresh.get("status"));
      const leaseUntil = fresh.get("leaseUntil") as Timestamp | undefined;
      const claimable = status === "scheduled"
        || (status === "processing" && Boolean(leaseUntil && leaseUntil.toMillis() <= Date.now()));
      if (!claimable) return false;
      tx.update(snap.ref, {
        status: "processing",
        leaseUntil: Timestamp.fromMillis(Date.now() + 5 * 60_000),
        attempts: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (!claimed) continue;
    try {
      deliveries += await deliverReminder(snap.id, {
        taskId: String(snap.get("taskId")),
        scheduleVersion: Number(snap.get("scheduleVersion")),
        stage: snap.get("stage") as ReminderStage,
      });
      processedJobs += 1;
    } catch (error) {
      await snap.ref.set({
        status: "scheduled",
        leaseUntil: FieldValue.delete(),
        lastError: error instanceof Error ? error.message : String(error),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
  await db.doc("systemHealth/scheduler").set({
    runtime: "vercel-spark",
    lastSuccessAt: FieldValue.serverTimestamp(),
    processedJobs,
    deliveries,
  }, { merge: true });
  return { processedJobs, deliveries };
}

async function createDailyDigests() {
  const pending = await db.collection("taskAssignments")
    .where("status", "==", "pending")
    .where("taskSnapshot.dueAt", "<=", Timestamp.now())
    .limit(5_000)
    .get();
  const byUser = new Map<string, number>();
  for (const assignment of pending.docs) {
    const uid = String(assignment.get("uid"));
    byUser.set(uid, (byUser.get(uid) ?? 0) + 1);
  }
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const writer = db.bulkWriter();
  for (const [uid, count] of byUser) {
    writer.set(db.doc(`users/${uid}/notifications/daily_overdue_${day}_${uid}`), {
      type: "daily_overdue_digest",
      title: "Overdue tasks need attention",
      body: `You have ${count} overdue ${count === 1 ? "task" : "tasks"}.`,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
    }, { merge: true });
  }
  const crs = await db.collection("users").where("roles.cr", "==", true).where("status", "==", "active").get();
  for (const cr of crs.docs) {
    writer.set(db.doc(`users/${cr.id}/notifications/cr_overdue_${day}_${cr.id}`), {
      type: "cr_overdue_digest",
      title: "Batch overdue summary",
      body: `${pending.size} batch assignments remain overdue.`,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
    }, { merge: true });
  }
  await writer.close();
  return byUser.size + crs.size;
}

async function reconcileStats() {
  const tasks = await db.collection("tasks").where("status", "in", ["published", "closed"]).limit(500).get();
  const writer = db.bulkWriter();
  for (const task of tasks.docs) {
    const assignments = await db.collection("taskAssignments").where("taskId", "==", task.id).get();
    const counts = { pending: 0, completed: 0, exempt: 0 };
    assignments.docs.forEach((doc) => { counts[doc.get("status") as keyof typeof counts] += 1; });
    writer.set(db.doc(`taskStats/${task.id}`), {
      eligibleCount: assignments.size,
      pendingCount: counts.pending,
      completedCount: counts.completed,
      exemptCount: counts.exempt,
      updatedAt: FieldValue.serverTimestamp(),
      reconciledAt: FieldValue.serverTimestamp(),
    });
  }
  await writer.close();
  return tasks.size;
}

export async function runSparkMaintenance(mode: "pulse" | "daily" = "pulse") {
  if (mode === "pulse" && !(await claimPulse())) return { skipped: true };
  const reminderResult = await processDueReminderJobs();
  if (mode === "pulse") return reminderResult;
  const [digests, reconciledTasks] = await Promise.all([createDailyDigests(), reconcileStats()]);
  return { ...reminderResult, digests, reconciledTasks };
}
