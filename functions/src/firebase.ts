import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";

if (!getApps().length) {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
  initializeApp(projectId && clientEmail && privateKey
    ? { credential: cert({ projectId, clientEmail, privateKey }), projectId }
    : undefined);
}

export const db = getFirestore();
export const adminAuth = getAuth();
export const adminFunctions = getFunctions();
export { FieldValue, Timestamp };
