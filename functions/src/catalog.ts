import { onCall, HttpsError } from "firebase-functions/v2/https";
import { z } from "zod";
import { WING_IDS } from "@mba/domain";
import { db, FieldValue } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor, requireAdmin, writeAudit } from "./helpers.js";

const offeringSchema = z.object({
  offeringId: z.string().regex(/^[A-Za-z0-9_-]{2,60}$/),
  subjectCode: z.string().trim().min(2).max(20),
  subjectName: z.string().trim().min(2).max(100),
  sectionId: z.enum(["A", "B"]),
  termId: z.string().trim().min(1).max(40),
  active: z.boolean().default(true),
});

export const saveSubjectOffering = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    requireAdmin(actor);
    const input = offeringSchema.parse(request.data);
    await db.doc(`subjectOfferings/${input.offeringId}`).set({ ...input, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await writeAudit({ actorUid: actor.uid, action: "subject_offering.saved", resourceType: "subjectOffering", resourceId: input.offeringId, after: input });
    return { ok: true };
  } catch (error) { asHttpsError(error); }
});

const configSchema = z.object({ batchName: z.string().trim().min(2).max(100), currentTermId: z.string().trim().min(1).max(40) });

export const initializeAppConfig = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request, true);
    requireAdmin(actor);
    const input = configSchema.parse(request.data);
    const writer = db.bulkWriter();
    writer.set(db.doc("appConfig/current"), {
      ...input,
      timezone: "Asia/Kolkata",
      reminderPolicy: { studentOffsetsMinutes: [1440, 120], overdueDelayMinutes: 15, dailyOverdueDigestLocalTime: "08:00" },
      rosterVersion: 0,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    writer.set(db.doc(`academicTerms/${input.currentTermId}`), { name: input.currentTermId, active: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    for (const sectionId of ["A", "B"]) writer.set(db.doc(`sections/${sectionId}`), { name: `Section ${sectionId}`, active: true }, { merge: true });
    for (const wingId of WING_IDS) writer.set(db.doc(`wings/${wingId}`), { name: `Wing ${wingId}`, active: true }, { merge: true });
    await writer.close();
    await writeAudit({ actorUid: actor.uid, action: "app.initialized", resourceType: "appConfig", resourceId: "current", after: input });
    return { ok: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    asHttpsError(error);
  }
});
