import { onCall, HttpsError } from "firebase-functions/v2/https";
import { db, FieldValue } from "./firebase.js";
import { authEmailToRollNumber } from "@mba/domain";
import { asHttpsError, callableOptions, isBootstrapRollNumber } from "./helpers.js";

export const activateMyAccount = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in is required");
    const ref = db.doc(`users/${request.auth.uid}`);
    const snap = await ref.get();
    if (!snap.exists) {
      const tokenEmail = String(request.auth.token.email ?? "").toLowerCase();
      const rollNumber = authEmailToRollNumber(tokenEmail);
      if (!isBootstrapRollNumber(rollNumber)) throw new HttpsError("permission-denied", "This roll number is not on the imported roster");
      await ref.set({
        authEmail: tokenEmail,
        displayName: String(request.auth.token.name ?? "System administrator"),
        rollNumber,
        status: "active",
        sectionId: "A",
        wingId: "W01",
        roles: { student: true, cr: false, systemAdmin: true },
        scopes: { crSections: {}, wingPocWings: {}, subjectPocOfferings: {} },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { status: "active" };
    }
    const profileEmail = String(snap.get("authEmail") ?? "").toLowerCase();
    const tokenEmail = String(request.auth.token.email ?? "").toLowerCase();
    if (!tokenEmail || profileEmail !== tokenEmail) throw new HttpsError("permission-denied", "Authenticated roll number does not match the roster");
    if (snap.get("status") === "suspended") throw new HttpsError("permission-denied", "This account is suspended");
    if (snap.get("status") === "invited") {
      await ref.update({ status: "active", activatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
    return { status: "active" };
  } catch (error) { asHttpsError(error); }
});
