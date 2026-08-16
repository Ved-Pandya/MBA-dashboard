import { onCall, HttpsError } from "firebase-functions/v2/https";
import { buildCatchUpReminderSchedule, buildReminderSchedule, rollNumberToAuthEmail, type ReminderStage } from "@mba/domain";
import { adminAuth, db, FieldValue, Timestamp } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor, requireAdmin, writeAudit } from "./helpers.js";

const DEMO_SEED_ID = "mock_v1";
const DEMO_OFFERINGS = [
  { id: "DEMO-FIN-A", subjectCode: "FIN101", subjectName: "Financial Management" },
  { id: "DEMO-MKT-A", subjectCode: "MKT101", subjectName: "Marketing Management" },
  { id: "DEMO-OPS-A", subjectCode: "OPS101", subjectName: "Operations Management" },
  { id: "DEMO-STR-A", subjectCode: "STR101", subjectName: "Business Strategy" },
] as const;

type TestIdentity = { uid: string; displayName: string; rollNumber: string; sectionId: string; wingId: string };

async function getTestIdentity(rollNumber: string): Promise<TestIdentity> {
  let authUser;
  try { authUser = await adminAuth.getUserByEmail(rollNumberToAuthEmail(rollNumber)); }
  catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") throw new HttpsError("failed-precondition", "Create the three test accounts before seeding mock data");
    throw error;
  }
  const profile = await db.doc(`users/${authUser.uid}`).get();
  if (!profile.exists || profile.get("isTestAccount") !== true) throw new HttpsError("failed-precondition", `${rollNumber} is not a protected test account`);
  return { uid: authUser.uid, displayName: String(profile.get("displayName")), rollNumber, sectionId: String(profile.get("sectionId")), wingId: String(profile.get("wingId")) };
}

function notification(uid: string, id: string, title: string, body: string, extra: Record<string, unknown> = {}) {
  return {
    ref: db.doc(`users/${uid}/notifications/${id}`),
    data: { type: "demo_notice", title, body, ...extra, isTestData: true, demoSeedId: DEMO_SEED_ID, createdAt: FieldValue.serverTimestamp(), readAt: null },
  };
}

