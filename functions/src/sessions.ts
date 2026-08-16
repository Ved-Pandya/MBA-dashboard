import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { buildCatchUpReminderSchedule, isWingPoc, sessionCorrectionSchema, sessionIntimationFieldsSchema, sessionIntimationSchema, sessionResponseSchema, type UserProfile } from "@mba/domain";
import { db, FieldValue, Timestamp } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor, writeAudit } from "./helpers.js";

function requireSessionManager(actor: UserProfile) {
  if (!actor.roles.systemAdmin && !actor.roles.cr && !isWingPoc(actor)) throw new HttpsError("permission-denied", "CR, Admin, or Wing POC access required");
}

async function activeStudents() {
  const users = await db.collection("users").where("status", "==", "active").limit(2_000).get();
  return users.docs.filter((doc) => doc.get("roles.student") === true);
}

function sessionData(input: z.infer<typeof sessionIntimationSchema>) {
  return {
    title: input.title,
    details: input.details,
    venue: input.venue || null,
    sessionStartsAt: Timestamp.fromDate(new Date(input.sessionStartsAtIso)),
    responseDeadline: Timestamp.fromDate(new Date(input.responseDeadlineIso)),
  };
}

async function createSessionReminderJobs(sessionId: string, title: string, deadline: Date, scheduleVersion: number) {
  const writer = db.bulkWriter();
  for (const reminder of buildCatchUpReminderSchedule(deadline).filter((item) => item.stage === "minus24h" || item.stage === "minus2h")) {
    const id = `session_response_${sessionId}_v${scheduleVersion}_${reminder.stage}`;
    writer.set(db.doc(`reminderJobs/${id}`), {
      kind: "session_response", sessionId, title, scheduleVersion, stage: reminder.stage,
      fireAt: Timestamp.fromDate(reminder.fireAt), status: "scheduled", attempts: 0,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await writer.close();
}

export const createSessionIntimation = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requireSessionManager(actor);
    const input = sessionIntimationSchema.parse(request.data);
    const ref = db.collection("sessionIntimations").doc();
    await ref.set({ ...sessionData(input), audience: { kind: "batch" }, status: "draft", ownerUid: actor.uid, version: 1, scheduleVersion: 1, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await writeAudit({ actorUid: actor.uid, action: "session.created", resourceType: "sessionIntimation", resourceId: ref.id, after: input });
    return { sessionId: ref.id };
  } catch (error) { asHttpsError(error); }
});

const updateSchema = sessionIntimationFieldsSchema.extend({ sessionId: z.string().min(1).max(200) }).refine((value) => new Date(value.responseDeadlineIso).getTime() <= new Date(value.sessionStartsAtIso).getTime(), { message: "The response deadline must not be after the session starts", path: ["responseDeadlineIso"] });

export const updateSessionIntimation = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requireSessionManager(actor);
    const input = updateSchema.parse(request.data);
    const ref = db.doc(`sessionIntimations/${input.sessionId}`);
    const before = await ref.get();
    if (!before.exists || !["draft", "published"].includes(String(before.get("status")))) throw new HttpsError("failed-precondition", "Session cannot be edited");
    const version = Number(before.get("version") ?? 1) + 1;
    const scheduleVersion = Number(before.get("scheduleVersion") ?? 1) + 1;
    await ref.update({ ...sessionData(input), version, scheduleVersion, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
    if (before.get("status") === "published") {
      await createSessionReminderJobs(ref.id, input.title, new Date(input.responseDeadlineIso), scheduleVersion);
      const responses = await db.collection("sessionResponses").where("sessionId", "==", ref.id).get();
      const writer = db.bulkWriter();
      for (const response of responses.docs) writer.set(db.doc(`users/${response.get("uid")}/notifications/session_changed_${ref.id}_v${version}`), { type: "session_changed", title: input.title, body: "Session details or response deadline changed.", sessionId: ref.id, createdAt: FieldValue.serverTimestamp(), readAt: null }, { merge: true });
      await writer.close();
    }
    await writeAudit({ actorUid: actor.uid, action: "session.updated", resourceType: "sessionIntimation", resourceId: ref.id, before: before.data(), after: input });
    return { sessionId: ref.id, version };
  } catch (error) { asHttpsError(error); }
});

const sessionIdSchema = z.object({ sessionId: z.string().min(1).max(200) });

export const publishSessionIntimation = onCall({ ...callableOptions, timeoutSeconds: 120 }, async (request) => {
  try {
    const actor = await requireActor(request); requireSessionManager(actor);
    const { sessionId } = sessionIdSchema.parse(request.data);
    const ref = db.doc(`sessionIntimations/${sessionId}`);
    const session = await ref.get();
    if (!session.exists) throw new HttpsError("not-found", "Session not found");
    if (session.get("status") === "published") return { sessionId, idempotent: true };
    if (session.get("status") !== "draft") throw new HttpsError("failed-precondition", "Only draft sessions can be published");
    if ((session.get("responseDeadline") as Timestamp).toMillis() <= Date.now()) throw new HttpsError("failed-precondition", "Response deadline must be in the future");
    const students = await activeStudents();
    if (!students.length) throw new HttpsError("failed-precondition", "No active students found");
    const writer = db.bulkWriter();
    for (const student of students) {
      writer.set(db.doc(`sessionResponses/${sessionId}_${student.id}`), {
        sessionId, uid: student.id, status: "no_response",
        studentSnapshot: { displayName: student.get("displayName"), rollNumber: student.get("rollNumber"), sectionId: student.get("sectionId"), wingId: student.get("wingId") },
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      writer.set(db.doc(`users/${student.id}/notifications/session_published_${sessionId}`), { type: "session_published", title: String(session.get("title")), body: "Please confirm whether you will attend before the response deadline.", sessionId, createdAt: FieldValue.serverTimestamp(), readAt: null }, { merge: true });
    }
    writer.update(ref, { status: "published", publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    writer.set(db.doc(`sessionStats/${sessionId}`), { eligibleCount: students.length, noResponseCount: students.length, attendingCount: 0, notAttendingCount: 0, updatedAt: FieldValue.serverTimestamp() });
    await writer.close();
    await createSessionReminderJobs(sessionId, String(session.get("title")), (session.get("responseDeadline") as Timestamp).toDate(), Number(session.get("scheduleVersion") ?? 1));
    await writeAudit({ actorUid: actor.uid, action: "session.published", resourceType: "sessionIntimation", resourceId: sessionId, after: { recipients: students.length } });
    return { sessionId, recipientCount: students.length };
  } catch (error) { asHttpsError(error); }
});

async function changeResponse(sessionId: string, uid: string, status: "attending" | "not_attending", actorUid: string, correctionReason?: string) {
  const sessionRef = db.doc(`sessionIntimations/${sessionId}`);
  const responseRef = db.doc(`sessionResponses/${sessionId}_${uid}`);
  const statsRef = db.doc(`sessionStats/${sessionId}`);
  return db.runTransaction(async (tx) => {
    const [session, response] = await Promise.all([tx.get(sessionRef), tx.get(responseRef)]);
    if (!session.exists || session.get("status") !== "published") throw new HttpsError("failed-precondition", "Session is not accepting responses");
    if (!correctionReason && (session.get("responseDeadline") as Timestamp).toMillis() <= Date.now()) throw new HttpsError("deadline-exceeded", "The response deadline has passed");
    if (!response.exists) throw new HttpsError("not-found", "Session response not found");
    const previous = String(response.get("status"));
    if (previous === status) return false;
    const counterPatch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    const counterName = (value: string) => value === "no_response" ? "noResponseCount" : value === "attending" ? "attendingCount" : "notAttendingCount";
    counterPatch[counterName(previous)] = FieldValue.increment(-1);
    counterPatch[counterName(status)] = FieldValue.increment(1);
    tx.update(responseRef, { status, respondedAt: FieldValue.serverTimestamp(), ...(correctionReason ? { correctedBy: actorUid, correctionReason } : {}), updatedAt: FieldValue.serverTimestamp() });
    tx.set(statsRef, counterPatch, { merge: true });
    return true;
  });
}

export const setSessionResponse = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = sessionResponseSchema.parse(request.data);
    await changeResponse(input.sessionId, actor.uid, input.status, actor.uid);
    return { status: input.status };
  } catch (error) { asHttpsError(error); }
});

export const correctSessionResponse = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requireSessionManager(actor);
    const input = sessionCorrectionSchema.parse(request.data);
    await changeResponse(input.sessionId, input.uid, input.status, actor.uid, input.reason);
    await writeAudit({ actorUid: actor.uid, action: "session.response_corrected", resourceType: "sessionResponse", resourceId: `${input.sessionId}_${input.uid}`, after: { status: input.status }, reason: input.reason });
    return { status: input.status };
  } catch (error) { asHttpsError(error); }
});

