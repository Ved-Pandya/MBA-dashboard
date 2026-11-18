import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { DEMO_ACCOUNTS, DEMO_SEED_ID, rollNumberToAuthEmail, type DemoSummary } from "@mba/domain";
import { adminAuth, db, FieldValue, Timestamp } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor, requireAdmin, writeAudit, type Actor } from "./helpers.js";
import { ensureDemoAccounts, resetDemoAccountPasswords } from "./test-accounts.js";
import { DEMO_STATS_SOURCES } from "./demo-metadata.js";
import { buildDemoFixtures, DEMO_OFFERING_IDS, type DemoIdentity } from "./demo-fixtures.js";

const inputSchema = z.object({ origin: z.string().url().optional(), resetPasswords: z.boolean().optional().default(false) });
const DEMO_COLLECTIONS = ["academicTerms", "subjectOfferings", "timetableSlots", "timetableExceptions", "academicEvents", "competitions", "competitionTeams", "competitionTeamNames", "competitionMemberships", "competitionRounds", "competitionRoundEntries", "opportunityResponses", "internships", "internshipResponses", "tasks", "taskAssignments", "taskStats", "reminderJobs", "reminderDeliveries", "competitionStats", "internshipStats", "competitionRoundStats", "pocAssignments", "crTasks", "pushJobs", "pushDeliveries", "sessionIntimations", "sessionResponses", "sessionStats", "generalPolls", "pollResponses", "pollStats", "placementStatuses", "placementResponseHistory"];

