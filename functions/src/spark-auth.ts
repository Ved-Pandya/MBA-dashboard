import { HttpsError } from "firebase-functions/v2/https";
import { adminAuth, adminAppCheck, db } from "./firebase.js";

// Kept separate from the operation registry so session startup stays small.
export async function verifySparkIdToken(idToken: string) {
  if (!idToken) throw new HttpsError("unauthenticated", "Sign in is required");
  return adminAuth.verifyIdToken(idToken, true);
}

export async function verifySparkAppCheck(token?: string) {
  if (process.env.ENFORCE_APP_CHECK !== "true" || process.env.FIREBASE_AUTH_EMULATOR_HOST) return;
  if (!token) throw new HttpsError("unauthenticated", "App verification is required. Reload the app and try again.");
  try { await adminAppCheck.verifyToken(token); }
  catch { throw new HttpsError("unauthenticated", "App verification expired. Reload the app and try again."); }
}

export async function enforceSparkRateLimit(uid: string) {
  const minute = Math.floor(Date.now() / 60_000);
  const rateRef = db.doc(`apiRateLimits/${uid}`);
  await db.runTransaction(async (tx) => {
    const state = await tx.get(rateRef);
    const count = state.get("minute") === minute ? Number(state.get("count") ?? 0) : 0;
    if (count >= 60) throw new HttpsError("resource-exhausted", "Too many requests. Wait a minute and try again.");
    tx.set(rateRef, { minute, count: count + 1 });
  });
}
