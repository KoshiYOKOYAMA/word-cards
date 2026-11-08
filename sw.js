// Keeps the app's files on the phone so it opens without a connection.
// Bump VERSION whenever index.html changes so phones pick up the new copy.
const VERSION = "v22";
const FILES = ["./", "./index.html", "./manifest.json", "./icon-180.png", "./icon-512.png"];

self.addEventListener("install", e => {
  // cache: "reload" skips the browser's own short-term cache so the newest files are stored
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, {cache: "reload"})))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first so updates arrive, but on a weak signal don't wait: if the network
// hasn't answered within NETWORK_WAIT_MS, open the saved copy. The download keeps
// going in the background and refreshes the saved copy for next time.
const NETWORK_WAIT_MS = 2500;
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  const key = url.origin + url.pathname;             // ignore ?query so every visit shares one saved copy
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const saved = await cache.match(key, {ignoreSearch: true})
      || (e.request.mode === "navigate" ? await cache.match("./index.html") : undefined);
    const network = fetch(e.request, {cache: "no-store"}).then(res => {
      if (res.ok) cache.put(key, res.clone());
      return res;
    });
    e.waitUntil(network.then(() => {}, () => {}));
    if (!saved) return network.catch(() => cache.match("./index.html"));
    const timeout = new Promise(resolve => setTimeout(() => resolve(null), NETWORK_WAIT_MS));
    try { return (await Promise.race([network, timeout])) || saved; }
    catch (err) { return saved; }                    // offline: the request failed right away
  })());
});