function demoOrigin(value?: string) {
  const url = new URL(value ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://example.com"));
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new HttpsError("invalid-argument", "Use an HTTPS origin or a local demo server");
  return url.origin;
}

async function demoIdentities(): Promise<DemoIdentity[]> {
  return Promise.all(DEMO_ACCOUNTS.map(async (spec) => {
    let user;
    try { user = await adminAuth.getUserByEmail(rollNumberToAuthEmail(spec.rollNumber)); }
    catch (error) { if ((error as { code?: string }).code === "auth/user-not-found") throw new HttpsError("failed-precondition", "Use Prepare 15-minute demo to prepare the six protected demo accounts first"); throw error; }
    const profile = await db.doc(`users/${user.uid}`).get();
    if (profile.get("isTestAccount") !== true) throw new HttpsError("failed-precondition", `${spec.rollNumber} belongs to a non-demo account`);
    return { ...spec, uid: user.uid };
  }));
}

/** Prevent two administrator tabs from clearing and seeding over each other. */
async function withDemoLease<T>(actor: Actor, work: () => Promise<T>, updateDemoHealth = true) {
  const ref = db.doc("operations/demo_seed");
  const lease = `${actor.uid}_${Date.now()}_${Math.random()}`;
  await db.runTransaction(async (tx) => {
    const previous = await tx.get(ref);
    if (previous.get("leaseUntil")?.toMillis() > Date.now()) throw new HttpsError("aborted", "Another sample-data operation is running. Wait for it to finish.");
    tx.set(ref, { type: "demo_seed", status: "processing", actorUid: actor.uid, lease, leaseUntil: Timestamp.fromMillis(Date.now() + 240_000), updatedAt: FieldValue.serverTimestamp() });
  });
  try { const result = await work(); await ref.set({ status: "complete", leaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); return result; }
  catch (error) { await ref.set({ status: "failed", leaseUntil: FieldValue.delete(), recovery: "Retry the requested demo operation.", updatedAt: FieldValue.serverTimestamp() }, { merge: true }); if (updateDemoHealth) await db.doc("systemHealth/demoData").set({ status: "failed", updatedAt: FieldValue.serverTimestamp() }, { merge: true }); throw error; }
}

async function deleteDemoSeedRecords() {
  const writer = db.bulkWriter(); let deleted = 0;
  const writes: Promise<unknown>[] = [], failures: unknown[] = [];
  const queue = (write: Promise<unknown>) => writes.push(write.catch((error) => { failures.push(error); }));
  const removed = new Set<string>();
  const legacyStats: FirebaseFirestore.DocumentReference[] = [];
  const remove = (ref: FirebaseFirestore.DocumentReference) => { if (!removed.has(ref.path)) { removed.add(ref.path); queue(writer.delete(ref)); deleted++; } };
  const collections = [...DEMO_COLLECTIONS, "users"];
  for (let index = 0; index < collections.length; index += 8) {
    const snapshots = await Promise.all(collections.slice(index, index + 8).map(async (collection) => ({ collection, docs: await db.collection(collection).where("demoSeedId", "==", DEMO_SEED_ID).get() })));
    for (const { collection, docs } of snapshots) {
      for (const doc of docs.docs) {
        // Only report-only synthetic profiles are disposable. Sign-in profiles remain.
        if (collection === "users" && doc.get("isDemoRoster") !== true) continue;
        if (doc.get("isTestData") === true) {
          const statsCollection = Object.keys(DEMO_STATS_SOURCES).find((key) => DEMO_STATS_SOURCES[key] === collection);
          if (statsCollection) legacyStats.push(db.doc(`${statsCollection}/${doc.id}`));
        }
        remove(doc.ref);
      }
    }
  }
  // Older reconcilers dropped provenance. Only a tagged parent proves ownership;
  // a demo-looking ID alone never permits deleting another record.
  for (let index = 0; index < legacyStats.length; index += 150) {
    const stats = await db.getAll(...legacyStats.slice(index, index + 150));
    stats.forEach((stat) => {
      if (stat.exists && stat.get("isTestData") !== false && (stat.get("demoSeedId") === undefined || stat.get("demoSeedId") === DEMO_SEED_ID)) remove(stat.ref);
    });
  }
  for (const spec of DEMO_ACCOUNTS) {
    let account;
    try { account = await adminAuth.getUserByEmail(rollNumberToAuthEmail(spec.rollNumber)); }
    catch (error) { if ((error as { code?: string }).code === "auth/user-not-found") continue; throw error; }
    const ref = db.doc(`users/${account.uid}`), user = await ref.get();
    if (user.get("isTestAccount") !== true) continue;
    const notices = await ref.collection("notifications").get();
    const removedNotices = new Set<string>();
    notices.docs.forEach((notice) => {
      const linked = ["taskId", "crTaskId", "sessionId", "pollId", "opportunityId", "competitionId", "internshipId", "academicEventId", "eventId"].some((key) => String(notice.get(key) ?? "").startsWith("demo_"));
      if (notice.get("demoSeedId") === DEMO_SEED_ID || linked) { remove(notice.ref); removedNotices.add(notice.ref.path); }
    });
    const pushJobs = await db.collection("pushJobs").where("uid", "==", account.uid).get();
    for (const job of pushJobs.docs) if (removedNotices.has(String(job.get("notificationPath")))) {
      remove(job.ref);
      const deliveries = await db.collection("pushDeliveries").where("jobId", "==", job.id).get();
      deliveries.docs.forEach((delivery) => remove(delivery.ref));
    }
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    DEMO_OFFERING_IDS.forEach((id) => { patch[`scopes.subjectPocOfferings.${id}`] = FieldValue.delete(); });
    if (spec.key === "poc") for (const role of ["grooming", "attendance", "caseCompetition"]) patch[`scopes.batchPocRoles.${role}`] = FieldValue.delete();
    if (spec.key === "wing") patch["scopes.wingPocWings.A"] = FieldValue.delete();
    queue(writer.update(ref, patch));
  }
  const reminderDeliveries = await db.collection("reminderDeliveries").where("jobId", ">=", "demo_").where("jobId", "<=", "demo_\uf8ff").get();
  reminderDeliveries.docs.forEach((delivery) => remove(delivery.ref));
  await writer.close(); await Promise.all(writes); if (failures.length) throw failures[0]; return deleted;
}

async function seed(actor: Actor, origin: string, identities: DemoIdentity[]) {
  const plan = buildDemoFixtures(identities, actor.uid, origin, Date.now());
  // Fixed fixture IDs must never replace an unrelated document, even by accident.
  for (let i = 0; i < plan.records.length; i += 150) {
    const existing = await db.getAll(...plan.records.slice(i, i + 150).map((r) => db.doc(r.path)));
    for (const doc of existing) {
      if (!doc.exists || doc.get("demoSeedId") === DEMO_SEED_ID) continue;
      const sourceCollection = DEMO_STATS_SOURCES[doc.ref.parent.id];
      const source = sourceCollection && doc.get("demoSeedId") === undefined && doc.get("isTestData") !== false ? await db.doc(`${sourceCollection}/${doc.id}`).get() : null;
      if (source?.get("demoSeedId") === DEMO_SEED_ID && source.get("isTestData") === true) continue;
      throw new HttpsError("already-exists", `Sample ID ${doc.ref.path} is occupied by non-demo data. No sample records were replaced.`);
    }
  }
  await db.doc("systemHealth/demoData").set({ status: "preparing", phase: "clearing", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await deleteDemoSeedRecords();
  await db.doc("systemHealth/demoData").set({ phase: "writing", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.runTransaction(async (tx) => {
    const defaults: Array<[string, Record<string, unknown>]> = [
      ["appConfig/current", { batchName: "Demo MBA Batch", currentTermId: "DEMO-TERM", timezone: "Asia/Kolkata" }],
      ...["A", "B"].flatMap((id): Array<[string, Record<string, unknown>]> => [[`sections/${id}`, { name: `Section ${id}`, active: true }], [`wings/${id}`, { name: `Wing ${id}`, active: true }]]),
    ];
    const existing = await Promise.all(defaults.map(([path]) => tx.get(db.doc(path))));
    defaults.forEach(([path, data], i) => { if (!existing[i]!.exists) tx.create(db.doc(path), { ...data, isTestData: true, updatedAt: FieldValue.serverTimestamp() }); });
  });
  const writer = db.bulkWriter();
  const writes: Promise<unknown>[] = plan.records.map((r) => writer.set(db.doc(r.path), r.data));
  const subjectScopes: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  DEMO_OFFERING_IDS.forEach((id) => { subjectScopes[`scopes.subjectPocOfferings.${id}`] = true; });
  writes.push(writer.update(db.doc(`users/${plan.subjectPocUid}`), subjectScopes));
  writes.push(writer.update(db.doc(`users/${plan.wingPocUid}`), { "scopes.subjectPocOfferings.DEMO-FIN-A": true, "scopes.wingPocWings.A": true, updatedAt: FieldValue.serverTimestamp() }));
  await Promise.all([writer.close(), ...writes]);
  // Fill unoccupied demonstration seats without displacing a real wing or batch POC.
  plan.counts.sharedResponsibilitySeats = await db.runTransaction(async (tx) => {
    const seats = [
      { id: "wing_A", kind: "wing", scopeId: "A", uid: plan.wingPocUid, role: "" },
      { id: "grooming_batch", kind: "grooming", scopeId: "batch", uid: plan.subjectPocUid, role: "grooming" },
      { id: "attendance_batch", kind: "attendance", scopeId: "batch", uid: plan.subjectPocUid, role: "attendance" },
      { id: "case_competition_batch", kind: "case_competition", scopeId: "batch", uid: plan.subjectPocUid, role: "caseCompetition" },
    ];
    const refs = seats.map((seat) => db.doc(`pocAssignments/${seat.id}`));
    const existing = await Promise.all(refs.map((ref) => tx.get(ref)));
    let count = 0;
    seats.forEach((seat, i) => {
      if (existing[i]!.exists && existing[i]!.get("demoSeedId") !== DEMO_SEED_ID) return;
      count++;
      tx.set(refs[i]!, { kind: seat.kind, scopeId: seat.scopeId, uid: seat.uid, seat: 1, active: true, isTestData: true, demoSeedId: DEMO_SEED_ID, assignedBy: actor.uid, assignedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      if (seat.role) tx.update(db.doc(`users/${seat.uid}`), { [`scopes.batchPocRoles.${seat.role}`]: true });
    });
    return count;
  });
  await writeAudit({ actorUid: actor.uid, action: "test_data.seeded", resourceType: "demoSeed", resourceId: DEMO_SEED_ID, after: plan.counts });
  await db.doc("systemHealth/demoData").set({ seedId: DEMO_SEED_ID, status: "ready", phase: "ready", generatedAt: plan.generatedAt, reminderAt: plan.reminderAt, counts: plan.counts, updatedAt: FieldValue.serverTimestamp() });
  return plan;
}

export const prepareDemoData = onCall({ ...callableOptions, timeoutSeconds: 240 }, async (request) => {
  try {
    const actor = await requireActor(request); requireAdmin(actor);
    const input = inputSchema.parse(request.data ?? {}), origin = demoOrigin(input.origin);
    return await withDemoLease(actor, async (): Promise<DemoSummary> => {
      await db.doc("systemHealth/demoData").set({ status: "preparing", phase: "accounts", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      const prepared = await ensureDemoAccounts(actor);
      const { accounts } = prepared;
      const plan = await seed(actor, origin, accounts);
      const credentials = input.resetPasswords ? (await resetDemoAccountPasswords(actor)).credentials : prepared.credentials;
      return { seedId: DEMO_SEED_ID, generatedAt: plan.generatedAt, reminderAt: plan.reminderAt, counts: plan.counts, accounts: DEMO_ACCOUNTS.map(({ role, rollNumber }) => ({ role, rollNumber })), credentials };
    });
  } catch (error) { asHttpsError(error); }
});

/** Reset credentials without clearing, rebuilding or validating sample fixtures. */
export const resetDemoPasswords = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request); requireAdmin(actor);
    return await withDemoLease(actor, () => resetDemoAccountPasswords(actor), false);
  } catch (error) { asHttpsError(error); }
});

// Retain the existing callable for scripts; the prominent UI uses prepareDemoData.
export const seedTestData = onCall({ ...callableOptions, timeoutSeconds: 240 }, async (request) => {
  try { const actor = await requireActor(request); requireAdmin(actor); const input = inputSchema.parse(request.data ?? {}); return await withDemoLease(actor, async () => (await seed(actor, demoOrigin(input.origin), await demoIdentities())).counts); }
  catch (error) { asHttpsError(error); }
});

export const clearTestData = onCall({ ...callableOptions, timeoutSeconds: 240 }, async (request) => {
  try {
    const actor = await requireActor(request); requireAdmin(actor);
    return await withDemoLease(actor, async () => {
      const deleted = await deleteDemoSeedRecords();
      await db.doc("systemHealth/demoData").set({ status: "cleared", seedId: DEMO_SEED_ID, updatedAt: FieldValue.serverTimestamp() });
      await writeAudit({ actorUid: actor.uid, action: "test_data.cleared", resourceType: "demoSeed", resourceId: DEMO_SEED_ID, after: { deleted } });
      return { deleted };
    });
  } catch (error) { asHttpsError(error); }
});
