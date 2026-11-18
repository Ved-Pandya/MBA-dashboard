"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, type Auth } from "firebase/auth";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from "firebase/app-check";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);
let services: { app: FirebaseApp; auth: Auth; appCheck?: AppCheck } | null = null;

/** The login page needs Auth, not the Firestore SDK or dashboard components. */
export function getFirebaseAuth() {
  if (!firebaseConfigured) throw new Error("Firebase environment variables are not configured");
  if (services) return services;
  const app = getApps().length ? getApp() : initializeApp(config);
  // Password sign-in needs no OAuth popup/redirect iframe startup.
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] });
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;
  const appCheck = siteKey && typeof window !== "undefined"
    ? initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true })
    : undefined;
  services = { app, auth, appCheck };
  return services;
}
