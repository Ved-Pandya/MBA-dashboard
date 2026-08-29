import { onCall, HttpsError } from "firebase-functions/v2/https";
import { canManagePlacementStatus, placementStatusUpdateSchema, type UserProfile } from "@mba/domain";
import { db, FieldValue } from "./firebase.js";
import { asHttpsError, callableOptions, requireActor, writeAudit } from "./helpers.js";

function requirePlacementManager(actor: UserProfile) {
  if (!canManagePlacementStatus(actor)) throw new HttpsError("permission-denied", "Admin or CR access required");
}

export const getPlacementRoster = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    requirePlacementManager(actor);
    const [users, privateStatuses] = await Promise.all([
      db.collection("users").where("status", "in", ["active", "invited"]).limit(2_000).get(),
      db.collection("placementStatuses").limit(2_000).get(),
    ]);
    const statusByUid = new Map(privateStatuses.docs.map((doc) => [doc.id, doc.data()]));
    return {
      users: users.docs
        .filter((doc) => doc.get("roles.student") === true)
        .map((doc) => {
          const privateStatus = statusByUid.get(doc.id);
          const legacyPlaced = doc.get("placementStatus") === "placed";
          return {
            uid: doc.id,
            displayName: String(doc.get("displayName")),
            rollNumber: String(doc.get("rollNumber")),
            sectionId: String(doc.get("sectionId")),
            wingId: String(doc.get("wingId")),
            placementStatus: privateStatus?.status === "placed" || legacyPlaced ? "placed" : "seeking",
            placedAt: privateStatus?.placedAt ?? (legacyPlaced ? doc.get("placedAt") ?? null : null),
          };
        })
        .sort((left, right) => left.rollNumber.localeCompare(right.rollNumber)),
    };
  } catch (error) { asHttpsError(error); }
});

export const setPlacementStatus = onCall(callableOptions, async (request) => {
  try {
    const actor = await requireActor(request);
    requirePlacementManager(actor);
    const input = placementStatusUpdateSchema.parse(request.data);
    const userRef = db.doc(`users/${input.uid}`);
    const statusRef = db.doc(`placementStatuses/${input.uid}`);
    const [before, privateBefore] = await Promise.all([userRef.get(), statusRef.get()]);
    if (!before.exists || before.get("roles.student") !== true) throw new HttpsError("not-found", "Student not found");
    const legacyPlaced = before.get("placementStatus") === "placed";
    const previousStatus = privateBefore.get("status") === "placed" || legacyPlaced ? "placed" : "seeking";
    const hasLegacyFields = before.get("placementStatus") !== undefined || before.get("placedAt") !== undefined || before.get("placedBy") !== undefined;
    if (previousStatus === input.status && privateBefore.exists && !hasLegacyFields) return { status: input.status, idempotent: true, responsesUpdated: 0 };

    const [responses, archives] = await Promise.all([
      db.collection("internshipResponses").where("uid", "==", input.uid).limit(2_000).get(),
      db.collection("placementResponseHistory").where("uid", "==", input.uid).limit(2_000).get(),
    ]);
    const writer = db.bulkWriter();
    let responsesUpdated = 0;

    if (input.status === "placed") {
      for (const response of responses.docs) {
        writer.set(db.doc(`placementResponseHistory/${response.id}`), {
          uid: input.uid,
          internshipId: response.get("internshipId"),
          responseData: response.data(),
          archivedAt: FieldValue.serverTimestamp(),
          archivedBy: actor.uid,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        writer.delete(response.ref);
        responsesUpdated += 1;
      }
      writer.set(statusRef, {
        uid: input.uid,
        status: "placed",
        placedAt: FieldValue.serverTimestamp(),
        placedBy: actor.uid,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } else {
      const publishedInternships = await db.collection("internships").where("status", "==", "published").limit(1_000).get();
      const publishedIds = new Set(publishedInternships.docs.map((internship) => internship.id));
      const restoredIds = new Set<string>();
      for (const archive of archives.docs) {
        const internshipId = String(archive.get("internshipId"));
        if (!publishedIds.has(internshipId)) continue;
        const responseData = (archive.get("responseData") as Record<string, unknown> | undefined) ?? {};
        writer.set(db.doc(`internshipResponses/${archive.id}`), {
          ...responseData,
          internshipId,
          uid: input.uid,
          status: responseData.status === "not_applicable_placed" ? "no_response" : responseData.status ?? "no_response",
          placementRestoredAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        writer.delete(archive.ref);
        restoredIds.add(internshipId);
        responsesUpdated += 1;
      }
      const existingIds = new Set(responses.docs.map((response) => String(response.get("internshipId"))));
      for (const internship of publishedInternships.docs) {
        if (existingIds.has(internship.id) || restoredIds.has(internship.id)) continue;
        writer.set(db.doc(`internshipResponses/${internship.id}_${input.uid}`), {
          internshipId: internship.id,
          uid: input.uid,
          sectionId: before.get("sectionId"),
          wingId: before.get("wingId"),
          status: "no_response",
          studentSnapshot: { displayName: before.get("displayName"), rollNumber: before.get("rollNumber") },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        responsesUpdated += 1;
      }
      writer.set(statusRef, {
        uid: input.uid,
        status: "seeking",
        placedAt: FieldValue.delete(),
        placedBy: FieldValue.delete(),
        updatedBy: actor.uid,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    writer.update(userRef, {
      placementStatus: FieldValue.delete(),
      placedAt: FieldValue.delete(),
      placedBy: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await writer.close();
    await writeAudit({
      actorUid: actor.uid,
      action: "student.placement_status_updated",
      resourceType: "placementStatus",
      resourceId: input.uid,
      before: { placementStatus: previousStatus },
      after: { placementStatus: input.status, responsesUpdated },
      reason: input.reason,
    });
    return { status: input.status, responsesUpdated };
  } catch (error) { asHttpsError(error); }
});
