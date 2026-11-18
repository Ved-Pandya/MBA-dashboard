"use client";

import { getFirebaseAuth } from "./firebase-auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
export { firebaseConfigured } from "./firebase-auth";

let services: (ReturnType<typeof getFirebaseAuth> & { db: Firestore }) | null = null;

export function getFirebase() {
  if (services) return services;
  const authServices = getFirebaseAuth();
  const db = getFirestore(authServices.app);

  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  services = { ...authServices, db };
  return services;
}
