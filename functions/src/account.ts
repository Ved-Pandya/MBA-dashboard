import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { db, FieldValue } from "./firebase.js";
import { authEmailToRollNumber, type UserProfile } from "@mba/domain";
import { asHttpsError, callableOptions, isBootstrapRollNumber } from "./helpers.js";

export async function loadActivatedProfile(auth: NonNullable<CallableRequest<unknown>["auth"]>): Promise<UserProfile> {
  const ref = db.doc(`users/${auth.uid}`);
  const snap = await ref.get();
  if (!snap.exists) {
    const tokenEmail = String(auth.token.email ?? "").toLowerCase();
    const rollNumber = authEmailToRollNumber(tokenEmail);
    if (!isBootstrapRollNumber(rollNumber)) throw new HttpsError("permission-denied", "This roll number is not on the imported roster");
    const profile: UserProfile = {
      authEmail: tokenEmail,
      displayName: String(auth.token.name ?? "System administrator"),
      rollNumber,
      status: "active",
      sectionId: "A",
      wingId: "A",
      roles: { student: true, cr: false, systemAdmin: true },
      scopes: { crSections: {}, wingPocWings: {}, subjectPocOfferings: {}, batchPocRoles: {} },
    };
    await ref.set({ ...profile, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return profile;
  }
  const profileEmail = String(snap.get("authEmail") ?? "").toLowerCase();
  const tokenEmail = String(auth.token.email ?? "").toLowerCase();
  if (!tokenEmail || profileEmail !== tokenEmail) throw new HttpsError("permission-denied", "Authenticated roll number does not match the roster");
  if (snap.get("status") === "suspended") throw new HttpsError("permission-denied", "This account is suspended");
  if (snap.get("status") === "invited") {
    await ref.update({ status: "active", activatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  }
  if (snap.get("status") !== "active" && snap.get("status") !== "invited") throw new HttpsError("permission-denied", "This account is not active");
  // Return only the dashboard profile, never other administrative document fields.
  return {
    authEmail: profileEmail, displayName: snap.get("displayName"), rollNumber: snap.get("rollNumber"), status: "active",
    sectionId: snap.get("sectionId"), wingId: snap.get("wingId"), roles: snap.get("roles"), scopes: snap.get("scopes"),
  };
}

export const activateMyAccount = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in is required");
    await loadActivatedProfile(request.auth);
    return { status: "active" };
  } catch (error) { asHttpsError(error); }
});
