import { callFunction } from "./callable";
import { isVapidPublicKey, normalizeVapidKey } from "@mba/domain";

const DEVICE_ID_KEY = "deadlineos-push-device-id";

export function getPushDeviceId() {
  let deviceId = window.localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export function applicationServerKey(value: string) {
  const normalized = normalizeVapidKey(value);
  if (!isVapidPublicKey(normalized)) throw new Error("Push notifications are not configured with a valid VAPID public key.");
  const padding = "=".repeat((4 - normalized.length % 4) % 4);
  const raw = window.atob((normalized + padding).replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export async function disableCurrentPushSubscription() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  const deviceId = getPushDeviceId();
  try {
    await callFunction("removePushSubscription", { deviceId });
  } finally {
    await subscription?.unsubscribe();
  }
}
