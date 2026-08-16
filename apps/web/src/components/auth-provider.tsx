"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { rollNumberToAuthEmail } from "@mba/domain";
import { doc, onSnapshot } from "firebase/firestore";
import type { Profile } from "@/lib/models";
import { callFunction, readableError } from "@/lib/callable";
import { firebaseConfigured, getFirebase } from "@/lib/firebase";

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
    const { auth, db } = getFirebase();
    let unsubscribeProfile: (() => void) | undefined;
    return onAuthStateChanged(auth, async (nextUser) => {
      unsubscribeProfile?.();
      setUser(nextUser);
      setProfile(null);
      setError(null);
      if (!nextUser) {
        setLoading(false);
        return;
      }
      try {
        await callFunction("activateMyAccount", {});
        unsubscribeProfile = onSnapshot(
          doc(db, "users", nextUser.uid),
          (snap) => {
            setProfile(snap.exists() ? (snap.data() as Profile) : null);
            setLoading(false);
          },
          (profileError) => {
            setError(readableError(profileError));
            setLoading(false);
          },
        );
      } catch (activationError) {
        setError(readableError(activationError));
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    let stopped = false;
    const pulse = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const idToken = await user.getIdToken();
        await fetch("/api/maintenance/pulse", {
          method: "POST",
          headers: { authorization: `Bearer ${idToken}` },
          keepalive: true,
        });
      } catch {
        // Maintenance is best-effort on Spark; ordinary app actions remain available.
      }
    };
    void pulse();
    const interval = window.setInterval(() => void pulse(), 5 * 60_000);
    const onVisibilityChange = () => { if (document.visibilityState === "visible") void pulse(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [user]);

  const signIn = useCallback(async (rollNumber: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(getFirebase().auth, rollNumberToAuthEmail(rollNumber), password);
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
    await signOut(getFirebase().auth);
  }, []);

  const value = useMemo(() => ({ user, profile, loading, error, signIn, signOutUser }), [user, profile, loading, error, signIn, signOutUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
