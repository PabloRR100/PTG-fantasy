// Padel Fantasy service worker: web push only. It has NO fetch handler on purpose: a blanket
// `respondWith(fetch(...))` stalls every request while a new deploy's worker installs (Betcomm learned this).

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const ICON = "/brand/icon-192.png";

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Padel Fantasy", {
      body: data.body || "Tienes novedades en tu equipo.",
      icon: ICON,
      badge: ICON,
      // Same tag = the phone replaces the previous notification instead of stacking them.
      tag: data.tag || "padel-fantasy",
      data: { url: data.url || "/equipo" },
    }),
  );
});

// Only paths of this site: the payload comes over the network, so it must never be able to open another origin.
function safeUrl(url) {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/equipo";
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(safeUrl(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.navigate(target).then(() => client.focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

// The browser rotated this device's push credentials: store the new subscription and drop the old one.
self.addEventListener("pushsubscriptionchange", (event) => {
  const previous = event.oldSubscription;
  const key = previous && previous.options && previous.options.applicationServerKey;
  if (!key) return;
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).then((subscription) =>
      fetch("/api/push/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON(), previousEndpoint: previous.endpoint }),
      }),
    ),
  );
});
