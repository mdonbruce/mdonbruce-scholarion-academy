/* Scholarion Academy service worker.
 * - Static assets (Next build output, brand, icons): cache-first.
 * - Pages and the API: always from the network, never cached (no one's data stays on a shared device).
 * - Offline navigations fall back to /offline.
 */
const VERSION = "v1";
const STATIC = `sch-static-${VERSION}`;
const OFFLINE = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((c) => c.addAll([OFFLINE, "/icons/icon-192.png", "/brand/scholarion-emblem.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/brand/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(STATIC).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Pages are never cached: signed-in pages carry personal data, and even public pages
  // show the viewer's name. Offline navigations get the offline page instead.
  if (req.mode === "navigate") event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
});
