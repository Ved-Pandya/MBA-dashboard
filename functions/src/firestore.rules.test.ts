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
      await setDoc(doc(db, "users/student"), { status: "active", roles: { student: true, cr: false, systemAdmin: false }, scopes: scopes() });
      await setDoc(doc(db, "users/other"), { status: "active", roles: { student: true, cr: false, systemAdmin: false }, scopes: scopes() });
      await setDoc(doc(db, "users/wingPoc"), { status: "active", roles: { student: true, cr: false, systemAdmin: false }, scopes: scopes({ W01: true }) });
      await setDoc(doc(db, "users/cr"), { status: "active", roles: { student: true, cr: true, systemAdmin: false }, scopes: scopes() });
      await setDoc(doc(db, "taskAssignments/task1_student"), { taskId: "task1", uid: "student", wingId: "W01", subjectOfferingId: null, scopeKey: "wing:W01" });
      await setDoc(doc(db, "taskAssignments/task2_other"), { taskId: "task2", uid: "other", wingId: "W02", subjectOfferingId: null, scopeKey: "wing:W02" });
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
});
