/* Cache only the player shell and versioned Next assets. Never cache API authority. */
const shellCache = "easyad-player-shell-v1";
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
function allowedAsset(value) {
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin && url.pathname.startsWith("/_next/static/");
  } catch { return false; }
}
async function trim(cache) {
  const keys = await cache.keys();
  const assets = keys.filter(key => new URL(key.url).pathname !== "/player");
  for (const key of assets.slice(0, Math.max(0, assets.length - 200))) await cache.delete(key);
}
self.addEventListener("message", event => {
  if (event.data?.type !== "warm-player" || !Array.isArray(event.data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(shellCache);
    const response = await fetch("/player", { cache: "reload" });
    if (!response.ok) return;
    const markup = await response.clone().text();
    const required = [...markup.matchAll(/(?:src|href)="(\/_next\/static\/[^"<>]+)"/g)].map(match => new URL(match[1].replaceAll("&amp;", "&"), self.location.origin).href);
    const assets = [...new Set([...required, ...event.data.urls.filter(allowedAsset).map(url => new URL(url, self.location.origin).href)])].slice(0, 200);
    await Promise.all(assets.map(async url => {
      const file = await fetch(url);
      if (!file.ok) throw new Error("Player shell asset unavailable");
      await cache.put(url, file);
    }));
    // Publish the shell only after all its startup assets have been cached.
    await cache.put("/player", response);
    await trim(cache);
  })().catch(() => {}));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (event.request.mode === "navigate" && url.pathname === "/player") {
    event.respondWith(fetch(event.request).catch(async () => (await caches.open(shellCache)).match("/player")));
    return;
  }
  if (allowedAsset(url.href)) event.respondWith((async () => {
    const cache = await caches.open(shellCache);
    const existing = await cache.match(event.request);
    if (existing) return existing;
    const response = await fetch(event.request);
    if (response.ok) { await cache.put(event.request, response.clone()); await trim(cache); }
    return response;
  })());
});