function addReminderJobs(writer: FirebaseFirestore.BulkWriter, input: {
  prefix: string;
  kind?: "competition_registration" | "internship_registration" | "competition_round" | "cr_task";
  opportunityId?: string;
  crTaskId?: string;
  taskId?: string;
  title: string;
  deadline: Date;
}) {
  const reminders = input.kind === "cr_task" ? buildCatchUpReminderSchedule(input.deadline) : buildReminderSchedule(input.deadline);
  for (const item of reminders) {
    const id = `demo_${input.prefix}_${item.stage}`;
    writer.set(db.doc(`reminderJobs/${id}`), {
      ...(input.kind === "cr_task"
        ? { kind: input.kind, crTaskId: input.crTaskId }
        : input.kind
          ? { kind: input.kind, opportunityId: input.opportunityId, title: input.title }
          : { taskId: input.taskId }),
      scheduleVersion: 1,
      stage: item.stage as ReminderStage,
      fireAt: Timestamp.fromDate(item.fireAt),
      status: "scheduled",
      attempts: 0,
      isTestData: true,
      demoSeedId: DEMO_SEED_ID,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
}

export const seedTestData = onCall({ ...callableOptions, timeoutSeconds: 120 }, async (request) => {
  try {
    const actor = await requireActor(request);
    requireAdmin(actor);
    const [student, poc, cr] = await Promise.all([
      getTestIdentity("24M2901"),
      getTestIdentity("24M2902"),
      getTestIdentity("24M2903"),
    ]);
    await deleteDemoSeedRecords();
    const users = [student, poc, cr];
    const now = Date.now();
    const at = (hours: number) => new Date(now + hours * 60 * 60_000);
    const day = 24;
    const writer = db.bulkWriter();

    writer.set(db.doc("academicTerms/DEMO-TERM"), { name: "Demo MBA Term", startDate: at(-7 * day).toISOString().slice(0, 10), endDate: at(90 * day).toISOString().slice(0, 10), active: true, isTestData: true, demoSeedId: DEMO_SEED_ID, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    DEMO_OFFERINGS.forEach((offering, index) => {
      writer.set(db.doc(`subjectOfferings/${offering.id}`), { subjectCode: offering.subjectCode, subjectName: offering.subjectName, sectionId: "A", termId: "DEMO-TERM", active: true, isTestData: true, demoSeedId: DEMO_SEED_ID, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      const slotId = `demo_slot_${offering.id}`;
      writer.set(db.doc(`timetableSlots/${slotId}`), { offeringId: offering.id, termId: "DEMO-TERM", sectionId: "A", weekday: ((new Date().getDay() + index + 1) % 7) || 7, startTime: `${String(9 + index).padStart(2, "0")}:00`, endTime: `${String(10 + index).padStart(2, "0")}:00`, room: `Demo Room ${index + 1}`, active: true, source: "demo_seed", isTestData: true, demoSeedId: DEMO_SEED_ID, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      writer.set(db.doc(`pocAssignments/subject_${offering.id}`), { kind: "subject", scopeId: offering.id, uid: poc.uid, active: true, assignedBy: actor.uid, assignedAt: FieldValue.serverTimestamp(), isTestData: true, demoSeedId: DEMO_SEED_ID, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    const demoPocScopes: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    DEMO_OFFERINGS.forEach((offering) => { demoPocScopes[`scopes.subjectPocOfferings.${offering.id}`] = true; });
    writer.update(db.doc(`users/${poc.uid}`), demoPocScopes);

    const academicEvents = [
      { id: "demo_preread_fin", offeringId: "DEMO-FIN-A", eventType: "pre_read", title: "Read: Time Value of Money", details: "Review pages 42–58 before the next Finance class.", hours: 20, resourceUrl: "https://example.com/finance-preread" },
      { id: "demo_assignment_mkt", offeringId: "DEMO-MKT-A", eventType: "assignment_deadline", title: "Brand Positioning Memo", details: "Submit the two-page positioning memo on the course portal.", hours: 52, resourceUrl: "https://example.com/marketing-assignment" },
      { id: "demo_quiz_ops", offeringId: "DEMO-OPS-A", eventType: "quiz", title: "Process Analysis Quiz", details: "In-class quiz covering capacity and bottlenecks.", hours: 76, resourceUrl: null },
      { id: "demo_midterm_strategy", offeringId: "DEMO-STR-A", eventType: "midterm", title: "Strategy Midterm", details: "Closed-book midterm covering modules 1–4.", hours: 8 * day, resourceUrl: null },
    ];
    academicEvents.forEach((event) => writer.set(db.doc(`academicEvents/${event.id}`), { offeringId: event.offeringId, sectionId: "A", termId: "DEMO-TERM", eventType: event.eventType, title: event.title, details: event.details, occursAt: Timestamp.fromDate(at(event.hours)), resourceUrl: event.resourceUrl, status: "published", version: 1, ownerUid: poc.uid, isTestData: true, demoSeedId: DEMO_SEED_ID, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }));

    const competitionDeadline = at(48);
    writer.set(db.doc("competitions/demo_case_registered"), { title: "Demo National Strategy Challenge", organizer: "Demo Consulting Club", description: "A mock strategy case competition used to test team registration and round tracking.", registrationUrl: "https://example.com/demo-case", registrationDeadline: Timestamp.fromDate(competitionDeadline), minTeamSize: 2, maxTeamSize: 4, status: "in_progress", ownerUid: actor.uid, version: 1, scheduleVersion: 1, isTestData: true, demoSeedId: DEMO_SEED_ID, publishedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    writer.set(db.doc("competitionTeams/demo_team_alpha"), { competitionId: "demo_case_registered", name: "Alpha Strategists", normalizedName: "alpha-strategists", captainUid: student.uid, members: [student, poc], memberUids: [student.uid, poc.uid], status: "registered", registeredAt: Timestamp.fromDate(at(-3)), registeredLate: false, membershipLocked: true, version: 1, isTestData: true, demoSeedId: DEMO_SEED_ID, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    writer.set(db.doc("competitionTeamNames/demo_case_registered_alpha-strategists"), { competitionId: "demo_case_registered", teamId: "demo_team_alpha", active: true, isTestData: true, demoSeedId: DEMO_SEED_ID }, { merge: true });
    [student, poc].forEach((member) => writer.set(db.doc(`competitionMemberships/demo_case_registered_${member.uid}`), { competitionId: "demo_case_registered", teamId: "demo_team_alpha", uid: member.uid, active: true, status: "registered", locked: true, isTestData: true, demoSeedId: DEMO_SEED_ID, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
    users.forEach((user) => writer.set(db.doc(`opportunityResponses/demo_case_registered_${user.uid}`), { opportunityId: "demo_case_registered", uid: user.uid, sectionId: user.sectionId, wingId: user.wingId, status: user.uid === cr.uid ? "not_participating" : "registered", ...(user.uid === cr.uid ? {} : { teamId: "demo_team_alpha", registeredAt: Timestamp.fromDate(at(-3)), registeredLate: false }), studentSnapshot: { displayName: user.displayName, rollNumber: user.rollNumber }, isTestData: true, demoSeedId: DEMO_SEED_ID, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));

    const roundDeadline = at(2.25);
    writer.set(db.doc("competitionRounds/demo_round_1"), { competitionId: "demo_case_registered", sequence: 1, name: "Round 1 – Executive Summary", instructions: "Submit a five-slide executive summary through the external portal.", submissionDeadline: Timestamp.fromDate(roundDeadline), resourceUrl: "https://example.com/demo-round", status: "open", scheduleVersion: 1, ownerUid: actor.uid, isTestData: true, demoSeedId: DEMO_SEED_ID, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    writer.set(db.doc("competitionRoundEntries/demo_round_1_demo_team_alpha"), { roundId: "demo_round_1", competitionId: "demo_case_registered", teamId: "demo_team_alpha", teamName: "Alpha Strategists", memberUids: [student.uid, poc.uid], status: "pending", eligible: true, submissionStatus: "pending", isTestData: true, demoSeedId: DEMO_SEED_ID, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    const openCompetitionDeadline = at(26);
    writer.set(db.doc("competitions/demo_case_open"), { title: "Demo Product Innovation Sprint", organizer: "Demo Entrepreneurship Cell", description: "An open mock competition for testing no-response and team-creation flows.", registrationUrl: "https://example.com/demo-innovation", registrationDeadline: Timestamp.fromDate(openCompetitionDeadline), minTeamSize: 2, maxTeamSize: 5, status: "published", ownerUid: actor.uid, version: 1, scheduleVersion: 1, isTestData: true, demoSeedId: DEMO_SEED_ID, publishedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    users.forEach((user) => writer.set(db.doc(`opportunityResponses/demo_case_open_${user.uid}`), { opportunityId: "demo_case_open", uid: user.uid, sectionId: user.sectionId, wingId: user.wingId, status: "no_response", studentSnapshot: { displayName: user.displayName, rollNumber: user.rollNumber }, isTestData: true, demoSeedId: DEMO_SEED_ID, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }));

    const internshipDeadline = at(26.5);
    writer.set(db.doc("internships/demo_internship"), { title: "DemoCorp - Strategy Intern", company: "DemoCorp", role: "Strategy Intern", description: "Mock summer internship registration for testing response tracking.", registrationUrl: "https://example.com/demo-internship", registrationDeadline: Timestamp.fromDate(internshipDeadline), status: "published", ownerUid: actor.uid, version: 1, scheduleVersion: 1, isTestData: true, demoSeedId: DEMO_SEED_ID, publishedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const internshipStatuses = new Map([[student.uid, "no_response"], [poc.uid, "registered"], [cr.uid, "not_participating"]]);
    users.forEach((user) => writer.set(db.doc(`internshipResponses/demo_internship_${user.uid}`), { internshipId: "demo_internship", uid: user.uid, sectionId: user.sectionId, wingId: user.wingId, status: internshipStatuses.get(user.uid), registeredLate: false, studentSnapshot: { displayName: user.displayName, rollNumber: user.rollNumber }, isTestData: true, demoSeedId: DEMO_SEED_ID, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }));

    const formDeadline = at(2.5);
    writer.set(db.doc("tasks/demo_wing_form"), { title: "Demo Corporate Relations Form", description: "Mock administrative form for testing pending, completed, and exempt states.", taskType: "administrative_form", status: "published", target: { kind: "wing", scopeKey: "wing:A", wingId: "A" }, dueAt: Timestamp.fromDate(formDeadline), dueTimezone: "Asia/Kolkata", resourceUrl: "https://example.com/demo-form", ownerUid: actor.uid, version: 1, audienceVersion: 1, scheduleVersion: 1, audienceSyncStatus: "ready", isTestData: true, demoSeedId: DEMO_SEED_ID, createdAt: FieldValue.serverTimestamp(), publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const assignmentStates = new Map([[student.uid, "pending"], [poc.uid, "completed"], [cr.uid, "exempt"]]);
    users.forEach((user) => {
      const status = assignmentStates.get(user.uid)!;
      writer.set(db.doc(`taskAssignments/demo_wing_form_${user.uid}`), { taskId: "demo_wing_form", uid: user.uid, taskType: "administrative_form", scopeKey: "wing:A", sectionId: user.sectionId, wingId: user.wingId, status, ...(status === "completed" ? { completedAt: Timestamp.fromDate(at(-2)), completedBy: user.uid, completionMethod: "self", completedLate: false } : {}), ...(status === "exempt" ? { exemptionReason: "Demo exemption state" } : {}), taskSnapshot: { title: "Demo Corporate Relations Form", dueAt: Timestamp.fromDate(formDeadline), resourceUrl: "https://example.com/demo-form", taskStatus: "published" }, studentSnapshot: { displayName: user.displayName, rollNumber: user.rollNumber }, taskVersion: 1, audienceVersion: 1, isTestData: true, demoSeedId: DEMO_SEED_ID, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    writer.set(db.doc("taskStats/demo_wing_form"), { eligibleCount: 3, pendingCount: 1, completedCount: 1, exemptCount: 1, isTestData: true, demoSeedId: DEMO_SEED_ID, updatedAt: FieldValue.serverTimestamp(), reconciledAt: FieldValue.serverTimestamp() }, { merge: true });

    const crTaskAssignedDue = at(26);
    const crTaskProgressDue = at(1.5);
    writer.set(db.doc("crTasks/demo_cr_assigned"), { title: "Confirm guest speaker logistics", notes: "Confirm the auditorium, visitor pass, and AV requirements.", status: "assigned", dueAt: Timestamp.fromDate(crTaskAssignedDue), createdBy: cr.uid, updatedBy: cr.uid, creatorSnapshot: { displayName: cr.displayName, rollNumber: cr.rollNumber }, version: 1, scheduleVersion: 1, isTestData: true, demoSeedId: DEMO_SEED_ID, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    writer.set(db.doc("crTasks/demo_cr_progress"), { title: "Compile batch feedback", notes: "Merge the Section A and B feedback before sharing the summary.", status: "in_progress", dueAt: Timestamp.fromDate(crTaskProgressDue), createdBy: cr.uid, updatedBy: cr.uid, creatorSnapshot: { displayName: cr.displayName, rollNumber: cr.rollNumber }, version: 1, scheduleVersion: 1, isTestData: true, demoSeedId: DEMO_SEED_ID, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    writer.set(db.doc("crTasks/demo_cr_completed"), { title: "Publish club room allocation", notes: "Allocation was confirmed and circulated to all clubs.", status: "completed", dueAt: Timestamp.fromDate(at(-2)), createdBy: cr.uid, updatedBy: cr.uid, completedBy: cr.uid, creatorSnapshot: { displayName: cr.displayName, rollNumber: cr.rollNumber }, version: 1, scheduleVersion: 1, isTestData: true, demoSeedId: DEMO_SEED_ID, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), completedAt: FieldValue.serverTimestamp() }, { merge: true });

    addReminderJobs(writer, { prefix: "case_open", kind: "competition_registration", opportunityId: "demo_case_open", title: "Demo Product Innovation Sprint", deadline: openCompetitionDeadline });
    addReminderJobs(writer, { prefix: "internship", kind: "internship_registration", opportunityId: "demo_internship", title: "DemoCorp - Strategy Intern", deadline: internshipDeadline });
    addReminderJobs(writer, { prefix: "round_1", kind: "competition_round", opportunityId: "demo_round_1", title: "Demo National Strategy Challenge - Round 1", deadline: roundDeadline });
    addReminderJobs(writer, { prefix: "wing_form", taskId: "demo_wing_form", title: "Demo Corporate Relations Form", deadline: formDeadline });
    addReminderJobs(writer, { prefix: "cr_assigned", kind: "cr_task", crTaskId: "demo_cr_assigned", title: "Confirm guest speaker logistics", deadline: crTaskAssignedDue });
    addReminderJobs(writer, { prefix: "cr_progress", kind: "cr_task", crTaskId: "demo_cr_progress", title: "Compile batch feedback", deadline: crTaskProgressDue });

    for (const user of users) {
      const notices = [
        notification(user.uid, "demo_academics_ready", "Demo academic calendar ready", "Four mock academic items were added for Section A."),
        notification(user.uid, "demo_opportunity_ready", "Demo opportunities ready", "Mock competitions and an internship are ready for testing."),
      ];
      notices.forEach((notice) => writer.set(notice.ref, notice.data, { merge: true }));
    }
    await writer.close();
    await writeAudit({ actorUid: actor.uid, action: "test_data.seeded", resourceType: "demoSeed", resourceId: DEMO_SEED_ID, after: { subjects: DEMO_OFFERINGS.length, academicEvents: academicEvents.length, competitions: 2, internships: 1, teams: 1, rounds: 1, wingForms: 1, crTasks: 3 } });
    return { subjects: 4, academicEvents: 4, competitions: 2, internships: 1, teams: 1, rounds: 1, wingForms: 1, crTasks: 3, testUsers: 3 };
  } catch (error) { asHttpsError(error); }
});

const DEMO_COLLECTIONS = [
  "academicTerms", "subjectOfferings", "timetableSlots", "timetableExceptions", "academicEvents",
  "competitions", "competitionTeams", "competitionTeamNames", "competitionMemberships", "competitionRounds",
  "competitionRoundEntries", "opportunityResponses", "internships", "internshipResponses", "tasks",
  "taskAssignments", "taskStats", "reminderJobs", "reminderDeliveries", "competitionStats",
  "internshipStats", "competitionRoundStats", "pocAssignments", "crTasks", "pushJobs", "pushDeliveries",
] as const;

async function deleteDemoSeedRecords() {
  const writer = db.bulkWriter();
  let deleted = 0;
  for (const collectionName of DEMO_COLLECTIONS) {
    const records = await db.collection(collectionName).where("demoSeedId", "==", DEMO_SEED_ID).get();
    records.docs.forEach((record) => { writer.delete(record.ref); deleted += 1; });
  }
  const users = await db.collection("users").limit(2_000).get();
  for (const user of users.docs) {
    const notices = await user.ref.collection("notifications").where("demoSeedId", "==", DEMO_SEED_ID).get();
    notices.docs.forEach((record) => { writer.delete(record.ref); deleted += 1; });
    const scopeDeletes: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    DEMO_OFFERINGS.forEach((offering) => { scopeDeletes[`scopes.subjectPocOfferings.${offering.id}`] = FieldValue.delete(); });
    writer.update(user.ref, scopeDeletes);
  }
  await writer.close();
  return deleted;
}

export const clearTestData = onCall({ ...callableOptions, timeoutSeconds: 120 }, async (request) => {
  try {
    const actor = await requireActor(request);
    requireAdmin(actor);
    const deleted = await deleteDemoSeedRecords();
    const writer = db.bulkWriter();
    await writer.close();
    await writeAudit({ actorUid: actor.uid, action: "test_data.cleared", resourceType: "demoSeed", resourceId: DEMO_SEED_ID, after: { deleted } });
    return { deleted };
  } catch (error) { asHttpsError(error); }
});
