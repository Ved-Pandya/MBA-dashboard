import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

const runRules = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = runRules ? describe : describe.skip;
let testEnv: RulesTestEnvironment;

const scopes = (wing: Record<string, true> = {}, subject: Record<string, true> = {}) => ({
  crSections: {}, wingPocWings: wing, subjectPocOfferings: subject,
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
      await setDoc(doc(db, "users/cr"), { status: "active", sectionId: "A", wingId: "A", roles: { student: true, cr: true, systemAdmin: false }, scopes: scopes() });
      await setDoc(doc(db, "taskAssignments/task1_student"), { taskId: "task1", uid: "student", wingId: "A", subjectOfferingId: null, scopeKey: "wing:A" });
      await setDoc(doc(db, "taskAssignments/task2_other"), { taskId: "task2", uid: "other", wingId: "B", subjectOfferingId: null, scopeKey: "wing:B" });
      await setDoc(doc(db, "opportunityResponses/comp_student"), { opportunityId: "comp", uid: "student", wingId: "A", status: "registered" });
      await setDoc(doc(db, "opportunityResponses/comp_other"), { opportunityId: "comp", uid: "other", wingId: "B", status: "registered" });
      await setDoc(doc(db, "competitionTeams/team_student"), { competitionId: "comp", memberUids: ["student", "other"], members: [{ uid: "student", wingId: "A" }, { uid: "other", wingId: "B" }] });
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
});
