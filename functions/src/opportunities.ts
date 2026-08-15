import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import {
  buildReminderSchedule,
  competitionDraftSchema,
  competitionRoundSchema,
  internshipDraftSchema,
  internshipResponseSchema,
  opportunityResponseSchema,
  teamDraftSchema,
  type UserProfile,
} from "@mba/domain";
import { db, FieldValue, Timestamp } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor, writeAudit, type Actor } from "./helpers.js";

function requireOpportunityManager(actor: UserProfile) {
  if (!actor.roles.systemAdmin && !actor.roles.cr) throw new HttpsError("permission-denied", "Admin or CR access required");
}

function cleanName(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100);
}

async function notifyUsers(uids: string[], id: string, payload: Record<string, unknown>) {
  const writer = db.bulkWriter();
  for (const uid of [...new Set(uids)]) writer.set(db.doc(`users/${uid}/notifications/${id}`), {
    ...payload, createdAt: FieldValue.serverTimestamp(), readAt: null,
  }, { merge: true });
  await writer.close();
}

async function activeStudents() {
  const snap = await db.collection("users").where("status", "in", ["active", "invited"]).limit(2_000).get();
  return snap.docs.filter((doc) => doc.get("roles.student") === true);
}

async function createOpportunityReminderJobs(input: {
  kind: "competition_registration" | "internship_registration" | "competition_round";
  opportunityId: string;
  title: string;
  deadline: Date;
  scheduleVersion: number;
}) {
  const writer = db.bulkWriter();
  for (const scheduled of buildReminderSchedule(input.deadline)) {
    const id = `${input.kind}_${input.opportunityId}_v${input.scheduleVersion}_${scheduled.stage}`;
    writer.set(db.doc(`reminderJobs/${id}`), {
      kind: input.kind,
      opportunityId: input.opportunityId,
      title: input.title,
      scheduleVersion: input.scheduleVersion,
      stage: scheduled.stage,
      fireAt: Timestamp.fromDate(scheduled.fireAt),
      status: "scheduled",
      attempts: 0,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await writer.close();
}

export const createCompetition = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    requireOpportunityManager(actor);
    const input = competitionDraftSchema.parse(request.data);
    const ref = db.collection("competitions").doc();
    await ref.set({
      title: input.title,
      organizer: input.organizer,
      description: input.description,
      minTeamSize: input.minTeamSize,
      maxTeamSize: input.maxTeamSize,
      registrationUrl: input.registrationUrl || null,
      registrationDeadline: Timestamp.fromDate(new Date(input.registrationDeadlineIso)),
      status: "draft",
      ownerUid: actor.uid,
      version: 1,
      scheduleVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await writeAudit({ actorUid: actor.uid, action: "competition.created", resourceType: "competition", resourceId: ref.id, after: input });
    return { competitionId: ref.id };
  } catch (error) { asHttpsError(error); }
});

const idSchema = z.object({ competitionId: z.string().min(1) });

export const publishCompetition = onCall({ ...callableOptions, timeoutSeconds: 120 }, async (request) => {
  try {
    const actor = await requireActor(request);
    requireOpportunityManager(actor);
    const { competitionId } = idSchema.parse(request.data);
    const ref = db.doc(`competitions/${competitionId}`);
    const competition = await ref.get();
    if (!competition.exists) throw new HttpsError("not-found", "Competition not found");
    if (competition.get("status") === "published") return { competitionId, idempotent: true };
    if (competition.get("status") !== "draft") throw new HttpsError("failed-precondition", "Only draft competitions can be published");
    const students = await activeStudents();
    if (!students.length) throw new HttpsError("failed-precondition", "The roster has no eligible students");
    const writer = db.bulkWriter();
    for (const student of students) {
      writer.set(db.doc(`opportunityResponses/${competitionId}_${student.id}`), {
        opportunityId: competitionId,
        uid: student.id,
        sectionId: student.get("sectionId"),
        wingId: student.get("wingId"),
        status: "no_response",
        studentSnapshot: { displayName: student.get("displayName"), rollNumber: student.get("rollNumber") },
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      writer.set(db.doc(`users/${student.id}/notifications/competition_published_${competitionId}`), {
        type: "competition_published", title: String(competition.get("title")), body: "Choose a team or mark that you are not participating.", competitionId, createdAt: FieldValue.serverTimestamp(), readAt: null,
      }, { merge: true });
    }
    writer.update(ref, { status: "published", publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await writer.close();
    await createOpportunityReminderJobs({ kind: "competition_registration", opportunityId: competitionId, title: String(competition.get("title")), deadline: (competition.get("registrationDeadline") as Timestamp).toDate(), scheduleVersion: Number(competition.get("scheduleVersion") ?? 1) });
    await writeAudit({ actorUid: actor.uid, action: "competition.published", resourceType: "competition", resourceId: competitionId, after: { recipients: students.length } });
    return { competitionId, recipientCount: students.length };
  } catch (error) { asHttpsError(error); }
});

const updateCompetitionSchema = z.intersection(competitionDraftSchema, z.object({ competitionId: z.string().min(1) }));
const cancelOpportunitySchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const updateCompetition = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requireOpportunityManager(actor);
    const input = updateCompetitionSchema.parse(request.data);
    const ref = db.doc(`competitions/${input.competitionId}`);
    const before = await ref.get();
    if (!before.exists || !["draft", "published"].includes(String(before.get("status")))) throw new HttpsError("failed-precondition", "Competition cannot be edited in its current state");
    const teams = await db.collection("competitionTeams").where("competitionId", "==", input.competitionId).where("status", "in", ["draft", "registered"]).get();
    const largestTeam = Math.max(0, ...teams.docs.map((team) => Number((team.get("memberUids") as string[])?.length ?? 0)));
    if (input.maxTeamSize < largestTeam) throw new HttpsError("failed-precondition", `Maximum team size cannot be below the existing team size of ${largestTeam}`);
    const version = Number(before.get("version") ?? 1) + 1;
    const scheduleVersion = Number(before.get("scheduleVersion") ?? 1) + 1;
    const deadline = Timestamp.fromDate(new Date(input.registrationDeadlineIso));
    await ref.update({ title: input.title, organizer: input.organizer, description: input.description, registrationUrl: input.registrationUrl || null, registrationDeadline: deadline, minTeamSize: input.minTeamSize, maxTeamSize: input.maxTeamSize, version, scheduleVersion, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
    if (before.get("status") === "published") {
      const responses = await db.collection("opportunityResponses").where("opportunityId", "==", input.competitionId).get();
      await notifyUsers(responses.docs.map((doc) => String(doc.get("uid"))), `competition_changed_${input.competitionId}_v${version}`, { type: "competition_changed", title: input.title, body: "Competition details or registration deadline changed.", competitionId: input.competitionId });
      await createOpportunityReminderJobs({ kind: "competition_registration", opportunityId: input.competitionId, title: input.title, deadline: deadline.toDate(), scheduleVersion });
    }
    await writeAudit({ actorUid: actor.uid, action: "competition.updated", resourceType: "competition", resourceId: input.competitionId, before: before.data(), after: input });
    return { competitionId: input.competitionId, version };
  } catch (error) { asHttpsError(error); }
});

export const cancelCompetition = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requireOpportunityManager(actor);
    const input = idSchema.merge(cancelOpportunitySchema).parse(request.data);
    const ref = db.doc(`competitions/${input.competitionId}`);
    const before = await ref.get();
    if (!before.exists) throw new HttpsError("not-found", "Competition not found");
    if (before.get("status") === "cancelled") return { idempotent: true };
    await ref.update({ status: "cancelled", cancellationReason: input.reason, scheduleVersion: FieldValue.increment(1), cancelledBy: actor.uid, cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    const responses = await db.collection("opportunityResponses").where("opportunityId", "==", input.competitionId).get();
    await notifyUsers(responses.docs.map((doc) => String(doc.get("uid"))), `competition_cancelled_${input.competitionId}`, { type: "competition_cancelled", title: String(before.get("title")), body: `Cancelled: ${input.reason}`, competitionId: input.competitionId });
    await writeAudit({ actorUid: actor.uid, action: "competition.cancelled", resourceType: "competition", resourceId: input.competitionId, before: before.data(), reason: input.reason });
    return { competitionId: input.competitionId };
  } catch (error) { asHttpsError(error); }
});

export const setCompetitionResponse = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = opportunityResponseSchema.parse(request.data);
    const competition = await db.doc(`competitions/${input.opportunityId}`).get();
    if (!competition.exists || competition.get("status") !== "published") throw new HttpsError("failed-precondition", "Competition is not accepting responses");
    const membership = await db.doc(`competitionMemberships/${input.opportunityId}_${actor.uid}`).get();
    if (membership.exists && membership.get("active") !== false) throw new HttpsError("failed-precondition", "Leave or delete your draft team before opting out");
    await db.doc(`opportunityResponses/${input.opportunityId}_${actor.uid}`).set({
      opportunityId: input.opportunityId, uid: actor.uid, sectionId: actor.sectionId, wingId: actor.wingId,
      status: "not_participating", respondedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      studentSnapshot: { displayName: actor.displayName, rollNumber: actor.rollNumber },
    }, { merge: true });
    await writeAudit({ actorUid: actor.uid, action: "competition.response_set", resourceType: "competition", resourceId: input.opportunityId, after: { status: input.status } });
    return { status: input.status };
  } catch (error) { asHttpsError(error); }
});

async function resolveMembers(actor: Actor, rollNumbers: string[]) {
  if (!rollNumbers.includes(actor.rollNumber)) throw new HttpsError("invalid-argument", "The captain must be a team member");
  const users = await activeStudents();
  const byRoll = new Map(users.map((doc) => [String(doc.get("rollNumber")), doc]));
  const members = rollNumbers.map((roll) => byRoll.get(roll));
  const missing = rollNumbers.filter((_, index) => !members[index]);
  if (missing.length) throw new HttpsError("not-found", `Roster members not found: ${missing.join(", ")}`);
  return members.map((doc) => ({
    uid: doc!.id,
    displayName: String(doc!.get("displayName")),
    rollNumber: String(doc!.get("rollNumber")),
    sectionId: String(doc!.get("sectionId")),
    wingId: String(doc!.get("wingId")),
  }));
}

export const createTeam = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = teamDraftSchema.parse(request.data);
    const competitionRef = db.doc(`competitions/${input.competitionId}`);
    const competition = await competitionRef.get();
    if (!competition.exists || competition.get("status") !== "published") throw new HttpsError("failed-precondition", "Competition is not accepting teams");
    const members = await resolveMembers(actor, input.memberRollNumbers);
    if (members.length > Number(competition.get("maxTeamSize"))) throw new HttpsError("invalid-argument", "Team exceeds the competition maximum size");
    const teamRef = db.collection("competitionTeams").doc();
    const nameRef = db.doc(`competitionTeamNames/${input.competitionId}_${cleanName(input.name)}`);
    const memberRefs = members.map((member) => db.doc(`competitionMemberships/${input.competitionId}_${member.uid}`));
    await db.runTransaction(async (tx) => {
      const [name, ...reservations] = await Promise.all([tx.get(nameRef), ...memberRefs.map((ref) => tx.get(ref))]);
      if (name.exists && name.get("active") !== false) throw new HttpsError("already-exists", "That team name is already in use");
      const unavailable = reservations.find((reservation) => reservation.exists && reservation.get("active") !== false);
      if (unavailable) throw new HttpsError("already-exists", "One or more students already belong to another team in this competition");
      tx.set(teamRef, {
        competitionId: input.competitionId, name: input.name, normalizedName: cleanName(input.name), captainUid: actor.uid,
        members, memberUids: members.map((member) => member.uid), status: "draft", version: 1,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(nameRef, { competitionId: input.competitionId, teamId: teamRef.id, active: true });
      members.forEach((member, index) => tx.set(memberRefs[index]!, { competitionId: input.competitionId, teamId: teamRef.id, uid: member.uid, active: true, status: "draft", createdAt: FieldValue.serverTimestamp() }));
      members.forEach((member) => tx.set(db.doc(`opportunityResponses/${input.competitionId}_${member.uid}`), { status: "team_draft", teamId: teamRef.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
    });
    await notifyUsers(members.map((member) => member.uid), `team_created_${teamRef.id}`, { type: "team_created", title: input.name, body: `${actor.displayName} added you to this competition team.`, competitionId: input.competitionId, teamId: teamRef.id });
    await writeAudit({ actorUid: actor.uid, action: "competition_team.created", resourceType: "competitionTeam", resourceId: teamRef.id, after: { ...input, memberUids: members.map((member) => member.uid) } });
    return { teamId: teamRef.id };
  } catch (error) { asHttpsError(error); }
});

const updateTeamSchema = z.intersection(teamDraftSchema, z.object({ teamId: z.string().min(1) }));

export const updateTeam = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = updateTeamSchema.parse(request.data);
    const teamRef = db.doc(`competitionTeams/${input.teamId}`);
    const before = await teamRef.get();
    if (!before.exists || before.get("status") !== "draft") throw new HttpsError("failed-precondition", "Only draft teams can be edited");
    if (before.get("captainUid") !== actor.uid) throw new HttpsError("permission-denied", "Only the team captain can edit this team");
    if (before.get("competitionId") !== input.competitionId) throw new HttpsError("invalid-argument", "Competition cannot be changed");
    const members = await resolveMembers(actor, input.memberRollNumbers);
    const competition = await db.doc(`competitions/${input.competitionId}`).get();
    if (!competition.exists || members.length > Number(competition.get("maxTeamSize"))) throw new HttpsError("invalid-argument", "Team exceeds the competition maximum size");
    const oldMembers = (before.get("members") as Array<{ uid: string }>) ?? [];
    const oldUids = oldMembers.map((member) => member.uid);
    const newUids = members.map((member) => member.uid);
    const allRefs = [...new Set([...oldUids, ...newUids])].map((uid) => db.doc(`competitionMemberships/${input.competitionId}_${uid}`));
    const oldNameRef = db.doc(`competitionTeamNames/${input.competitionId}_${String(before.get("normalizedName"))}`);
    const newNameRef = db.doc(`competitionTeamNames/${input.competitionId}_${cleanName(input.name)}`);
    await db.runTransaction(async (tx) => {
      const [newName, ...memberships] = await Promise.all([tx.get(newNameRef), ...allRefs.map((ref) => tx.get(ref))]);
      if (newNameRef.path !== oldNameRef.path && newName.exists && newName.get("active") !== false) throw new HttpsError("already-exists", "That team name is already in use");
      memberships.forEach((membership) => {
        if (membership.exists && membership.get("active") !== false && membership.get("teamId") !== input.teamId) throw new HttpsError("already-exists", "A selected student already belongs to another team");
      });
      tx.update(teamRef, { name: input.name, normalizedName: cleanName(input.name), members, memberUids: newUids, version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
      if (newNameRef.path !== oldNameRef.path) { tx.set(oldNameRef, { active: false }, { merge: true }); tx.set(newNameRef, { competitionId: input.competitionId, teamId: input.teamId, active: true }); }
      oldUids.filter((uid) => !newUids.includes(uid)).forEach((uid) => {
        tx.set(db.doc(`competitionMemberships/${input.competitionId}_${uid}`), { active: false, releasedAt: FieldValue.serverTimestamp() }, { merge: true });
        tx.set(db.doc(`opportunityResponses/${input.competitionId}_${uid}`), { status: "no_response", teamId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
      members.forEach((member) => {
        tx.set(db.doc(`competitionMemberships/${input.competitionId}_${member.uid}`), { competitionId: input.competitionId, teamId: input.teamId, uid: member.uid, active: true, status: "draft", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        tx.set(db.doc(`opportunityResponses/${input.competitionId}_${member.uid}`), { status: "team_draft", teamId: input.teamId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
    });
    await writeAudit({ actorUid: actor.uid, action: "competition_team.updated", resourceType: "competitionTeam", resourceId: input.teamId, before: before.data(), after: input });
    return { teamId: input.teamId };
  } catch (error) { asHttpsError(error); }
});

const teamIdSchema = z.object({ teamId: z.string().min(1) });

export const reportTeamMembership = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = z.object({ teamId: z.string().min(1), reason: z.string().trim().min(5).max(500) }).parse(request.data);
    const team = await db.doc(`competitionTeams/${input.teamId}`).get();
    if (!team.exists || !((team.get("memberUids") as string[]) ?? []).includes(actor.uid)) throw new HttpsError("permission-denied", "You are not listed on this team");
    const reportRef = db.doc(`operations/membership_report_${input.teamId}_${actor.uid}`);
    await reportRef.set({ type: "team_membership_report", status: "open", teamId: input.teamId, competitionId: team.get("competitionId"), reporterUid: actor.uid, reporterSnapshot: { displayName: actor.displayName, rollNumber: actor.rollNumber }, reason: input.reason, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const governors = await db.collection("users").where("status", "==", "active").limit(2_000).get();
    await notifyUsers(governors.docs.filter((doc) => doc.get("roles.systemAdmin") === true || doc.get("roles.cr") === true).map((doc) => doc.id), `membership_report_${input.teamId}_${actor.uid}`, { type: "team_membership_report", title: "Team membership disputed", body: `${actor.displayName} reported an issue with team ${team.get("name")}.`, teamId: input.teamId });
    await writeAudit({ actorUid: actor.uid, action: "competition_team.membership_reported", resourceType: "competitionTeam", resourceId: input.teamId, reason: input.reason });
    return { reportId: reportRef.id };
  } catch (error) { asHttpsError(error); }
});

export const deleteDraftTeam = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const { teamId } = teamIdSchema.parse(request.data);
    const ref = db.doc(`competitionTeams/${teamId}`);
    const team = await ref.get();
    if (!team.exists) return { teamId, idempotent: true };
    if (team.get("captainUid") !== actor.uid || team.get("status") !== "draft") throw new HttpsError("permission-denied", "Only the captain can delete a draft team");
    const competitionId = String(team.get("competitionId"));
    const memberUids = (team.get("memberUids") as string[]) ?? [];
    await db.runTransaction(async (tx) => {
      tx.update(ref, { status: "withdrawn", deletedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      tx.set(db.doc(`competitionTeamNames/${competitionId}_${team.get("normalizedName")}`), { active: false }, { merge: true });
      memberUids.forEach((uid) => {
        tx.set(db.doc(`competitionMemberships/${competitionId}_${uid}`), { active: false, releasedAt: FieldValue.serverTimestamp() }, { merge: true });
        tx.set(db.doc(`opportunityResponses/${competitionId}_${uid}`), { status: "no_response", teamId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
    });
    await writeAudit({ actorUid: actor.uid, action: "competition_team.deleted", resourceType: "competitionTeam", resourceId: teamId, before: team.data() });
    return { teamId };
  } catch (error) { asHttpsError(error); }
});

export const registerTeam = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const { teamId } = teamIdSchema.parse(request.data);
    const teamRef = db.doc(`competitionTeams/${teamId}`);
    const team = await teamRef.get();
    if (!team.exists) throw new HttpsError("not-found", "Team not found");
    if (team.get("status") === "registered") return { teamId, idempotent: true };
    if (team.get("captainUid") !== actor.uid || team.get("status") !== "draft") throw new HttpsError("permission-denied", "Only the captain can register a draft team");
    const competitionId = String(team.get("competitionId"));
    const competition = await db.doc(`competitions/${competitionId}`).get();
    if (!competition.exists || competition.get("status") !== "published") throw new HttpsError("failed-precondition", "Competition registration is closed");
    const memberUids = (team.get("memberUids") as string[]) ?? [];
    const size = memberUids.length;
    if (size < Number(competition.get("minTeamSize")) || size > Number(competition.get("maxTeamSize"))) throw new HttpsError("failed-precondition", "Team size is outside the allowed range");
    const late = Date.now() > (competition.get("registrationDeadline") as Timestamp).toMillis();
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(teamRef);
      if (fresh.get("status") === "registered") return;
      tx.update(teamRef, { status: "registered", registeredAt: FieldValue.serverTimestamp(), registeredLate: late, membershipLocked: true, updatedAt: FieldValue.serverTimestamp() });
      memberUids.forEach((uid) => {
        tx.set(db.doc(`competitionMemberships/${competitionId}_${uid}`), { status: "registered", active: true, locked: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        tx.set(db.doc(`opportunityResponses/${competitionId}_${uid}`), { status: "registered", teamId, registeredAt: FieldValue.serverTimestamp(), registeredLate: late, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
    });
    await notifyUsers(memberUids, `team_registered_${teamId}`, { type: "team_registered", title: String(team.get("name")), body: late ? "Team registered after the deadline." : "Team registration confirmed.", competitionId, teamId });
    await writeAudit({ actorUid: actor.uid, action: "competition_team.registered", resourceType: "competitionTeam", resourceId: teamId, after: { late } });
    return { teamId, late };
  } catch (error) { asHttpsError(error); }
});

export const createNextRound = onCall({ ...callableOptions, timeoutSeconds: 120 }, async (request) => {
  try {
    const actor = await requireActor(request);
    requireOpportunityManager(actor);
    const input = competitionRoundSchema.parse(request.data);
    const competition = await db.doc(`competitions/${input.competitionId}`).get();
    if (!competition.exists || !["published", "in_progress"].includes(String(competition.get("status")))) throw new HttpsError("failed-precondition", "Competition is not active");
    const rounds = await db.collection("competitionRounds").where("competitionId", "==", input.competitionId).get();
    const sequence = rounds.size + 1;
    const previousRound = rounds.docs.filter((item) => item.get("status") === "open").sort((a, b) => Number(b.get("sequence")) - Number(a.get("sequence")))[0];
    const previousEntries = previousRound ? await db.collection("competitionRoundEntries").where("roundId", "==", previousRound.id).get() : null;
    const roundRef = db.collection("competitionRounds").doc();
    const teams = await Promise.all(input.eligibleTeamIds.map((id) => db.doc(`competitionTeams/${id}`).get()));
    if (teams.some((team) => !team.exists || team.get("competitionId") !== input.competitionId || team.get("status") !== "registered")) throw new HttpsError("invalid-argument", "Every eligible team must be registered for this competition");
    const writer = db.bulkWriter();
    const eliminatedUids: string[] = [];
    if (previousRound && previousEntries) {
      const advancing = new Set(input.eligibleTeamIds);
      previousEntries.docs.forEach((entry) => {
        const advanced = advancing.has(String(entry.get("teamId")));
        writer.update(entry.ref, { status: advanced ? "advanced" : "eliminated", advancementOutcome: advanced ? "advanced" : "eliminated", finalizedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        if (!advanced) eliminatedUids.push(...((entry.get("memberUids") as string[]) ?? []));
      });
      writer.update(previousRound.ref, { status: "finalized", finalizedBy: actor.uid, finalizedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
    writer.set(roundRef, {
      competitionId: input.competitionId, sequence, name: input.name, instructions: input.instructions,
      submissionDeadline: Timestamp.fromDate(new Date(input.submissionDeadlineIso)), resourceUrl: input.resourceUrl || null,
      status: "open", scheduleVersion: 1, ownerUid: actor.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    const recipientUids: string[] = [];
    teams.forEach((team) => {
      const uids = (team.get("memberUids") as string[]) ?? [];
      recipientUids.push(...uids);
      writer.set(db.doc(`competitionRoundEntries/${roundRef.id}_${team.id}`), {
        roundId: roundRef.id, competitionId: input.competitionId, teamId: team.id, teamName: team.get("name"), memberUids: uids,
        status: "pending", eligible: true, submissionStatus: "pending", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    });
    writer.update(db.doc(`competitions/${input.competitionId}`), { status: "in_progress", currentRoundId: roundRef.id, updatedAt: FieldValue.serverTimestamp() });
    await writer.close();
    await notifyUsers(recipientUids, `round_open_${roundRef.id}`, { type: "competition_round_open", title: input.name, body: "Your team has advanced. Review the next-round instructions.", competitionId: input.competitionId, roundId: roundRef.id });
    if (previousRound && eliminatedUids.length) await notifyUsers(eliminatedUids, `round_eliminated_${previousRound.id}`, { type: "round_result", title: String(previousRound.get("name")), body: "Your team did not advance to the next round.", competitionId: input.competitionId, roundId: previousRound.id });
    await createOpportunityReminderJobs({ kind: "competition_round", opportunityId: roundRef.id, title: `${competition.get("title")} - ${input.name}`, deadline: new Date(input.submissionDeadlineIso), scheduleVersion: 1 });
    await writeAudit({ actorUid: actor.uid, action: "competition_round.created", resourceType: "competitionRound", resourceId: roundRef.id, after: { ...input, sequence } });
    return { roundId: roundRef.id, sequence, eligibleTeams: teams.length };
  } catch (error) { asHttpsError(error); }
});

const roundSubmissionSchema = z.object({ roundId: z.string().min(1), teamId: z.string().min(1), confirmationReference: z.string().trim().max(500).optional().default("") });

export const markRoundSubmitted = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = roundSubmissionSchema.parse(request.data);
    const [round, team] = await Promise.all([db.doc(`competitionRounds/${input.roundId}`).get(), db.doc(`competitionTeams/${input.teamId}`).get()]);
    if (!round.exists || round.get("status") !== "open") throw new HttpsError("failed-precondition", "Round is not open");
    if (!team.exists || team.get("captainUid") !== actor.uid) throw new HttpsError("permission-denied", "Only the team captain can record submission");
    const ref = db.doc(`competitionRoundEntries/${input.roundId}_${input.teamId}`);
    const late = Date.now() > (round.get("submissionDeadline") as Timestamp).toMillis();
    await db.runTransaction(async (tx) => {
      const entry = await tx.get(ref);
      if (!entry.exists || entry.get("eligible") !== true) throw new HttpsError("permission-denied", "Team is not eligible for this round");
      if (entry.get("submissionStatus") === "submitted") return;
      tx.update(ref, { status: "submitted", submissionStatus: "submitted", submittedAt: FieldValue.serverTimestamp(), submittedBy: actor.uid, submittedLate: late, confirmationReference: input.confirmationReference, updatedAt: FieldValue.serverTimestamp() });
    });
    await notifyUsers((team.get("memberUids") as string[]) ?? [], `round_submitted_${input.roundId}_${input.teamId}`, { type: "round_submitted", title: String(round.get("name")), body: late ? "Submission recorded late." : "Team submission recorded.", roundId: input.roundId, teamId: input.teamId });
    return { late };
  } catch (error) { asHttpsError(error); }
});

const correctionSchema = roundSubmissionSchema.extend({ submitted: z.boolean(), reason: z.string().trim().min(5).max(500) });

export const correctRoundSubmission = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requireOpportunityManager(actor);
    const input = correctionSchema.parse(request.data);
    const ref = db.doc(`competitionRoundEntries/${input.roundId}_${input.teamId}`);
    const before = await ref.get();
    if (!before.exists) throw new HttpsError("not-found", "Round entry not found");
    const patch = input.submitted
      ? { status: "submitted", submissionStatus: "submitted", submittedAt: FieldValue.serverTimestamp(), submittedBy: actor.uid, correctionReason: input.reason }
      : { status: "pending", submissionStatus: "pending", submittedAt: FieldValue.delete(), submittedBy: FieldValue.delete(), submittedLate: FieldValue.delete(), correctionReason: input.reason };
    await ref.update({ ...patch, correctedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await writeAudit({ actorUid: actor.uid, action: "competition_round.submission_corrected", resourceType: "competitionRoundEntry", resourceId: ref.id, before: before.data(), after: { submitted: input.submitted, confirmationReference: input.confirmationReference }, reason: input.reason });
    return { ok: true };
  } catch (error) { asHttpsError(error); }
});

const finalizeSchema = z.object({ roundId: z.string().min(1), advancingTeamIds: z.array(z.string().min(1)).max(500), reason: z.string().trim().min(3).max(500).default("Round finalized") });

export const finalizeRound = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requireOpportunityManager(actor);
    const input = finalizeSchema.parse(request.data);
    const roundRef = db.doc(`competitionRounds/${input.roundId}`);
    const round = await roundRef.get();
    if (!round.exists || round.get("status") !== "open") throw new HttpsError("failed-precondition", "Round is not open");
    const entries = await db.collection("competitionRoundEntries").where("roundId", "==", input.roundId).get();
    const validTeams = new Set(entries.docs.map((entry) => String(entry.get("teamId"))));
    if (input.advancingTeamIds.some((id) => !validTeams.has(id))) throw new HttpsError("invalid-argument", "An advancing team is not eligible for this round");
    const advancing = new Set(input.advancingTeamIds);
    const writer = db.bulkWriter();
    const notify: Array<{ uids: string[]; advanced: boolean; teamId: string }> = [];
    entries.docs.forEach((entry) => {
      const advanced = advancing.has(String(entry.get("teamId")));
      writer.update(entry.ref, { status: advanced ? "advanced" : "eliminated", advancementOutcome: advanced ? "advanced" : "eliminated", finalizedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      notify.push({ uids: (entry.get("memberUids") as string[]) ?? [], advanced, teamId: String(entry.get("teamId")) });
    });
    writer.update(roundRef, { status: "finalized", finalizedBy: actor.uid, finalizedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await writer.close();
    await Promise.all(notify.map((item) => notifyUsers(item.uids, `round_result_${input.roundId}_${item.teamId}`, { type: "round_result", title: String(round.get("name")), body: item.advanced ? "Your team advanced to the next stage." : "Your team did not advance from this round.", roundId: input.roundId, teamId: item.teamId })));
    await writeAudit({ actorUid: actor.uid, action: "competition_round.finalized", resourceType: "competitionRound", resourceId: input.roundId, after: { advancingTeamIds: input.advancingTeamIds }, reason: input.reason });
    return { entries: entries.size, advancing: input.advancingTeamIds.length };
  } catch (error) { asHttpsError(error); }
});

export const createInternship = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requireOpportunityManager(actor);
    const input = internshipDraftSchema.parse(request.data);
    const ref = db.collection("internships").doc();
    await ref.set({ company: input.company, role: input.role, description: input.description, registrationUrl: input.registrationUrl || null, registrationDeadline: Timestamp.fromDate(new Date(input.registrationDeadlineIso)), title: `${input.company} - ${input.role}`, status: "draft", ownerUid: actor.uid, version: 1, scheduleVersion: 1, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await writeAudit({ actorUid: actor.uid, action: "internship.created", resourceType: "internship", resourceId: ref.id, after: input });
    return { internshipId: ref.id };
  } catch (error) { asHttpsError(error); }
});

const internshipIdSchema = z.object({ internshipId: z.string().min(1) });

export const publishInternship = onCall({ ...callableOptions, timeoutSeconds: 120 }, async (request) => {
  try {
    const actor = await requireActor(request); requireOpportunityManager(actor);
    const { internshipId } = internshipIdSchema.parse(request.data);
    const ref = db.doc(`internships/${internshipId}`);
    const internship = await ref.get();
    if (!internship.exists) throw new HttpsError("not-found", "Internship not found");
    if (internship.get("status") === "published") return { internshipId, idempotent: true };
    if (internship.get("status") !== "draft") throw new HttpsError("failed-precondition", "Only draft internships can be published");
    const students = await activeStudents();
    const writer = db.bulkWriter();
    students.forEach((student) => {
      writer.set(db.doc(`internshipResponses/${internshipId}_${student.id}`), { internshipId, uid: student.id, sectionId: student.get("sectionId"), wingId: student.get("wingId"), status: "no_response", studentSnapshot: { displayName: student.get("displayName"), rollNumber: student.get("rollNumber") }, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      writer.set(db.doc(`users/${student.id}/notifications/internship_published_${internshipId}`), { type: "internship_published", title: String(internship.get("title")), body: "Record whether you registered for this internship.", internshipId, createdAt: FieldValue.serverTimestamp(), readAt: null }, { merge: true });
    });
    writer.update(ref, { status: "published", publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await writer.close();
    await createOpportunityReminderJobs({ kind: "internship_registration", opportunityId: internshipId, title: String(internship.get("title")), deadline: (internship.get("registrationDeadline") as Timestamp).toDate(), scheduleVersion: Number(internship.get("scheduleVersion") ?? 1) });
    return { internshipId, recipientCount: students.length };
  } catch (error) { asHttpsError(error); }
});

const updateInternshipSchema = z.intersection(internshipDraftSchema, z.object({ internshipId: z.string().min(1) }));

export const updateInternship = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requireOpportunityManager(actor);
    const input = updateInternshipSchema.parse(request.data);
    const ref = db.doc(`internships/${input.internshipId}`);
    const before = await ref.get();
    if (!before.exists || !["draft", "published"].includes(String(before.get("status")))) throw new HttpsError("failed-precondition", "Internship cannot be edited in its current state");
    const version = Number(before.get("version") ?? 1) + 1;
    const scheduleVersion = Number(before.get("scheduleVersion") ?? 1) + 1;
    const title = `${input.company} - ${input.role}`;
    const deadline = Timestamp.fromDate(new Date(input.registrationDeadlineIso));
    await ref.update({ company: input.company, role: input.role, title, description: input.description, registrationUrl: input.registrationUrl || null, registrationDeadline: deadline, version, scheduleVersion, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
    if (before.get("status") === "published") {
      const responses = await db.collection("internshipResponses").where("internshipId", "==", input.internshipId).get();
      await notifyUsers(responses.docs.map((doc) => String(doc.get("uid"))), `internship_changed_${input.internshipId}_v${version}`, { type: "internship_changed", title, body: "Internship details or registration deadline changed.", internshipId: input.internshipId });
      await createOpportunityReminderJobs({ kind: "internship_registration", opportunityId: input.internshipId, title, deadline: deadline.toDate(), scheduleVersion });
    }
    await writeAudit({ actorUid: actor.uid, action: "internship.updated", resourceType: "internship", resourceId: input.internshipId, before: before.data(), after: input });
    return { internshipId: input.internshipId, version };
  } catch (error) { asHttpsError(error); }
});

export const cancelInternship = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requireOpportunityManager(actor);
    const input = internshipIdSchema.merge(cancelOpportunitySchema).parse(request.data);
    const ref = db.doc(`internships/${input.internshipId}`);
    const before = await ref.get();
    if (!before.exists) throw new HttpsError("not-found", "Internship not found");
    if (before.get("status") === "cancelled") return { idempotent: true };
    await ref.update({ status: "cancelled", cancellationReason: input.reason, scheduleVersion: FieldValue.increment(1), cancelledBy: actor.uid, cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    const responses = await db.collection("internshipResponses").where("internshipId", "==", input.internshipId).get();
    await notifyUsers(responses.docs.map((doc) => String(doc.get("uid"))), `internship_cancelled_${input.internshipId}`, { type: "internship_cancelled", title: String(before.get("title")), body: `Cancelled: ${input.reason}`, internshipId: input.internshipId });
    await writeAudit({ actorUid: actor.uid, action: "internship.cancelled", resourceType: "internship", resourceId: input.internshipId, before: before.data(), reason: input.reason });
    return { internshipId: input.internshipId };
  } catch (error) { asHttpsError(error); }
});

export const setInternshipResponse = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = internshipResponseSchema.parse(request.data);
    const internship = await db.doc(`internships/${input.internshipId}`).get();
    if (!internship.exists || internship.get("status") !== "published") throw new HttpsError("failed-precondition", "Internship is not accepting responses");
    const late = input.status === "registered" && Date.now() > (internship.get("registrationDeadline") as Timestamp).toMillis();
    await db.doc(`internshipResponses/${input.internshipId}_${actor.uid}`).set({ internshipId: input.internshipId, uid: actor.uid, sectionId: actor.sectionId, wingId: actor.wingId, status: input.status, confirmationReference: input.confirmationReference, registeredLate: late, respondedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), studentSnapshot: { displayName: actor.displayName, rollNumber: actor.rollNumber } }, { merge: true });
    await writeAudit({ actorUid: actor.uid, action: "internship.response_set", resourceType: "internship", resourceId: input.internshipId, after: { status: input.status, late } });
    return { status: input.status, late };
  } catch (error) { asHttpsError(error); }
});

const wingReportSchema = z.object({ wingId: z.string().min(1).optional() });

export const getWingOpportunityReport = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = wingReportSchema.parse(request.data ?? {});
    const wingId = input.wingId ?? actor.wingId;
    if (!actor.roles.systemAdmin && !actor.roles.cr && actor.scopes.wingPocWings[wingId] !== true) throw new HttpsError("permission-denied", "Wing report is outside your scope");
    const [competitionResponses, internshipResponses, teams] = await Promise.all([
      db.collection("opportunityResponses").where("wingId", "==", wingId).limit(2_000).get(),
      db.collection("internshipResponses").where("wingId", "==", wingId).limit(2_000).get(),
      db.collection("competitionTeams").where("status", "in", ["draft", "registered"]).limit(2_000).get(),
    ]);
    const wingTeamRows = teams.docs.flatMap((team) => {
      const ownMembers = ((team.get("members") as Array<Record<string, unknown>>) ?? []).filter((member) => member.wingId === wingId);
      if (!ownMembers.length) return [];
      return [{ id: team.id, competitionId: team.get("competitionId"), name: team.get("name"), status: team.get("status"), ownWingMembers: ownMembers.map((member) => ({ uid: member.uid, displayName: member.displayName, rollNumber: member.rollNumber })), otherWingMemberCount: Number((team.get("members") as unknown[])?.length ?? 0) - ownMembers.length }];
    });
    return {
      wingId,
      competitionResponses: competitionResponses.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      internshipResponses: internshipResponses.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      teams: wingTeamRows,
    };
  } catch (error) { asHttpsError(error); }
});

export const getCompetitionExport = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requireOpportunityManager(actor);
    const { competitionId } = idSchema.parse(request.data);
    const [competition, responses, teams, rounds] = await Promise.all([
      db.doc(`competitions/${competitionId}`).get(),
      db.collection("opportunityResponses").where("opportunityId", "==", competitionId).get(),
      db.collection("competitionTeams").where("competitionId", "==", competitionId).get(),
      db.collection("competitionRounds").where("competitionId", "==", competitionId).get(),
    ]);
    if (!competition.exists) throw new HttpsError("not-found", "Competition not found");
    return { competition: { id: competition.id, ...competition.data() }, responses: responses.docs.map((doc) => ({ id: doc.id, ...doc.data() })), teams: teams.docs.map((doc) => ({ id: doc.id, ...doc.data() })), rounds: rounds.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
  } catch (error) { asHttpsError(error); }
});
