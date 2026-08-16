import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

const runRules = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = runRules ? describe : describe.skip;
let testEnv: RulesTestEnvironment;

const scopes = (wing: Record<string, true> = {}, subject: Record<string, true> = {}, batchPocRoles: Record<string, true> = {}) => ({
  crSections: {}, wingPocWings: wing, subjectPocOfferings: subject, batchPocRoles,
});

suite("Firestore RBAC rules", () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: `demo-mba-rules-${Date.now()}`,
      firestore: { rules: readFileSync(resolve(process.cwd(), "../firestore.rules"), "utf8") },
    });
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "users/student"), { status: "active", sectionId: "A", wingId: "A", roles: { student: true, cr: false, systemAdmin: false }, scopes: scopes() });
      await setDoc(doc(db, "users/other"), { status: "active", sectionId: "B", wingId: "B", roles: { student: true, cr: false, systemAdmin: false }, scopes: scopes() });
      await setDoc(doc(db, "users/wingPoc"), { status: "active", sectionId: "A", wingId: "A", roles: { student: true, cr: false, systemAdmin: false }, scopes: scopes({ A: true }) });
      await setDoc(doc(db, "users/groomingPoc"), { status: "active", sectionId: "A", wingId: "A", roles: { student: true, cr: false, systemAdmin: false }, scopes: scopes({}, {}, { grooming: true }) });
      await setDoc(doc(db, "users/casePoc"), { status: "active", sectionId: "A", wingId: "A", roles: { student: true, cr: false, systemAdmin: false }, scopes: scopes({}, {}, { caseCompetition: true }) });
      await setDoc(doc(db, "users/cr"), { status: "active", sectionId: "A", wingId: "A", roles: { student: true, cr: true, systemAdmin: false }, scopes: scopes() });
      await setDoc(doc(db, "users/admin"), { status: "active", sectionId: "A", wingId: "A", roles: { student: true, cr: false, systemAdmin: true }, scopes: scopes() });
      await setDoc(doc(db, "users/suspendedCr"), { status: "suspended", sectionId: "B", wingId: "B", roles: { student: true, cr: true, systemAdmin: false }, scopes: scopes() });
      await setDoc(doc(db, "crTasks/private1"), { title: "Private CR work", notes: "Internal", status: "assigned", version: 1, scheduleVersion: 1 });
      await setDoc(doc(db, "taskAssignments/task1_student"), { taskId: "task1", uid: "student", wingId: "A", subjectOfferingId: null, scopeKey: "wing:A" });
      await setDoc(doc(db, "taskAssignments/task2_other"), { taskId: "task2", uid: "other", wingId: "B", subjectOfferingId: null, scopeKey: "wing:B" });
      await setDoc(doc(db, "opportunityResponses/comp_student"), { opportunityId: "comp", uid: "student", wingId: "A", status: "registered" });
      await setDoc(doc(db, "opportunityResponses/comp_other"), { opportunityId: "comp", uid: "other", wingId: "B", status: "registered" });
      await setDoc(doc(db, "competitionTeams/team_student"), { competitionId: "comp", memberUids: ["student", "other"], members: [{ uid: "student", wingId: "A" }, { uid: "other", wingId: "B" }] });
      await setDoc(doc(db, "pushSubscriptions/student_device"), { uid: "student", endpoint: "https://push.example/subscription", keys: { p256dh: "secret", auth: "secret" } });
      await setDoc(doc(db, "pushEndpointOwners/hash"), { uid: "student", subscriptionId: "student_device" });
      await setDoc(doc(db, "pushJobs/job1"), { uid: "student", status: "queued" });
      await setDoc(doc(db, "pushDeliveries/job1_device"), { uid: "student", status: "sent" });
      await setDoc(doc(db, "systemHealth/push"), { configured: true, delivered: 1 });
      await setDoc(doc(db, "sessionIntimations/session1"), { title: "Session", status: "published" });
      await setDoc(doc(db, "sessionResponses/session1_student"), { sessionId: "session1", uid: "student", status: "no_response" });
      await setDoc(doc(db, "sessionResponses/session1_other"), { sessionId: "session1", uid: "other", status: "attending" });
      await setDoc(doc(db, "generalPolls/poll1"), { question: "Question", status: "published" });
      await setDoc(doc(db, "pollResponses/poll1_student"), { pollId: "poll1", uid: "student", status: "no_response" });
      await setDoc(doc(db, "pollResponses/poll1_other"), { pollId: "poll1", uid: "other", status: "responded" });
    });
  });

  afterAll(async () => { await testEnv?.cleanup(); });

  it("lets a student read only their own assignment", async () => {
    const db = testEnv.authenticatedContext("student").firestore();
    await assertSucceeds(getDoc(doc(db, "taskAssignments/task1_student")));
    await assertFails(getDoc(doc(db, "taskAssignments/task2_other")));
  });

  it("enforces exact wing scope for a POC", async () => {
    const db = testEnv.authenticatedContext("wingPoc").firestore();
    await assertSucceeds(getDoc(doc(db, "taskAssignments/task1_student")));
    await assertFails(getDoc(doc(db, "taskAssignments/task2_other")));
  });

  it("allows a CR to read batch-wide tracking", async () => {
    const db = testEnv.authenticatedContext("cr").firestore();
    await expect(assertSucceeds(getDoc(doc(db, "taskAssignments/task2_other")))).resolves.toBeDefined();
  });

  it("keeps cross-wing teams behind sanitized server reports", async () => {
    const pocDb = testEnv.authenticatedContext("wingPoc").firestore();
    await assertSucceeds(getDoc(doc(pocDb, "opportunityResponses/comp_student")));
    await assertFails(getDoc(doc(pocDb, "opportunityResponses/comp_other")));
    await assertFails(getDoc(doc(pocDb, "competitionTeams/team_student")));
    const memberDb = testEnv.authenticatedContext("student").firestore();
    await assertSucceeds(getDoc(doc(memberDb, "competitionTeams/team_student")));
  });

  it("keeps the CR Board private while allowing CR and read-only admin access", async () => {
    const studentDb = testEnv.authenticatedContext("student").firestore();
    const pocDb = testEnv.authenticatedContext("wingPoc").firestore();
    const crDb = testEnv.authenticatedContext("cr").firestore();
    const adminDb = testEnv.authenticatedContext("admin").firestore();
    const suspendedCrDb = testEnv.authenticatedContext("suspendedCr").firestore();
    await assertFails(getDoc(doc(studentDb, "crTasks/private1")));
    await assertFails(getDocs(collection(pocDb, "crTasks")));
    await assertSucceeds(getDocs(collection(crDb, "crTasks")));
    await assertSucceeds(getDoc(doc(adminDb, "crTasks/private1")));
    await assertFails(getDoc(doc(suspendedCrDb, "crTasks/private1")));
    await assertFails(setDoc(doc(crDb, "crTasks/client-write"), { status: "assigned" }));
    await assertFails(setDoc(doc(adminDb, "crTasks/private1"), { status: "completed" }, { merge: true }));
  });

  it("keeps raw push secrets server-only and exposes only sanitized admin health", async () => {
    const studentDb = testEnv.authenticatedContext("student").firestore();
    const adminDb = testEnv.authenticatedContext("admin").firestore();
    for (const path of ["pushSubscriptions/student_device", "pushEndpointOwners/hash", "pushJobs/job1", "pushDeliveries/job1_device"]) {
      await assertFails(getDoc(doc(studentDb, path)));
      await assertFails(getDoc(doc(adminDb, path)));
    }
    await assertSucceeds(getDoc(doc(adminDb, "systemHealth/push")));
    await assertFails(getDoc(doc(studentDb, "systemHealth/push")));
    await assertFails(setDoc(doc(adminDb, "pushSubscriptions/admin_device"), { endpoint: "https://push.example/admin" }));
  });

  it("keeps named session and poll responses private", async () => {
    const studentDb = testEnv.authenticatedContext("student").firestore();
    const wingDb = testEnv.authenticatedContext("wingPoc").firestore();
    const groomingDb = testEnv.authenticatedContext("groomingPoc").firestore();
    await assertSucceeds(getDoc(doc(studentDb, "sessionIntimations/session1")));
    await assertSucceeds(getDoc(doc(studentDb, "sessionResponses/session1_student")));
    await assertFails(getDoc(doc(studentDb, "sessionResponses/session1_other")));
    await assertFails(getDoc(doc(wingDb, "sessionResponses/session1_other")));
    await assertSucceeds(getDoc(doc(studentDb, "generalPolls/poll1")));
    await assertSucceeds(getDoc(doc(studentDb, "pollResponses/poll1_student")));
    await assertFails(getDoc(doc(groomingDb, "pollResponses/poll1_other")));
    await assertFails(setDoc(doc(studentDb, "pollResponses/poll1_student"), { optionId: "option_1" }, { merge: true }));
  });

  it("lets the case competition POC read competition records but not private polls", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => setDoc(doc(context.firestore(), "competitions/draft"), { status: "draft" }));
    const caseDb = testEnv.authenticatedContext("casePoc").firestore();
    await assertSucceeds(getDoc(doc(caseDb, "competitions/draft")));
    await assertFails(getDoc(doc(caseDb, "pollResponses/poll1_other")));
  });
});
