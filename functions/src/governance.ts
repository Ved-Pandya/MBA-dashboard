import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { POC_KINDS, WING_IDS, pocAssignmentDocumentId, type PocKind, type UserProfile } from "@mba/domain";
import { db, FieldValue } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor, requireString, writeAudit } from "./helpers.js";

function requireGovernance(actor: UserProfile) {
  if (!actor.roles.systemAdmin && !actor.roles.cr) throw new HttpsError("permission-denied", "Admin or CR access required");
}

const assignmentSchema = z.object({
  kind: z.enum(POC_KINDS),
  scopeId: z.string().trim().min(1).max(80),
  uid: z.string().min(1),
  seat: z.union([z.literal(1), z.literal(2)]).optional().default(1),
}).superRefine((value, ctx) => {
  const batchKind = value.kind === "grooming" || value.kind === "case_competition" || value.kind === "attendance";
  if (batchKind && value.scopeId !== "batch") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scopeId"], message: "Batch POC roles must use the batch scope" });
  if (value.kind !== "subject" && value.seat !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["seat"], message: "Only Subject POCs use numbered seats" });
});

function batchRoleKey(kind: Exclude<PocKind, "wing" | "subject">) {
  if (kind === "case_competition") return "caseCompetition";
  return kind;
}

function scopePath(kind: PocKind, scopeId: string) {
  if (kind === "wing") return `scopes.wingPocWings.${scopeId}`;
  if (kind === "subject") return `scopes.subjectPocOfferings.${scopeId}`;
  return `scopes.batchPocRoles.${batchRoleKey(kind)}`;
}

