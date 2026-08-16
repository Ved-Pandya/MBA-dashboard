import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { isGroomingPoc, pollDraftFieldsSchema, pollDraftSchema, pollResponseSchema, type UserProfile } from "@mba/domain";
import { db, FieldValue, Timestamp } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor, writeAudit } from "./helpers.js";

function requirePollManager(actor: UserProfile) {
  if (!actor.roles.systemAdmin && !actor.roles.cr && !isGroomingPoc(actor)) throw new HttpsError("permission-denied", "Grooming POC, CR, or Admin access required");
}

async function activeStudents() {
  const users = await db.collection("users").where("status", "==", "active").limit(2_000).get();
  return users.docs.filter((doc) => doc.get("roles.student") === true);
}

function pollData(input: z.infer<typeof pollDraftSchema>) {
  return { question: input.question, details: input.details, options: input.options, closesAt: Timestamp.fromDate(new Date(input.closesAtIso)), linkedSessionId: input.linkedSessionId || null };
}

async function validateLinkedSession(sessionId: string | undefined) {
  if (!sessionId) return;
  const session = await db.doc(`sessionIntimations/${sessionId}`).get();
  if (!session.exists || session.get("status") === "cancelled") throw new HttpsError("invalid-argument", "Linked session does not exist or is cancelled");
}

export const createGeneralPoll = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requirePollManager(actor); const input = pollDraftSchema.parse(request.data); await validateLinkedSession(input.linkedSessionId || undefined);
    const ref = db.collection("generalPolls").doc();
    await ref.set({ ...pollData(input), status: "draft", ownerUid: actor.uid, version: 1, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await writeAudit({ actorUid: actor.uid, action: "poll.created", resourceType: "generalPoll", resourceId: ref.id, after: input });
    return { pollId: ref.id };
  } catch (error) { asHttpsError(error); }
});

const updateSchema = pollDraftFieldsSchema.extend({ pollId: z.string().min(1).max(200) }).refine((poll) => new Set(poll.options.map((option) => option.id)).size === poll.options.length, { message: "Poll option IDs must be unique", path: ["options"] });
export const updateGeneralPoll = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requirePollManager(actor); const input = updateSchema.parse(request.data); await validateLinkedSession(input.linkedSessionId || undefined); const ref = db.doc(`generalPolls/${input.pollId}`); const before = await ref.get();
    if (!before.exists || before.get("status") !== "draft") throw new HttpsError("failed-precondition", "Only draft polls can be edited");
    const version = Number(before.get("version") ?? 1) + 1; await ref.update({ ...pollData(input), version, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
    await writeAudit({ actorUid: actor.uid, action: "poll.updated", resourceType: "generalPoll", resourceId: ref.id, before: before.data(), after: input });
    return { pollId: ref.id, version };
  } catch (error) { asHttpsError(error); }
});

