const CACHE_NAME = "deadlineos-static-v1";
const OFFLINE_ASSETS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html")));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch { payload = { body: event.data?.text() ?? "" }; }
  const title = payload.title || "DeadlineOS update";
  const options = {
    body: payload.body || "Open DeadlineOS to view the update.",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: payload.tag || undefined,
    data: { url: payload.url || "/?notifications=1" },
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    typeof self.navigator?.setAppBadge === "function" ? self.navigator.setAppBadge().catch(() => undefined) : Promise.resolve(),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(Promise.all([
    typeof self.navigator?.clearAppBadge === "function" ? self.navigator.clearAppBadge().catch(() => undefined) : Promise.resolve(),
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(destination);
      return existing.focus();
    }
    return self.clients.openWindow(destination);
    }),
  ]));
});
