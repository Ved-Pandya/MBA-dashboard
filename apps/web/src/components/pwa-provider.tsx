"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./auth-provider";
import { applicationServerKey, disableCurrentPushSubscription, getPushDeviceId } from "@/lib/push-client";
import { callFunction, readableError } from "@/lib/callable";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type PushState = "unsupported" | "unavailable" | "default" | "denied" | "enabled";

interface PwaContextValue {
  installed: boolean;
  ios: boolean;
  online: boolean;
  installAvailable: boolean;
  pushState: PushState;
  setupOpen: boolean;
  guidedCardVisible: boolean;
  busy: boolean;
  error: string;
  openSetup: () => void;
  closeSetup: () => void;
  dismissGuidedCard: () => void;
  install: () => Promise<void>;
  enablePush: () => Promise<void>;
  disablePush: () => Promise<void>;
}

const PwaContext = createContext<PwaContextValue | null>(null);
const DISMISSED_UNTIL_KEY = "deadlineos-app-setup-dismissed-until";

function standaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [pushState, setPushState] = useState<PushState>("unavailable");
  const [setupOpen, setSetupOpen] = useState(false);
  const [dismissedUntil, setDismissedUntil] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refreshPushState = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushState("unsupported");
      return;
    }
    if (!process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY) {
      setPushState("unavailable");
      return;
    }
    if (Notification.permission === "denied") {
      setPushState("denied");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    setPushState(Notification.permission === "granted" && subscription ? "enabled" : "default");
  }, []);

  useEffect(() => {
    setInstalled(standaloneMode());
    setIos(isIosDevice());
    setOnline(navigator.onLine);
    setDismissedUntil(Number(window.localStorage.getItem(DISMISSED_UNTIL_KEY) ?? 0));

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => { setInstalled(true); setInstallPrompt(null); };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .then(() => refreshPushState())
        .catch((registrationError) => setError(readableError(registrationError)));
    } else {
      setPushState("unsupported");
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refreshPushState]);

  useEffect(() => { if (user) void refreshPushState(); }, [refreshPushState, user]);

  async function install() {
    setError("");
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  }

  async function enablePush() {
    if (!user || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    if (!installed) { setError("Install DeadlineOS on this device before enabling background notifications."); return; }
    const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
    if (!publicKey) { setPushState("unavailable"); return; }
    setBusy(true);
    setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushState(permission === "denied" ? "denied" : "default");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      });
      await callFunction("registerPushSubscription", {
        deviceId: getPushDeviceId(),
        subscription: subscription.toJSON(),
        userAgent: navigator.userAgent,
      });
      setPushState("enabled");
    } catch (pushError) {
      setError(readableError(pushError));
      await refreshPushState();
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    setBusy(true);
    setError("");
    try {
      await disableCurrentPushSubscription();
      await refreshPushState();
    } catch (pushError) {
      setError(readableError(pushError));
    } finally {
      setBusy(false);
    }
  }

  function dismissGuidedCard() {
    const until = Date.now() + 7 * 24 * 60 * 60_000;
    window.localStorage.setItem(DISMISSED_UNTIL_KEY, String(until));
    setDismissedUntil(until);
  }

  const value = useMemo<PwaContextValue>(() => ({
    installed,
    ios,
    online,
    installAvailable: Boolean(installPrompt),
    pushState,
    setupOpen,
    guidedCardVisible: Boolean(user && Date.now() >= dismissedUntil && (!installed || pushState !== "enabled")),
    busy,
    error,
    openSetup: () => setSetupOpen(true),
    closeSetup: () => setSetupOpen(false),
    dismissGuidedCard,
    install,
    enablePush,
    disablePush,
  }), [busy, dismissedUntil, error, installPrompt, installed, ios, online, pushState, setupOpen, user]);

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa() {
  const value = useContext(PwaContext);
  if (!value) throw new Error("usePwa must be used within PwaProvider");
  return value;
}
