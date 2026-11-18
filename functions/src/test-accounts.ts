import { randomBytes } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { DEMO_ACCOUNTS, rollNumberToAuthEmail } from "@mba/domain";
import { adminAuth, db, FieldValue } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor, requireAdmin, writeAudit, type Actor } from "./helpers.js";

const TEST_ACCOUNTS = DEMO_ACCOUNTS;

function generatePassword() {
  return `T!${randomBytes(12).toString("base64url")}aA1`;
}

export async function ensureDemoAccounts(actor: Actor, resetPasswords = false) {
    await Promise.all(["academicTerms/TEST", "subjectOfferings/TEST-A", "pocAssignments/subject_TEST-A"].map(async (path) => {
      const existing = await db.doc(path).get();
      if (existing.exists && existing.get("isTestData") !== true) throw new HttpsError("already-exists", `${path} belongs to non-demo data; no demo accounts were changed`);
    }));

    const credentials: Array<{ role: string; rollNumber: string; password: string }> = [];
    const accounts: Array<{ uid: string } & (typeof TEST_ACCOUNTS)[number]> = [];
    const existingUids = new Map<string, string>();
    const partialUids = new Set<string>();
    await Promise.all(TEST_ACCOUNTS.map(async (spec) => {
      const email = rollNumberToAuthEmail(spec.rollNumber);
      try {
        const authUser = await adminAuth.getUserByEmail(email);
        const existingProfile = await db.doc(`users/${authUser.uid}`).get();
        const legacyNames: Record<string, string> = { student: "Test Student", poc: "Test Subject POC", cr: "Test CR" };
        const resumablePartialCreate = !existingProfile.exists && [spec.displayName, legacyNames[spec.key]].includes(authUser.displayName ?? "");
        if (!resumablePartialCreate && (!existingProfile.exists || existingProfile.get("isTestAccount") !== true)) {
          throw new HttpsError("already-exists", `${spec.rollNumber} already belongs to a non-test identity; no test accounts were changed`);
        }
        if (resumablePartialCreate) partialUids.add(authUser.uid);
        existingUids.set(spec.rollNumber, authUser.uid);
      } catch (error) {
        if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
      }
    }));
    const prepared = await Promise.all(TEST_ACCOUNTS.map(async (spec) => {
      const email = rollNumberToAuthEmail(spec.rollNumber);
      const password = generatePassword();
      const existingUid = existingUids.get(spec.rollNumber);
      const authUser = existingUid
        ? await adminAuth.updateUser(existingUid, { ...(resetPasswords || partialUids.has(existingUid) ? { password } : {}), displayName: spec.displayName, disabled: false, emailVerified: true })
        : await adminAuth.createUser({ email, password, displayName: spec.displayName, disabled: false, emailVerified: true });
      return { account: { uid: authUser.uid, ...spec }, credential: !existingUid || resetPasswords || partialUids.has(existingUid) ? { role: spec.role, rollNumber: spec.rollNumber, password } : null };
    }));
    prepared.forEach(({ account, credential }) => { accounts.push(account); if (credential) credentials.push(credential); });

    const poc = accounts.find((account) => account.key === "poc")!;
    const writer = db.batch();
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
          wingPocWings: account.key === "wing" ? { A: true } : {},
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
    await writer.commit();
    const assignmentRef = db.doc("pocAssignments/subject_TEST-A");
    await db.runTransaction(async (tx) => {
      const assignment = await tx.get(assignmentRef);
      const previousUid = assignment.exists ? String(assignment.get("uid")) : "";
      const previousUser = previousUid && previousUid !== poc.uid ? await tx.get(db.doc(`users/${previousUid}`)) : null;
      if (previousUser?.exists) tx.update(previousUser.ref, { "scopes.subjectPocOfferings.TEST-A": FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
      tx.update(db.doc(`users/${poc.uid}`), { "scopes.subjectPocOfferings.TEST-A": true, updatedAt: FieldValue.serverTimestamp() });
      tx.set(assignmentRef, { kind: "subject", scopeId: "TEST-A", uid: poc.uid, seat: 1, active: true, isTestData: true, assignedBy: actor.uid, assignedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
    await db.runTransaction(async (tx) => { const ref = db.doc("appConfig/current"); if ((await tx.get(ref)).exists) tx.update(ref, { rosterVersion: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }); });
    await writeAudit({ actorUid: actor.uid, action: "test_accounts.created_or_reset", resourceType: "testAccounts", resourceId: "default", after: { rollNumbers: accounts.map((account) => account.rollNumber) } });
    return { credentials, accounts: accounts.map((a) => ({ ...a, role: DEMO_ACCOUNTS.find((spec) => spec.key === a.key)!.role })), warning: "Passwords are returned once and never stored in Firestore or audit logs." };
}

export const createTestAccounts = onCall(callableOptions, async (request) => {
  try { const actor = await requireActor(request); requireAdmin(actor); return await ensureDemoAccounts(actor, true); }
  catch (error) { asHttpsError(error); }
});

export async function resetDemoAccountPasswords(actor: Actor) {
  // Validate all six identities before changing even one password.
  const accounts = await Promise.all(DEMO_ACCOUNTS.map(async (spec) => {
    let user;
    try { user = await adminAuth.getUserByEmail(rollNumberToAuthEmail(spec.rollNumber)); }
    catch (error) {
      if ((error as { code?: string }).code === "auth/user-not-found") throw new HttpsError("failed-precondition", "Prepare the sample workspace before resetting its passwords.");
      throw error;
    }
    const profile = await db.doc(`users/${user.uid}`).get();
    if (profile.get("isTestAccount") !== true || profile.get("authEmail") !== rollNumberToAuthEmail(spec.rollNumber)) {
      throw new HttpsError("already-exists", `${spec.rollNumber} belongs to a non-demo account. No demo passwords were changed.`);
    }
    return { uid: user.uid, spec };
  }));
  const credentials = await Promise.all(accounts.map(async ({ uid, spec }) => {
    const password = generatePassword();
    await adminAuth.updateUser(uid, { password });
    return { role: spec.role, rollNumber: spec.rollNumber, password };
  }));
  await writeAudit({ actorUid: actor.uid, action: "test_accounts.passwords_reset", resourceType: "testAccounts", resourceId: "default", after: { rollNumbers: accounts.map(({ spec }) => spec.rollNumber) } });
  return { credentials };
}
