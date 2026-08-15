import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { WING_IDS, type UserProfile } from "@mba/domain";
import { db, FieldValue } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor, requireString, writeAudit } from "./helpers.js";

function requireGovernance(actor: UserProfile) {
  if (!actor.roles.systemAdmin && !actor.roles.cr) throw new HttpsError("permission-denied", "Admin or CR access required");
}

const assignmentSchema = z.object({
  kind: z.enum(["wing", "subject"]),
  scopeId: z.string().trim().min(1).max(80),
  uid: z.string().min(1),
});

function scopePath(kind: "wing" | "subject", scopeId: string) {
  return kind === "wing" ? `scopes.wingPocWings.${scopeId}` : `scopes.subjectPocOfferings.${scopeId}`;
}

async function validateScope(kind: "wing" | "subject", scopeId: string) {
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
      assignments: assignments.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
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
    const assignmentRef = db.doc(`pocAssignments/${input.kind}_${input.scopeId}`);
    const newUserRef = db.doc(`users/${input.uid}`);
    let replacedUid: string | null = null;
    await db.runTransaction(async (tx) => {
      const [assignment, newUser] = await Promise.all([tx.get(assignmentRef), tx.get(newUserRef)]);
      if (!newUser.exists || !["active", "invited"].includes(String(newUser.get("status")))) throw new HttpsError("not-found", "POC candidate is not active");
      replacedUid = assignment.exists ? String(assignment.get("uid")) : null;
      if (replacedUid && replacedUid !== input.uid) {
        tx.update(db.doc(`users/${replacedUid}`), { [scopePath(input.kind, input.scopeId)]: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
      }
      tx.update(newUserRef, { [scopePath(input.kind, input.scopeId)]: true, updatedAt: FieldValue.serverTimestamp() });
      tx.set(assignmentRef, {
        kind: input.kind, scopeId: input.scopeId, uid: input.uid, active: true,
        assignedBy: actor.uid, assignedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
    });
    const writer = db.bulkWriter();
    writer.set(db.doc(`users/${input.uid}/notifications/poc_assigned_${input.kind}_${input.scopeId}`), {
      type: "poc_assigned", title: "POC responsibility assigned", body: `You now manage ${input.kind} ${input.scopeId}.`, createdAt: FieldValue.serverTimestamp(), readAt: null,
    }, { merge: true });
    if (replacedUid && replacedUid !== input.uid) writer.set(db.doc(`users/${replacedUid}/notifications/poc_replaced_${input.kind}_${input.scopeId}`), {
      type: "poc_revoked", title: "POC responsibility updated", body: `You no longer manage ${input.kind} ${input.scopeId}.`, createdAt: FieldValue.serverTimestamp(), readAt: null,
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
    const input = assignmentSchema.omit({ uid: true }).parse(request.data);
    const ref = db.doc(`pocAssignments/${input.kind}_${input.scopeId}`);
    let revokedUid = "";
    await db.runTransaction(async (tx) => {
      const assignment = await tx.get(ref);
      if (!assignment.exists || assignment.get("active") !== true) return;
      revokedUid = String(assignment.get("uid"));
      tx.update(db.doc(`users/${revokedUid}`), { [scopePath(input.kind, input.scopeId)]: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
      tx.update(ref, { active: false, revokedBy: actor.uid, revokedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    });
    if (revokedUid) await db.doc(`users/${revokedUid}/notifications/poc_revoked_${input.kind}_${input.scopeId}`).set({
      type: "poc_revoked", title: "POC responsibility removed", body: `You no longer manage ${input.kind} ${input.scopeId}.`, createdAt: FieldValue.serverTimestamp(), readAt: null,
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
