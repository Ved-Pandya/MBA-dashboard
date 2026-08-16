import type { CallableFunction } from "firebase-functions/v2/https";
import { notificationCopy, type ReminderStage } from "@mba/domain";
import { activateMyAccount } from "./account.js";
import { createTestAccounts } from "./test-accounts.js";
import { clearTestData, seedTestData } from "./test-data.js";
import { initializeAppConfig, saveSubjectOffering } from "./catalog.js";
import { getComplianceExport, markNotificationsRead, reopenMyCompletion, setMyCompletion, setTaskExemption } from "./completion.js";
import { adminAuth, db, FieldValue, Timestamp } from "./firebase.js";
import { commitRosterImport, updateRoleAssignments, validateRosterImport } from "./roster.js";
import { cancelTask, closeTask, createTask, previewTaskRecipients, publishTask, syncTaskRecipients, updateTask } from "./tasks.js";
import { assignPoc, getPocSetup, migrateWingIds, revokePoc, searchRoleCandidates } from "./governance.js";
import { createCrTask, updateCrTask } from "./cr-tasks.js";
import { mirrorNotificationPushJobs, processPushJobs, registerPushSubscription, removePushSubscription } from "./push.js";
import { cancelAcademicEvent, commitTimetableImport, createAcademicEvent, updateAcademicEvent } from "./academics.js";
import { cancelSessionIntimation, closeSessionIntimation, correctSessionResponse, createSessionIntimation, getSessionReport, publishSessionIntimation, setSessionResponse, updateSessionIntimation } from "./sessions.js";
import { cancelGeneralPoll, closeGeneralPoll, createGeneralPoll, getPollReport, publishGeneralPoll, setPollResponse, updateGeneralPoll } from "./polls.js";
import {
  cancelCompetition, cancelInternship, correctRoundSubmission, createCompetition, createInternship, createNextRound, createTeam,
  deleteDraftTeam, finalizeRound, getCompetitionExport, getWingOpportunityReport,
  markRoundSubmitted, publishCompetition, publishInternship, registerTeam,
  reportTeamMembership, setCompetitionResponse, setInternshipResponse, updateCompetition, updateInternship, updateTeam,
  setCompetitionConfirmation, reopenCompetitionConfirmation, correctCompetitionConfirmation, getCompetitionConfirmationReport, migrateCompetitionConfirmations,
} from "./opportunities.js";

