import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";

function normalizePrivateKey(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  const unquoted = trimmed.length >= 2
    && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))
    ? trimmed.slice(1, -1)
    : trimmed;
  return unquoted.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");
}

if (!getApps().length) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);
  const usingEmulators = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST);

  if (projectId && clientEmail && privateKey) {
    try {
      initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId });
    } catch (error) {
      throw new Error(
        "Firebase Admin credentials are invalid. Re-enter FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY in Vercel.",
        { cause: error },
      );
    }
  } else if (usingEmulators) {
    initializeApp({ projectId: projectId || process.env.GCLOUD_PROJECT || "demo-deadlineos" });
  } else {
    const missing = [
      !projectId && "FIREBASE_ADMIN_PROJECT_ID",
      !clientEmail && "FIREBASE_ADMIN_CLIENT_EMAIL",
      !privateKey && "FIREBASE_ADMIN_PRIVATE_KEY",
    ].filter(Boolean);
    throw new Error(`Missing Vercel server environment variables: ${missing.join(", ")}`);
  }
}

export const db = getFirestore();
export const adminAuth = getAuth();
export const adminFunctions = getFunctions();
export { FieldValue, Timestamp };
