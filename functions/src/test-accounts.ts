import { randomBytes } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { rollNumberToAuthEmail } from "@mba/domain";
import { adminAuth, db, FieldValue } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor, requireAdmin, writeAudit } from "./helpers.js";

const TEST_ACCOUNTS = [
  { key: "student", rollNumber: "24M2901", displayName: "Test Student", sectionId: "A", wingId: "A", cr: false },
  { key: "poc", rollNumber: "24M2902", displayName: "Test Subject POC", sectionId: "A", wingId: "A", cr: false },
  { key: "cr", rollNumber: "24M2903", displayName: "Test CR", sectionId: "A", wingId: "A", cr: true },
] as const;

function generatePassword() {
  return `T!${randomBytes(12).toString("base64url")}aA1`;
}

export const createTestAccounts = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    requireAdmin(actor);

    const credentials: Array<{ role: string; rollNumber: string; password: string }> = [];
    const accounts: Array<{ uid: string; key: string; rollNumber: string; displayName: string; sectionId: string; wingId: string; cr: boolean }> = [];
    const existingUids = new Map<string, string>();
    for (const spec of TEST_ACCOUNTS) {
      const email = rollNumberToAuthEmail(spec.rollNumber);
      try {
        const authUser = await adminAuth.getUserByEmail(email);
        const existingProfile = await db.doc(`users/${authUser.uid}`).get();
        const resumablePartialCreate = !existingProfile.exists && authUser.displayName === spec.displayName;
        if (!resumablePartialCreate && (!existingProfile.exists || existingProfile.get("isTestAccount") !== true)) {
          throw new HttpsError("already-exists", `${spec.rollNumber} already belongs to a non-test identity; no test accounts were changed`);
        }
        existingUids.set(spec.rollNumber, authUser.uid);
      } catch (error) {
        if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
      }
    }
    for (const spec of TEST_ACCOUNTS) {
      const email = rollNumberToAuthEmail(spec.rollNumber);
      const password = generatePassword();
      const existingUid = existingUids.get(spec.rollNumber);
      const authUser = existingUid
        ? await adminAuth.updateUser(existingUid, { password, displayName: spec.displayName, disabled: false, emailVerified: true })
        : await adminAuth.createUser({ email, password, displayName: spec.displayName, disabled: false, emailVerified: true });
      accounts.push({ uid: authUser.uid, ...spec });
      credentials.push({ role: spec.key, rollNumber: spec.rollNumber, password });
    }

    const poc = accounts.find((account) => account.key === "poc")!;
    const writer = db.bulkWriter();
    writer.set(db.doc("subjectOfferings/TEST-A"), {
      subjectCode: "TEST",
      subjectName: "Test Subject (Safe to Delete)",
      sectionId: "A",
      termId: "TEST",
      active: true,
      isTestData: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    writer.set(db.doc("academicTerms/TEST"), {
      name: "Test Term",
      active: true,
      isTestData: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    for (const account of accounts) {
      writer.set(db.doc(`users/${account.uid}`), {
        authEmail: rollNumberToAuthEmail(account.rollNumber),
        displayName: account.displayName,
        rollNumber: account.rollNumber,
        status: "active",
        sectionId: account.sectionId,
        wingId: account.wingId,
        roles: { student: true, cr: account.cr, systemAdmin: false },
        scopes: {
          crSections: account.cr ? { A: true, B: true } : {},
          wingPocWings: {},
          subjectPocOfferings: account.key === "poc" ? { "TEST-A": true } : {},
          batchPocRoles: {},
        },
        isTestAccount: true,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    writer.set(db.doc(`users/${poc.uid}/notifications/test_poc_assigned`), {
      type: "poc_assigned",
      title: "Test POC responsibility assigned",
      body: "You manage the TEST-A subject offering.",
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
    }, { merge: true });
    await writer.close();
    const assignmentRef = db.doc("pocAssignments/subject_TEST-A");
    await db.runTransaction(async (tx) => {
      const assignment = await tx.get(assignmentRef);
      const previousUid = assignment.exists ? String(assignment.get("uid")) : "";
      const previousUser = previousUid && previousUid !== poc.uid ? await tx.get(db.doc(`users/${previousUid}`)) : null;
      if (previousUser?.exists) tx.update(previousUser.ref, { "scopes.subjectPocOfferings.TEST-A": FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
      tx.update(db.doc(`users/${poc.uid}`), { "scopes.subjectPocOfferings.TEST-A": true, updatedAt: FieldValue.serverTimestamp() });
      tx.set(assignmentRef, { kind: "subject", scopeId: "TEST-A", uid: poc.uid, active: true, isTestData: true, assignedBy: actor.uid, assignedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
    await db.doc("appConfig/current").set({ rosterVersion: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await writeAudit({ actorUid: actor.uid, action: "test_accounts.created_or_reset", resourceType: "testAccounts", resourceId: "default", after: { rollNumbers: accounts.map((account) => account.rollNumber) } });
    return { credentials, warning: "Passwords are shown once and were not stored in Firestore or audit logs." };
  } catch (error) { asHttpsError(error); }
});