const callableHandlers: Record<string, CallableFunction<unknown, unknown>> = {
  activateMyAccount,
  createTestAccounts,
  seedTestData,
  clearTestData,
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
  getPocSetup,
  searchRoleCandidates,
  assignPoc,
  revokePoc,
  migrateWingIds,
  createCrTask,
  updateCrTask,
  registerPushSubscription,
  removePushSubscription,
  commitTimetableImport,
  createAcademicEvent,
  updateAcademicEvent,
  cancelAcademicEvent,
  createSessionIntimation,
  updateSessionIntimation,
  publishSessionIntimation,
  setSessionResponse,
  closeSessionIntimation,
  cancelSessionIntimation,
  correctSessionResponse,
  getSessionReport,
  createGeneralPoll,
  updateGeneralPoll,
  publishGeneralPoll,
  setPollResponse,
  closeGeneralPoll,
  cancelGeneralPoll,
  getPollReport,
  createCompetition,
  publishCompetition,
  updateCompetition,
  cancelCompetition,
  setCompetitionResponse,
  createTeam,
  updateTeam,
  reportTeamMembership,
  deleteDraftTeam,
  registerTeam,
  createNextRound,
  markRoundSubmitted,
  correctRoundSubmission,
  finalizeRound,
  createInternship,
  publishInternship,
  updateInternship,
  cancelInternship,
  setInternshipResponse,
  getWingOpportunityReport,
  getCompetitionExport,
  setCompetitionConfirmation,
  reopenCompetitionConfirmation,
  correctCompetitionConfirmation,
  getCompetitionConfirmationReport,
  migrateCompetitionConfirmations,
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
  const demoMetadata = task.get("demoSeedId") ? { isTestData: true, demoSeedId: task.get("demoSeedId") } : {};

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
            ...demoMetadata,
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
          ...demoMetadata,
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
          ...demoMetadata,
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
      ...demoMetadata,
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

function crTaskNotificationCopy(stage: ReminderStage, title: string) {
  if (stage === "minus24h") return { title: "CR task due in 24 hours", body: `"${title}" is due tomorrow.` };
  if (stage === "minus2h") return { title: "CR task due in 2 hours", body: `"${title}" needs attention now.` };
  return { title: "CR task overdue", body: `"${title}" is still open after its deadline.` };
}

async function deliverCrTaskReminder(jobId: string, job: { crTaskId: string; scheduleVersion: number; stage: ReminderStage }) {
  const taskRef = db.doc(`crTasks/${job.crTaskId}`);
  const task = await taskRef.get();
  if (!task.exists || task.get("status") === "completed" || Number(task.get("scheduleVersion")) !== job.scheduleVersion) {
    await db.doc(`reminderJobs/${jobId}`).set({
      status: "skipped",
      skipReason: "stale_or_completed_cr_task",
      leaseUntil: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return 0;
  }

  const recipients = await db.collection("users")
    .where("roles.cr", "==", true)
    .where("status", "==", "active")
    .get();
  const demoMetadata = task.get("demoSeedId") ? { isTestData: true, demoSeedId: task.get("demoSeedId") } : {};
  let deliveries = 0;
  for (const recipient of recipients.docs) {
    const deliveryRef = db.doc(`reminderDeliveries/${jobId}_${recipient.id}`);
    const notificationRef = recipient.ref.collection("notifications").doc(`${jobId}_${recipient.id}`);
    const delivered = await db.runTransaction(async (tx) => {
      const [freshTask, freshUser, previous] = await Promise.all([
        tx.get(taskRef),
        tx.get(recipient.ref),
        tx.get(deliveryRef),
      ]);
      if (previous.exists && ["sent", "skipped"].includes(String(previous.get("status")))) return false;
      const eligible = freshTask.exists
        && freshTask.get("status") !== "completed"
        && Number(freshTask.get("scheduleVersion")) === job.scheduleVersion
        && freshUser.exists
        && freshUser.get("status") === "active"
        && freshUser.get("roles.cr") === true;
      if (!eligible) {
        tx.set(deliveryRef, {
          jobId,
          uid: recipient.id,
          status: "skipped",
          skipReason: "recipient_or_cr_task_inactive",
          ...demoMetadata,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return false;
      }
      const copy = crTaskNotificationCopy(job.stage, String(freshTask.get("title")));
      tx.set(notificationRef, {
        type: "cr_task_deadline_reminder",
        ...copy,
        crTaskId: job.crTaskId,
        ...demoMetadata,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
      });
      tx.set(deliveryRef, {
        jobId,
        uid: recipient.id,
        kind: "cr_task",
        crTaskId: job.crTaskId,
        stage: job.stage,
        scheduleVersion: job.scheduleVersion,
        status: "sent",
        attempts: FieldValue.increment(1),
        sentAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ...demoMetadata,
      }, { merge: true });
      return true;
    });
    if (delivered) deliveries += 1;
  }
  await db.doc(`reminderJobs/${jobId}`).set({
    status: "complete",
    recipientCount: recipients.size,
    completedAt: FieldValue.serverTimestamp(),
    leaseUntil: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return deliveries;
}

type OpportunityJob = {
  kind: "competition_registration" | "internship_registration" | "competition_round";
  opportunityId: string;
  title: string;
  scheduleVersion: number;
  stage: ReminderStage;
};

function opportunityNotificationCopy(job: OpportunityJob) {
  const action = job.kind === "competition_round" ? "team submission" : job.kind === "competition_registration" ? "team registration and both form confirmations" : "registration response";
  if (job.stage === "minus24h") return { title: "Deadline in 24 hours", body: `${job.title}: ${action} is due tomorrow.` };
  if (job.stage === "minus2h") return { title: "Deadline in 2 hours", body: `${job.title}: record the ${action} now.` };
  return { title: "Opportunity deadline passed", body: `${job.title}: the ${action} is overdue. Late status will be retained.` };
}

async function deliverSessionReminder(jobId: string, job: { sessionId: string; title: string; scheduleVersion: number; stage: ReminderStage }) {
  const sessionRef = db.doc(`sessionIntimations/${job.sessionId}`); const session = await sessionRef.get();
  if (!session.exists || session.get("status") !== "published" || Number(session.get("scheduleVersion") ?? 1) !== job.scheduleVersion) {
    await db.doc(`reminderJobs/${jobId}`).set({ status: "skipped", skipReason: "stale_or_inactive_session", leaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); return 0;
  }
  const responses = await db.collection("sessionResponses").where("sessionId", "==", job.sessionId).where("status", "==", "no_response").limit(2_000).get(); let deliveries = 0;
  for (const response of responses.docs) {
    const uid = String(response.get("uid")); const deliveryRef = db.doc(`reminderDeliveries/${jobId}_${uid}`); const notificationRef = db.doc(`users/${uid}/notifications/${jobId}_${uid}`);
    const delivered = await db.runTransaction(async (tx) => {
      const [freshSession, freshResponse, user, previous] = await Promise.all([tx.get(sessionRef), tx.get(response.ref), tx.get(db.doc(`users/${uid}`)), tx.get(deliveryRef)]);
      if (previous.exists && ["sent", "skipped"].includes(String(previous.get("status")))) return false;
      const eligible = freshSession.exists && freshSession.get("status") === "published" && Number(freshSession.get("scheduleVersion") ?? 1) === job.scheduleVersion && freshResponse.exists && freshResponse.get("status") === "no_response" && user.exists && user.get("status") === "active";
      if (!eligible) { tx.set(deliveryRef, { jobId, uid, status: "skipped", skipReason: "response_or_session_inactive", updatedAt: FieldValue.serverTimestamp() }, { merge: true }); return false; }
      const copy = job.stage === "minus24h" ? { title: "Session response due in 24 hours", body: `${job.title}: confirm whether you will attend.` } : { title: "Session response due in 2 hours", body: `${job.title}: respond now.` };
      tx.set(notificationRef, { type: "session_response_reminder", ...copy, sessionId: job.sessionId, createdAt: FieldValue.serverTimestamp(), readAt: null });
      tx.set(deliveryRef, { jobId, uid, status: "sent", stage: job.stage, sessionId: job.sessionId, scheduleVersion: job.scheduleVersion, attempts: FieldValue.increment(1), sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); return true;
    });
    if (delivered) deliveries += 1;
  }
  await db.doc(`reminderJobs/${jobId}`).set({ status: "complete", recipientCount: responses.size, completedAt: FieldValue.serverTimestamp(), leaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); return deliveries;
}

async function deliverOpportunityReminder(jobId: string, job: OpportunityJob) {
  const sourceCollection = job.kind === "competition_registration" ? "competitions" : job.kind === "internship_registration" ? "internships" : "competitionRounds";
  const sourceRef = db.doc(`${sourceCollection}/${job.opportunityId}`);
  const source = await sourceRef.get();
  const activeStatus = job.kind === "competition_round" ? "open" : "published";
  if (!source.exists || source.get("status") !== activeStatus || Number(source.get("scheduleVersion") ?? 1) !== job.scheduleVersion) {
    await db.doc(`reminderJobs/${jobId}`).set({ status: "skipped", skipReason: "stale_or_inactive_opportunity", leaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return 0;
  }
  const demoMetadata = source.get("demoSeedId") ? { isTestData: true, demoSeedId: source.get("demoSeedId") } : {};

  const recipientUids = new Set<string>();
  const recipientChecks = new Map<string, FirebaseFirestore.DocumentReference[]>();
  if (job.kind === "competition_registration") {
    const responses = await db.collection("opportunityResponses").where("opportunityId", "==", job.opportunityId).where("status", "in", ["no_response", "team_draft"]).limit(2_000).get();
    responses.docs.forEach((doc) => { const uid = String(doc.get("uid")); recipientUids.add(uid); recipientChecks.set(uid, [doc.ref]); });
  } else if (job.kind === "internship_registration") {
    const responses = await db.collection("internshipResponses").where("internshipId", "==", job.opportunityId).where("status", "==", "no_response").limit(2_000).get();
    responses.docs.forEach((doc) => { const uid = String(doc.get("uid")); recipientUids.add(uid); recipientChecks.set(uid, [doc.ref]); });
  } else {
    const entries = await db.collection("competitionRoundEntries").where("roundId", "==", job.opportunityId).where("submissionStatus", "==", "pending").limit(1_000).get();
    entries.docs.forEach((doc) => ((doc.get("memberUids") as string[]) ?? []).forEach((uid) => {
      recipientUids.add(uid);
      recipientChecks.set(uid, [...(recipientChecks.get(uid) ?? []), doc.ref]);
    }));
  }

  let deliveries = 0;
  for (const uid of recipientUids) {
    const deliveryRef = db.doc(`reminderDeliveries/${jobId}_${uid}`);
    const notificationRef = db.doc(`users/${uid}/notifications/${jobId}_${uid}`);
    const delivered = await db.runTransaction(async (tx) => {
      const checks = recipientChecks.get(uid) ?? [];
      const [freshSource, user, previous, ...freshChecks] = await Promise.all([tx.get(sourceRef), tx.get(db.doc(`users/${uid}`)), tx.get(deliveryRef), ...checks.map((ref) => tx.get(ref))]);
      if (previous.exists && ["sent", "skipped"].includes(String(previous.get("status")))) return false;
      const stillPending = job.kind === "competition_registration"
        ? freshChecks.some((check) => check.exists && ["no_response", "team_draft"].includes(String(check.get("status"))))
        : job.kind === "internship_registration"
          ? freshChecks.some((check) => check.exists && check.get("status") === "no_response")
          : freshChecks.some((check) => check.exists && check.get("submissionStatus") === "pending");
      if (!stillPending || !freshSource.exists || freshSource.get("status") !== activeStatus || Number(freshSource.get("scheduleVersion") ?? 1) !== job.scheduleVersion || !user.exists || user.get("status") === "suspended") {
        tx.set(deliveryRef, { jobId, uid, status: "skipped", skipReason: "recipient_or_source_inactive", ...demoMetadata, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return false;
      }
      const copy = opportunityNotificationCopy(job);
      tx.set(notificationRef, { type: "opportunity_deadline_reminder", ...copy, opportunityKind: job.kind, opportunityId: job.opportunityId, ...demoMetadata, createdAt: FieldValue.serverTimestamp(), readAt: null });
      tx.set(deliveryRef, { jobId, uid, status: "sent", stage: job.stage, opportunityKind: job.kind, opportunityId: job.opportunityId, scheduleVersion: job.scheduleVersion, ...demoMetadata, attempts: FieldValue.increment(1), sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return true;
    });
    if (delivered) deliveries += 1;
  }
  await db.doc(`reminderJobs/${jobId}`).set({ status: "complete", recipientCount: recipientUids.size, completedAt: FieldValue.serverTimestamp(), leaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
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
      const kind = String(snap.get("kind") ?? "task");
      deliveries += kind === "task"
        ? await deliverReminder(snap.id, {
          taskId: String(snap.get("taskId")),
          scheduleVersion: Number(snap.get("scheduleVersion")),
          stage: snap.get("stage") as ReminderStage,
        })
        : kind === "cr_task"
          ? await deliverCrTaskReminder(snap.id, {
            crTaskId: String(snap.get("crTaskId")),
            scheduleVersion: Number(snap.get("scheduleVersion")),
            stage: snap.get("stage") as ReminderStage,
          })
        : kind === "session_response"
          ? await deliverSessionReminder(snap.id, {
            sessionId: String(snap.get("sessionId")),
            title: String(snap.get("title")),
            scheduleVersion: Number(snap.get("scheduleVersion")),
            stage: snap.get("stage") as ReminderStage,
          })
        : await deliverOpportunityReminder(snap.id, {
          kind: kind as OpportunityJob["kind"],
          opportunityId: String(snap.get("opportunityId")),
          title: String(snap.get("title")),
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

async function reconcileOpportunityStats() {
  const [competitions, internships, rounds] = await Promise.all([
    db.collection("competitions").where("status", "in", ["published", "in_progress", "completed"]).limit(250).get(),
    db.collection("internships").where("status", "in", ["published", "completed"]).limit(250).get(),
    db.collection("competitionRounds").where("status", "in", ["open", "finalized"]).limit(500).get(),
  ]);
  const writer = db.bulkWriter();
  for (const competition of competitions.docs) {
    const [responses, teams] = await Promise.all([
      db.collection("opportunityResponses").where("opportunityId", "==", competition.id).get(),
      db.collection("competitionTeams").where("competitionId", "==", competition.id).get(),
    ]);
    const statuses = { no_response: 0, team_draft: 0, registered: 0, not_participating: 0 };
    responses.docs.forEach((doc) => { const key = String(doc.get("status")) as keyof typeof statuses; if (key in statuses) statuses[key] += 1; });
    writer.set(db.doc(`competitionStats/${competition.id}`), { ...statuses, responseCount: responses.size, draftTeamCount: teams.docs.filter((doc) => doc.get("status") === "draft").length, registeredTeamCount: teams.docs.filter((doc) => doc.get("status") === "registered").length, reconciledAt: FieldValue.serverTimestamp() });
  }
  for (const internship of internships.docs) {
    const responses = await db.collection("internshipResponses").where("internshipId", "==", internship.id).get();
    const statuses = { no_response: 0, registered: 0, not_participating: 0, lateRegistered: 0 };
    responses.docs.forEach((doc) => { const key = String(doc.get("status")); if (key === "no_response" || key === "registered" || key === "not_participating") statuses[key] += 1; if (doc.get("registeredLate") === true) statuses.lateRegistered += 1; });
    writer.set(db.doc(`internshipStats/${internship.id}`), { ...statuses, responseCount: responses.size, reconciledAt: FieldValue.serverTimestamp() });
  }
  for (const round of rounds.docs) {
    const entries = await db.collection("competitionRoundEntries").where("roundId", "==", round.id).get();
    writer.set(db.doc(`competitionRoundStats/${round.id}`), { eligibleTeamCount: entries.size, pendingTeamCount: entries.docs.filter((doc) => doc.get("submissionStatus") === "pending").length, submittedTeamCount: entries.docs.filter((doc) => doc.get("submissionStatus") === "submitted").length, lateTeamCount: entries.docs.filter((doc) => doc.get("submittedLate") === true).length, reconciledAt: FieldValue.serverTimestamp() });
  }
  await writer.close();
  return competitions.size + internships.size + rounds.size;
}

export async function runSparkMaintenance(mode: "pulse" | "daily" = "pulse") {
  if (mode === "pulse" && !(await claimPulse())) return { skipped: true };
  try {
    const reminderResult = await processDueReminderJobs();
    const mirroredPushJobs = await mirrorNotificationPushJobs();
    const push = await processPushJobs();
    if (mode === "pulse") return { ...reminderResult, mirroredPushJobs, push };
    const [digests, reconciledTasks, reconciledOpportunities] = await Promise.all([createDailyDigests(), reconcileStats(), reconcileOpportunityStats()]);
    return { ...reminderResult, mirroredPushJobs, push, digests, reconciledTasks, reconciledOpportunities };
  } catch (error) {
    const healthFailure = {
      lastFailureAt: FieldValue.serverTimestamp(),
      lastFailureReason: "Maintenance invocation failed; inspect Vercel logs.",
      updatedAt: FieldValue.serverTimestamp(),
    };
    await Promise.all([
      db.doc("systemHealth/scheduler").set(healthFailure, { merge: true }),
      db.doc("systemHealth/push").set(healthFailure, { merge: true }),
    ]);
    throw error;
  }
}