const pollIdSchema = z.object({ pollId: z.string().min(1).max(200) });
export const publishGeneralPoll = onCall({ ...callableOptions, timeoutSeconds: 120 }, async (request) => {
  try {
    const actor = await requireActor(request); requirePollManager(actor); const { pollId } = pollIdSchema.parse(request.data); const ref = db.doc(`generalPolls/${pollId}`); const poll = await ref.get();
    if (!poll.exists) throw new HttpsError("not-found", "Poll not found");
    if (poll.get("status") === "published") return { pollId, idempotent: true };
    if (poll.get("status") !== "draft") throw new HttpsError("failed-precondition", "Only draft polls can be published");
    if ((poll.get("closesAt") as Timestamp).toMillis() <= Date.now()) throw new HttpsError("failed-precondition", "Poll close time must be in the future");
    const students = await activeStudents(); const writer = db.bulkWriter();
    for (const student of students) {
      writer.set(db.doc(`pollResponses/${pollId}_${student.id}`), { pollId, uid: student.id, status: "no_response", optionId: null, studentSnapshot: { displayName: student.get("displayName"), rollNumber: student.get("rollNumber"), sectionId: student.get("sectionId"), wingId: student.get("wingId") }, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      writer.set(db.doc(`users/${student.id}/notifications/poll_published_${pollId}`), { type: "poll_published", title: "New batch poll", body: String(poll.get("question")), pollId, createdAt: FieldValue.serverTimestamp(), readAt: null }, { merge: true });
    }
    writer.update(ref, { status: "published", publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    writer.set(db.doc(`pollStats/${pollId}`), { eligibleCount: students.length, responseCount: 0, noResponseCount: students.length, optionCounts: {}, updatedAt: FieldValue.serverTimestamp() });
    await writer.close(); await writeAudit({ actorUid: actor.uid, action: "poll.published", resourceType: "generalPoll", resourceId: pollId, after: { recipients: students.length } });
    return { pollId, recipientCount: students.length };
  } catch (error) { asHttpsError(error); }
});

export const setPollResponse = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); const input = pollResponseSchema.parse(request.data); const pollRef = db.doc(`generalPolls/${input.pollId}`); const responseRef = db.doc(`pollResponses/${input.pollId}_${actor.uid}`); const statsRef = db.doc(`pollStats/${input.pollId}`);
    await db.runTransaction(async (tx) => {
      const [poll, response] = await Promise.all([tx.get(pollRef), tx.get(responseRef)]);
      if (!poll.exists || poll.get("status") !== "published" || (poll.get("closesAt") as Timestamp).toMillis() <= Date.now()) throw new HttpsError("failed-precondition", "Poll is closed");
      const options = poll.get("options") as Array<{ id: string }>;
      if (!options.some((option) => option.id === input.optionId)) throw new HttpsError("invalid-argument", "Unknown poll option");
      if (!response.exists) throw new HttpsError("not-found", "Poll response was not assigned to this user");
      const previous = response.get("optionId") as string | null;
      if (previous === input.optionId) return;
      const patch: Record<string, unknown> = { responseCount: FieldValue.increment(previous ? 0 : 1), noResponseCount: FieldValue.increment(previous ? 0 : -1), [`optionCounts.${input.optionId}`]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() };
      if (previous) patch[`optionCounts.${previous}`] = FieldValue.increment(-1);
      tx.update(responseRef, { status: "responded", optionId: input.optionId, respondedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); tx.set(statsRef, patch, { merge: true });
    });
    return { optionId: input.optionId };
  } catch (error) { asHttpsError(error); }
});

export const closeGeneralPoll = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requirePollManager(actor); const { pollId } = pollIdSchema.parse(request.data); const ref = db.doc(`generalPolls/${pollId}`); const before = await ref.get();
    if (!before.exists) throw new HttpsError("not-found", "Poll not found"); if (before.get("status") === "closed") return { idempotent: true }; if (before.get("status") !== "published") throw new HttpsError("failed-precondition", "Only published polls can be closed");
    await ref.update({ status: "closed", closedBy: actor.uid, closedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); await writeAudit({ actorUid: actor.uid, action: "poll.closed", resourceType: "generalPoll", resourceId: pollId, before: before.data() }); return { pollId };
  } catch (error) { asHttpsError(error); }
});

const cancelSchema = pollIdSchema.extend({ reason: z.string().trim().min(3).max(500) });
export const cancelGeneralPoll = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requirePollManager(actor); const input = cancelSchema.parse(request.data); const ref = db.doc(`generalPolls/${input.pollId}`); const before = await ref.get();
    if (!before.exists) throw new HttpsError("not-found", "Poll not found"); if (before.get("status") === "cancelled") return { idempotent: true };
    await ref.update({ status: "cancelled", cancellationReason: input.reason, cancelledBy: actor.uid, cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); await writeAudit({ actorUid: actor.uid, action: "poll.cancelled", resourceType: "generalPoll", resourceId: input.pollId, before: before.data(), reason: input.reason }); return { pollId: input.pollId };
  } catch (error) { asHttpsError(error); }
});

export const getPollReport = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requirePollManager(actor); const { pollId } = pollIdSchema.parse(request.data);
    const [poll, responses, stats] = await Promise.all([db.doc(`generalPolls/${pollId}`).get(), db.collection("pollResponses").where("pollId", "==", pollId).limit(2_000).get(), db.doc(`pollStats/${pollId}`).get()]);
    if (!poll.exists) throw new HttpsError("not-found", "Poll not found"); return { poll: { id: poll.id, ...poll.data() }, stats: stats.data() ?? null, responses: responses.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
  } catch (error) { asHttpsError(error); }
});
