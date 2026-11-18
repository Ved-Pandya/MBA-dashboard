"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { rollNumberToAuthEmail } from "@mba/domain";
import type { Profile } from "@/lib/models";
import { loadSession, readableError, authenticatedHeaders } from "@/lib/callable";
import { firebaseConfigured, getFirebaseAuth } from "@/lib/firebase-auth";

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  signIn: (rollNumber: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    const { auth } = getFirebaseAuth();
    let unsubscribeProfile: (() => void) | undefined;
    let generation = 0;
    const unsubscribeAuth = onAuthStateChanged(auth, async (nextUser) => {
      const current = ++generation;
      unsubscribeProfile?.();
      setUser(nextUser);
      setProfile(null);
      setError(null);
      if (!nextUser) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const session = await loadSession();
        if (current !== generation) return;
        // The API already verified revocation, roster membership and activation.
        // Start the dashboard now; its reads need not wait for another profile trip.
        setProfile(session.profile);
        setLoading(false);
        const [{ getFirebase }, { doc, onSnapshot }] = await Promise.all([import("@/lib/firebase"), import("firebase/firestore")]);
        if (current !== generation) return;
        const { db } = getFirebase();
        unsubscribeProfile = onSnapshot(
          doc(db, "users", nextUser.uid),
          (snap) => {
            if (current !== generation) return;
            if (snap.metadata.fromCache) return;
            const updated = snap.exists() ? snap.data() as Profile : null;
            if (!updated || updated.status !== "active" || updated.authEmail.toLowerCase() !== nextUser.email?.toLowerCase()) {
              setProfile(null);
              setError("Your account is no longer active. Contact your administrator.");
              return;
            }
            setProfile(updated);
          },
          (profileError) => {
            if (current !== generation) return;
            setProfile(null);
            setError(profileError.code === "permission-denied" ? "Your account access has changed. Sign in again or contact your administrator." : readableError(profileError));
          },
        );
      } catch (activationError) {
        if (current !== generation) return;
        setProfile(null);
        setError(readableError(activationError));
        setLoading(false);
      }
    });
    return () => { generation++; unsubscribeAuth(); unsubscribeProfile?.(); };
  }, []);

  const active = profile?.status === "active";
  useEffect(() => {
    if (!user || !active) return;
    let stopped = false;
    let lastAttempt = 0;
    const readyAt = Date.now() + 10_000;
    const pulse = async () => {
      if (stopped || document.visibilityState === "hidden" || Date.now() < readyAt || Date.now() - lastAttempt < 5 * 60_000) return;
      lastAttempt = Date.now();
      try {
        await fetch("/api/maintenance/pulse", {
          method: "POST",
          headers: await authenticatedHeaders(),
          keepalive: true,
        });
      } catch {
        // Maintenance is best-effort on Spark; ordinary app actions remain available.
      }
    };
    // Scheduled maintenance remains independent; spare initial page reads this work.
    const initial = window.setTimeout(() => void pulse(), 10_000);
    const interval = window.setInterval(() => void pulse(), 5 * 60_000);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void pulse(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user, active]);

  const signIn = useCallback(async (rollNumber: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(getFirebaseAuth().auth, rollNumberToAuthEmail(rollNumber), password);
    } catch (signInError) {
      setError(readableError(signInError));
      setLoading(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    try {
      const { disableCurrentPushSubscription } = await import("@/lib/push-client");
      await disableCurrentPushSubscription();
    } catch {
      // Signing out still invalidates the local Push API endpoint even if server cleanup is unavailable.
    }
    await signOut(getFirebaseAuth().auth);
  }, []);

  const value = useMemo(() => ({ user, profile, loading, error, signIn, signOutUser }), [user, profile, loading, error, signIn, signOutUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