const reasonSchema = sessionIdSchema.extend({ reason: z.string().trim().min(3).max(500) });

export const closeSessionIntimation = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requireSessionManager(actor);
    const { sessionId } = sessionIdSchema.parse(request.data);
    const ref = db.doc(`sessionIntimations/${sessionId}`); const before = await ref.get();
    if (!before.exists) throw new HttpsError("not-found", "Session not found");
    if (before.get("status") === "closed") return { idempotent: true };
    if (before.get("status") !== "published") throw new HttpsError("failed-precondition", "Only published sessions can be closed");
    await ref.update({ status: "closed", scheduleVersion: FieldValue.increment(1), closedBy: actor.uid, closedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await writeAudit({ actorUid: actor.uid, action: "session.closed", resourceType: "sessionIntimation", resourceId: sessionId, before: before.data() });
    return { sessionId };
  } catch (error) { asHttpsError(error); }
});

export const cancelSessionIntimation = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requireSessionManager(actor);
    const input = reasonSchema.parse(request.data); const ref = db.doc(`sessionIntimations/${input.sessionId}`); const before = await ref.get();
    if (!before.exists) throw new HttpsError("not-found", "Session not found");
    if (before.get("status") === "cancelled") return { idempotent: true };
    await ref.update({ status: "cancelled", scheduleVersion: FieldValue.increment(1), cancellationReason: input.reason, cancelledBy: actor.uid, cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    const responses = await db.collection("sessionResponses").where("sessionId", "==", input.sessionId).get(); const writer = db.bulkWriter();
    for (const response of responses.docs) writer.set(db.doc(`users/${response.get("uid")}/notifications/session_cancelled_${input.sessionId}`), { type: "session_cancelled", title: String(before.get("title")), body: `Cancelled: ${input.reason}`, sessionId: input.sessionId, createdAt: FieldValue.serverTimestamp(), readAt: null }, { merge: true });
    await writer.close();
    await writeAudit({ actorUid: actor.uid, action: "session.cancelled", resourceType: "sessionIntimation", resourceId: input.sessionId, before: before.data(), reason: input.reason });
    return { sessionId: input.sessionId };
  } catch (error) { asHttpsError(error); }
});

export const getSessionReport = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requireSessionManager(actor);
    const { sessionId } = sessionIdSchema.parse(request.data);
    const [session, responses] = await Promise.all([db.doc(`sessionIntimations/${sessionId}`).get(), db.collection("sessionResponses").where("sessionId", "==", sessionId).limit(2_000).get()]);
    if (!session.exists) throw new HttpsError("not-found", "Session not found");
    return { session: { id: session.id, ...session.data() }, responses: responses.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
  } catch (error) { asHttpsError(error); }
});
