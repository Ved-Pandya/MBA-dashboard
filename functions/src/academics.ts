import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { createHash } from "node:crypto";
import { academicEventSchema, timetableImportSchema, type UserProfile } from "@mba/domain";
import { db, FieldValue, Timestamp } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor, writeAudit } from "./helpers.js";

function canGovernAcademics(actor: UserProfile) {
  return actor.roles.systemAdmin || actor.roles.cr;
}

function normalizeId(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

async function requireOfferingAccess(actor: UserProfile, offeringId: string) {
  const offering = await db.doc(`subjectOfferings/${offeringId}`).get();
  if (!offering.exists || offering.get("active") !== true) throw new HttpsError("not-found", "Subject offering is not active");
  if (!canGovernAcademics(actor) && actor.scopes.subjectPocOfferings[offeringId] !== true) {
    throw new HttpsError("permission-denied", "This subject offering is outside your POC scope");
  }
  return offering;
}

async function notifySection(sectionId: string, notificationId: string, payload: Record<string, unknown>) {
  const recipients = await db.collection("users").where("sectionId", "==", sectionId).where("status", "in", ["active", "invited"]).limit(1_000).get();
  const writer = db.bulkWriter();
  for (const recipient of recipients.docs) {
    writer.set(db.doc(`users/${recipient.id}/notifications/${notificationId}`), {
      ...payload,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
    }, { merge: true });
  }
  await writer.close();
  return recipients.size;
}

export const commitTimetableImport = onCall({ ...callableOptions, timeoutSeconds: 120 }, async (request) => {
  try {
    const actor = await requireActor(request);
    if (!canGovernAcademics(actor)) throw new HttpsError("permission-denied", "Admin or CR access required");
    const input = timetableImportSchema.parse(request.data);
    const importHash = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16);
    const operationId = `timetable_${normalizeId(input.termId)}_${importHash}`;
    const operationRef = db.doc(`operations/${operationId}`);
    const existing = await operationRef.get();
    if (existing.get("status") === "complete") return { ...existing.data(), idempotent: true };

    const offeringMap = new Map<string, { subjectCode: string; subjectName: string; sectionId: "A" | "B" }>();
    input.rows.forEach((row) => {
      const offeringId = `${normalizeId(row.subjectCode)}-${row.sectionId}`;
      offeringMap.set(offeringId, { subjectCode: row.subjectCode, subjectName: row.subjectName, sectionId: row.sectionId });
    });
    const writer = db.bulkWriter();
    writer.set(db.doc(`academicTerms/${input.termId}`), {
      name: input.termId,
      startDate: input.termStartIso,
      endDate: input.termEndIso,
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    for (const [offeringId, offering] of offeringMap) {
      writer.set(db.doc(`subjectOfferings/${offeringId}`), {
        ...offering,
        termId: input.termId,
        active: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
    input.rows.forEach((row, index) => {
      const offeringId = `${normalizeId(row.subjectCode)}-${row.sectionId}`;
      const slotId = `${normalizeId(input.termId)}_${offeringId}_${row.weekday}_${row.startTime.replace(":", "")}_${index}`;
      writer.set(db.doc(`timetableSlots/${slotId}`), {
        offeringId,
        termId: input.termId,
        sectionId: row.sectionId,
        weekday: row.weekday,
        startTime: row.startTime,
        endTime: row.endTime,
        room: row.room ?? "",
        active: true,
        source: "confirmed_pdf_or_manual",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    writer.set(operationRef, {
      type: "timetable_import",
      status: "complete",
      actorUid: actor.uid,
      termId: input.termId,
      offeringCount: offeringMap.size,
      slotCount: input.rows.length,
      completedAt: FieldValue.serverTimestamp(),
    });
    await writer.close();
    await writeAudit({ actorUid: actor.uid, action: "timetable.imported", resourceType: "academicTerm", resourceId: input.termId, after: { rows: input.rows.length, offerings: offeringMap.size } });
    return { offeringCount: offeringMap.size, slotCount: input.rows.length, operationId };
  } catch (error) { asHttpsError(error); }
});

const updateEventSchema = academicEventSchema.partial().extend({ eventId: z.string().min(1), offeringId: z.string().min(1) });
const cancelEventSchema = z.object({ eventId: z.string().min(1), reason: z.string().trim().min(3).max(500) });

export const createAcademicEvent = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = academicEventSchema.parse(request.data);
    const offering = await requireOfferingAccess(actor, input.offeringId);
    const ref = db.collection("academicEvents").doc();
    const demoMetadata = offering.get("demoSeedId") ? { isTestData: true, demoSeedId: offering.get("demoSeedId") } : {};
    const event = {
      offeringId: input.offeringId,
      sectionId: String(offering.get("sectionId")),
      termId: String(offering.get("termId")),
      eventType: input.eventType,
      title: input.title,
      details: input.details,
      occursAt: Timestamp.fromDate(new Date(input.occursAtIso)),
      resourceUrl: input.resourceUrl || null,
      timetableSlotId: input.timetableSlotId || null,
      status: "published",
      version: 1,
      ownerUid: actor.uid,
      ...demoMetadata,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    await ref.set(event);
    const recipientCount = await notifySection(String(offering.get("sectionId")), `academic_created_${ref.id}_v1`, {
      type: "academic_event_created", title: input.title, body: `${input.eventType.replaceAll("_", " ")} added to your academic calendar.`, academicEventId: ref.id, ...demoMetadata,
    });
    await writeAudit({ actorUid: actor.uid, action: "academic_event.created", resourceType: "academicEvent", resourceId: ref.id, after: event });
    return { eventId: ref.id, recipientCount };
  } catch (error) { asHttpsError(error); }
});

export const updateAcademicEvent = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = updateEventSchema.parse(request.data);
    const ref = db.doc(`academicEvents/${input.eventId}`);
    const before = await ref.get();
    if (!before.exists) throw new HttpsError("not-found", "Academic event not found");
    const existingOfferingId = String(before.get("offeringId"));
    if (input.offeringId !== existingOfferingId) throw new HttpsError("failed-precondition", "An event cannot move to another subject offering");
    await requireOfferingAccess(actor, existingOfferingId);
    if (before.get("status") !== "published") throw new HttpsError("failed-precondition", "Only published events can be updated");
    const nextVersion = Number(before.get("version") ?? 1) + 1;
    const patch: Record<string, unknown> = { version: nextVersion, updatedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() };
    if (input.title !== undefined) patch.title = input.title;
    if (input.details !== undefined) patch.details = input.details;
    if (input.eventType !== undefined) patch.eventType = input.eventType;
    if (input.occursAtIso !== undefined) patch.occursAt = Timestamp.fromDate(new Date(input.occursAtIso));
    if (input.resourceUrl !== undefined) patch.resourceUrl = input.resourceUrl || null;
    if (input.timetableSlotId !== undefined) patch.timetableSlotId = input.timetableSlotId || null;
    await ref.update(patch);
    await notifySection(String(before.get("sectionId")), `academic_changed_${ref.id}_v${nextVersion}`, {
      type: "academic_event_changed", title: String(patch.title ?? before.get("title")), body: "An academic calendar item was updated.", academicEventId: ref.id, ...(before.get("demoSeedId") ? { isTestData: true, demoSeedId: before.get("demoSeedId") } : {}),
    });
    await writeAudit({ actorUid: actor.uid, action: "academic_event.updated", resourceType: "academicEvent", resourceId: ref.id, before: before.data(), after: patch });
    return { eventId: ref.id, version: nextVersion };
  } catch (error) { asHttpsError(error); }
});

export const cancelAcademicEvent = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    const input = cancelEventSchema.parse(request.data);
    const ref = db.doc(`academicEvents/${input.eventId}`);
    const before = await ref.get();
    if (!before.exists) throw new HttpsError("not-found", "Academic event not found");
    await requireOfferingAccess(actor, String(before.get("offeringId")));
    if (before.get("status") === "cancelled") return { eventId: ref.id, idempotent: true };
    const version = Number(before.get("version") ?? 1) + 1;
    await ref.update({ status: "cancelled", cancellationReason: input.reason, version, cancelledBy: actor.uid, cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    await notifySection(String(before.get("sectionId")), `academic_cancelled_${ref.id}_v${version}`, {
      type: "academic_event_cancelled", title: String(before.get("title")), body: `Cancelled: ${input.reason}`, academicEventId: ref.id, ...(before.get("demoSeedId") ? { isTestData: true, demoSeedId: before.get("demoSeedId") } : {}),
    });
    await writeAudit({ actorUid: actor.uid, action: "academic_event.cancelled", resourceType: "academicEvent", resourceId: ref.id, before: before.data(), reason: input.reason });
    return { eventId: ref.id };
  } catch (error) { asHttpsError(error); }
});