async function validateScope(kind: PocKind, scopeId: string) {
  if (kind === "grooming" || kind === "case_competition" || kind === "attendance") return;
  const ref = kind === "wing" ? db.doc(`wings/${scopeId}`) : db.doc(`subjectOfferings/${scopeId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.get("active") !== true) throw new HttpsError("failed-precondition", `${kind === "wing" ? "Wing" : "Subject"} scope is not active`);
}

export const getPocSetup = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    requireGovernance(actor);
    const [users, assignments, offerings, wings] = await Promise.all([
      db.collection("users").where("status", "in", ["active", "invited"]).limit(1_000).get(),
      db.collection("pocAssignments").where("active", "==", true).get(),
      db.collection("subjectOfferings").where("active", "==", true).get(),
      db.collection("wings").where("active", "==", true).get(),
    ]);
    return {
      users: users.docs.map((doc) => ({ uid: doc.id, displayName: doc.get("displayName"), rollNumber: doc.get("rollNumber"), sectionId: doc.get("sectionId"), wingId: doc.get("wingId") })),
      assignments: assignments.docs.map((doc) => ({ id: doc.id, ...doc.data(), seat: doc.get("kind") === "subject" ? Number(doc.get("seat") ?? 1) : 1 })),
      offerings: offerings.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      wings: wings.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    };
  } catch (error) { asHttpsError(error); }
});

export const searchRoleCandidates = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    requireGovernance(actor);
    const queryText = requireString((request.data as Record<string, unknown>)?.query, "query").toLowerCase();
    const users = await db.collection("users").where("status", "in", ["active", "invited"]).limit(1_000).get();
    return users.docs
      .map((doc) => ({ uid: doc.id, displayName: String(doc.get("displayName")), rollNumber: String(doc.get("rollNumber")), sectionId: doc.get("sectionId"), wingId: doc.get("wingId") }))
      .filter((user) => user.displayName.toLowerCase().includes(queryText) || user.rollNumber.toLowerCase().includes(queryText))
      .slice(0, 25);
  } catch (error) { asHttpsError(error); }
});

export const assignPoc = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    requireGovernance(actor);
    const input = assignmentSchema.parse(request.data);
    await validateScope(input.kind, input.scopeId);
    const assignmentRef = db.doc(`pocAssignments/${pocAssignmentDocumentId(input.kind, input.scopeId, input.seat)}`);
    const counterpartRef = input.kind === "subject" ? db.doc(`pocAssignments/${pocAssignmentDocumentId(input.kind, input.scopeId, input.seat === 1 ? 2 : 1)}`) : null;
    const newUserRef = db.doc(`users/${input.uid}`);
    let replacedUid: string | null = null;
    await db.runTransaction(async (tx) => {
      const [assignment, newUser, counterpart] = await Promise.all([
        tx.get(assignmentRef),
        tx.get(newUserRef),
        counterpartRef ? tx.get(counterpartRef) : Promise.resolve(null),
      ]);
      if (!newUser.exists || !["active", "invited"].includes(String(newUser.get("status")))) throw new HttpsError("not-found", "POC candidate is not active");
      if (counterpart?.exists && counterpart.get("active") === true && counterpart.get("uid") === input.uid) throw new HttpsError("already-exists", "This student already occupies the other Subject POC seat");
      replacedUid = assignment.exists ? String(assignment.get("uid")) : null;
      if (replacedUid && replacedUid !== input.uid) {
        const stillAssignedInCounterpart = counterpart?.exists && counterpart.get("active") === true && counterpart.get("uid") === replacedUid;
        if (!stillAssignedInCounterpart) tx.update(db.doc(`users/${replacedUid}`), { [scopePath(input.kind, input.scopeId)]: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
      }
      tx.update(newUserRef, { [scopePath(input.kind, input.scopeId)]: true, updatedAt: FieldValue.serverTimestamp() });
      tx.set(assignmentRef, {
        kind: input.kind, scopeId: input.scopeId, uid: input.uid, seat: input.kind === "subject" ? input.seat : 1, active: true,
        assignedBy: actor.uid, assignedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
        ...(assignment.get("isTestData") === true ? { isTestData: true } : {}),
        ...(assignment.get("demoSeedId") ? { demoSeedId: assignment.get("demoSeedId") } : {}),
      });
    });
    const seatSuffix = input.kind === "subject" ? `_seat${input.seat}` : "";
    const writer = db.bulkWriter();
    writer.set(db.doc(`users/${input.uid}/notifications/poc_assigned_${input.kind}_${input.scopeId}${seatSuffix}`), {
      type: "poc_assigned", title: "POC responsibility assigned", body: `You now manage ${input.kind.replaceAll("_", " ")} ${input.scopeId === "batch" ? "for the batch" : input.scopeId}${input.kind === "subject" ? ` as POC ${input.seat}` : ""}.`, createdAt: FieldValue.serverTimestamp(), readAt: null,
    }, { merge: true });
    if (replacedUid && replacedUid !== input.uid) writer.set(db.doc(`users/${replacedUid}/notifications/poc_replaced_${input.kind}_${input.scopeId}${seatSuffix}`), {
      type: "poc_revoked", title: "POC responsibility updated", body: `You no longer occupy ${input.kind.replaceAll("_", " ")} ${input.scopeId === "batch" ? "for the batch" : input.scopeId}${input.kind === "subject" ? ` seat ${input.seat}` : ""}.`, createdAt: FieldValue.serverTimestamp(), readAt: null,
    }, { merge: true });
    await writer.close();
    await writeAudit({ actorUid: actor.uid, action: "poc.assigned", resourceType: "pocAssignment", resourceId: assignmentRef.id, before: { uid: replacedUid }, after: input });
    return { ok: true, replacedUid };
  } catch (error) { asHttpsError(error); }
});

export const revokePoc = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    requireGovernance(actor);
    const input = z.object({ kind: z.enum(POC_KINDS), scopeId: z.string().trim().min(1).max(80), seat: z.union([z.literal(1), z.literal(2)]).optional().default(1) }).parse(request.data);
    if ((input.kind === "grooming" || input.kind === "case_competition" || input.kind === "attendance") && input.scopeId !== "batch") throw new HttpsError("invalid-argument", "Batch POC roles must use the batch scope");
    if (input.kind !== "subject" && input.seat !== 1) throw new HttpsError("invalid-argument", "Only Subject POCs use numbered seats");
    const ref = db.doc(`pocAssignments/${pocAssignmentDocumentId(input.kind, input.scopeId, input.seat)}`);
    const counterpartRef = input.kind === "subject" ? db.doc(`pocAssignments/${pocAssignmentDocumentId(input.kind, input.scopeId, input.seat === 1 ? 2 : 1)}`) : null;
    let revokedUid = "";
    await db.runTransaction(async (tx) => {
      const [assignment, counterpart] = await Promise.all([tx.get(ref), counterpartRef ? tx.get(counterpartRef) : Promise.resolve(null)]);
      if (!assignment.exists || assignment.get("active") !== true) return;
      revokedUid = String(assignment.get("uid"));
      const stillAssignedInCounterpart = counterpart?.exists && counterpart.get("active") === true && counterpart.get("uid") === revokedUid;
      if (!stillAssignedInCounterpart) tx.update(db.doc(`users/${revokedUid}`), { [scopePath(input.kind, input.scopeId)]: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
      tx.update(ref, { active: false, revokedBy: actor.uid, revokedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
    const seatSuffix = input.kind === "subject" ? `_seat${input.seat}` : "";
    if (revokedUid) await db.doc(`users/${revokedUid}/notifications/poc_revoked_${input.kind}_${input.scopeId}${seatSuffix}`).set({
      type: "poc_revoked", title: "POC responsibility removed", body: `You no longer occupy ${input.kind.replaceAll("_", " ")} ${input.scopeId === "batch" ? "for the batch" : input.scopeId}${input.kind === "subject" ? ` seat ${input.seat}` : ""}.`, createdAt: FieldValue.serverTimestamp(), readAt: null,
    }, { merge: true });
    await writeAudit({ actorUid: actor.uid, action: "poc.revoked", resourceType: "pocAssignment", resourceId: ref.id, before: { uid: revokedUid }, after: input });
    return { ok: true };
  } catch (error) { asHttpsError(error); }
});

const LEGACY_WINGS = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`W${String(index + 1).padStart(2, "0")}`, WING_IDS[index]]));

export const migrateWingIds = onCall({ ...callableOptions, timeoutSeconds: 300 }, async (request) => {
  try {
    const actor = await requireActor(request);
    if (!actor.roles.systemAdmin) throw new HttpsError("permission-denied", "System administrator access required");
    const operationRef = db.doc("operations/migrate_wings_alpha_v1");
    const existing = await operationRef.get();
    if (existing.get("status") === "complete") return { idempotent: true, updated: existing.get("updated") ?? 0 };
    const [users, tasks, assignments] = await Promise.all([
      db.collection("users").limit(2_000).get(), db.collection("tasks").limit(2_000).get(), db.collection("taskAssignments").limit(10_000).get(),
    ]);
    const writer = db.bulkWriter();
    let updated = 0;
    for (const wing of WING_IDS) writer.set(db.doc(`wings/${wing}`), { name: `Wing ${wing}`, active: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    for (const [oldWing] of Object.entries(LEGACY_WINGS)) writer.set(db.doc(`wings/${oldWing}`), { active: false, migratedTo: LEGACY_WINGS[oldWing], updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    for (const user of users.docs) {
      const mapped = LEGACY_WINGS[String(user.get("wingId"))];
      const oldScopes = user.get("scopes.wingPocWings") as Record<string, true> | undefined;
      const mappedScopes = Object.fromEntries(Object.keys(oldScopes ?? {}).map((id) => [LEGACY_WINGS[id] ?? id, true]));
      if (mapped || JSON.stringify(oldScopes ?? {}) !== JSON.stringify(mappedScopes)) {
        writer.update(user.ref, { ...(mapped ? { wingId: mapped } : {}), "scopes.wingPocWings": mappedScopes, updatedAt: FieldValue.serverTimestamp() }); updated += 1;
      }
    }
    for (const task of tasks.docs) {
      const mapped = LEGACY_WINGS[String(task.get("target.wingId"))];
      if (mapped) { writer.update(task.ref, { "target.wingId": mapped, "target.scopeKey": `wing:${mapped}`, updatedAt: FieldValue.serverTimestamp() }); updated += 1; }
    }
    for (const assignment of assignments.docs) {
      const mapped = LEGACY_WINGS[String(assignment.get("wingId"))];
      if (mapped) { writer.update(assignment.ref, { wingId: mapped, ...(String(assignment.get("scopeKey")).startsWith("wing:") ? { scopeKey: `wing:${mapped}` } : {}), updatedAt: FieldValue.serverTimestamp() }); updated += 1; }
    }
    await writer.close();
    await operationRef.set({ type: "wing_migration", status: "complete", updated, actorUid: actor.uid, completedAt: FieldValue.serverTimestamp() });
    await writeAudit({ actorUid: actor.uid, action: "wings.migrated", resourceType: "catalog", resourceId: "wings", after: { updated } });
    return { updated };
  } catch (error) { asHttpsError(error); }
});
