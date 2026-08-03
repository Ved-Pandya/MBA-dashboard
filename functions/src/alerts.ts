import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { notificationCopy, type ReminderStage } from "@mba/domain";
import { adminFunctions, db, FieldValue, Timestamp } from "./firebase.js";

const REGION = "asia-south1";

interface JobPayload { jobId: string }
interface DeliveryPayload { deliveryId: string }

export const scanDueReminderJobs = onSchedule(
  { schedule: "* * * * *", region: REGION, timeZone: "Asia/Kolkata", timeoutSeconds: 120 },
  async () => {
    await db.doc("systemHealth/scheduler").set({ lastSuccessAt: FieldValue.serverTimestamp() }, { merge: true });
    const due = await db.collection("reminderJobs")
      .where("status", "==", "scheduled")
      .where("fireAt", "<=", Timestamp.now())
      .orderBy("fireAt", "asc")
      .limit(100)
      .get();

    const queue = adminFunctions.taskQueue("fanOutReminder");
    for (const snap of due.docs) {
      const claimed = await db.runTransaction(async (tx) => {
        const fresh = await tx.get(snap.ref);
        if (!fresh.exists || fresh.get("status") !== "scheduled") return false;
        tx.update(snap.ref, {
          status: "leased",
          leaseUntil: Timestamp.fromMillis(Date.now() + 10 * 60_000),
          attempts: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
      if (!claimed) continue;
      try {
        await queue.enqueue({ jobId: snap.id } satisfies JobPayload);
      } catch (error) {
        logger.error("Failed to enqueue reminder fan-out", { jobId: snap.id, error });
        await snap.ref.update({ status: "scheduled", lastError: String(error), updatedAt: FieldValue.serverTimestamp() });
      }
    }
  },
);

export const fanOutReminder = onTaskDispatched(
  {
    region: REGION,
    retryConfig: { maxAttempts: 5, minBackoffSeconds: 30, maxBackoffSeconds: 900, maxRetrySeconds: 21_600 },
    rateLimits: { maxConcurrentDispatches: 5 },
  },
  async (request) => {
    const { jobId } = request.data as JobPayload;
    const jobRef = db.doc(`reminderJobs/${jobId}`);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) return;
    const job = jobSnap.data() as { taskId: string; scheduleVersion: number; stage: ReminderStage; status: string };
    if (job.status === "complete") return;
    const taskSnap = await db.doc(`tasks/${job.taskId}`).get();
    if (!taskSnap.exists || taskSnap.get("status") !== "published" || taskSnap.get("scheduleVersion") !== job.scheduleVersion) {
      await jobRef.update({ status: "skipped", skipReason: "stale_or_inactive_task", updatedAt: FieldValue.serverTimestamp() });
      return;
    }

    const assignments = await db.collection("taskAssignments")
      .where("taskId", "==", job.taskId)
      .where("status", "==", "pending")
      .limit(1_000)
      .get();
    const writer = db.bulkWriter();
    const deliveryQueue = adminFunctions.taskQueue("deliverInAppNotification");
    const enqueues: Array<Promise<unknown>> = [];
    for (const assignment of assignments.docs) {
      const uid = String(assignment.get("uid"));
      const deliveryId = `${jobId}_${uid}`;
      writer.set(db.doc(`reminderDeliveries/${deliveryId}`), {
        jobId,
        taskId: job.taskId,
        uid,
        stage: job.stage,
        scheduleVersion: job.scheduleVersion,
        status: "queued",
        attempts: 0,
        nextAttemptAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      enqueues.push(deliveryQueue.enqueue({ deliveryId } satisfies DeliveryPayload));
    }
    await writer.close();
    await Promise.all(enqueues);

    if (job.stage === "minus2h" || job.stage === "overdue15m") {
      const ownerUid = String(taskSnap.get("ownerUid"));
      const ownerNotificationId = `${jobId}_owner_summary`;
      await db.doc(`users/${ownerUid}/notifications/${ownerNotificationId}`).set({
        type: "poc_pending_summary",
        title: job.stage === "minus2h" ? "2-hour compliance summary" : "Overdue compliance summary",
        body: `${assignments.size} students are still pending for ${taskSnap.get("title")}.`,
        taskId: job.taskId,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      });
    }
    await jobRef.update({ status: "complete", recipientCount: assignments.size, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  },
);

export const deliverInAppNotification = onTaskDispatched(
  {
    region: REGION,
    retryConfig: { maxAttempts: 5, minBackoffSeconds: 30, maxBackoffSeconds: 900, maxRetrySeconds: 21_600 },
    rateLimits: { maxConcurrentDispatches: 20 },
  },
  async (request) => {
    const { deliveryId } = request.data as DeliveryPayload;
    const deliveryRef = db.doc(`reminderDeliveries/${deliveryId}`);
    await db.runTransaction(async (tx) => {
      const delivery = await tx.get(deliveryRef);
      if (!delivery.exists || delivery.get("status") === "sent" || delivery.get("status") === "skipped") return;
      const taskId = String(delivery.get("taskId"));
      const uid = String(delivery.get("uid"));
      const assignmentRef = db.doc(`taskAssignments/${taskId}_${uid}`);
      const taskRef = db.doc(`tasks/${taskId}`);
      const [assignment, task] = await Promise.all([tx.get(assignmentRef), tx.get(taskRef)]);
      const eligible = assignment.exists && assignment.get("status") === "pending"
        && task.exists && task.get("status") === "published"
        && task.get("scheduleVersion") === delivery.get("scheduleVersion");
      if (!eligible) {
        tx.update(deliveryRef, { status: "skipped", skipReason: "recipient_no_longer_pending", updatedAt: FieldValue.serverTimestamp() });
        return;
      }
      const copy = notificationCopy(delivery.get("stage") as ReminderStage, String(task.get("title")));
      tx.set(db.doc(`users/${uid}/notifications/${deliveryId}`), {
        type: "deadline_reminder",
        ...copy,
        taskId,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      });
      tx.update(deliveryRef, { status: "sent", sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
  },
);

export const dailyOverdueDigest = onSchedule(
  { schedule: "0 8 * * *", region: REGION, timeZone: "Asia/Kolkata", timeoutSeconds: 300 },
  async () => {
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
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const writer = db.bulkWriter();
    for (const [uid, count] of byUser) {
      writer.set(db.doc(`users/${uid}/notifications/daily_overdue_${day}_${uid}`), {
        type: "daily_overdue_digest",
        title: "Overdue tasks need attention",
        body: `You have ${count} overdue ${count === 1 ? "task" : "tasks"}.`,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      });
    }
    const crs = await db.collection("users").where("roles.cr", "==", true).where("status", "==", "active").get();
    for (const cr of crs.docs) {
      writer.set(db.doc(`users/${cr.id}/notifications/cr_overdue_${day}_${cr.id}`), {
        type: "cr_overdue_digest",
        title: "Batch overdue summary",
        body: `${pending.size} batch assignments remain overdue.`,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      });
    }
    await writer.close();
  },
);

export const reconcileTaskStats = onSchedule(
  { schedule: "0 3 * * *", region: REGION, timeZone: "Asia/Kolkata", timeoutSeconds: 540 },
  async () => {
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
  },
);
