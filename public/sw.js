/*
 * Service worker: lets the app open with no connection (offline study).
 *
 * Plain browser script served as /sw.js, registered by <OfflineSync/> in the
 * app layout (production only). The browser runs it in the background and
 * routes the site's requests through the "fetch" handler below.
 *
 *   - Pages (Home, Learn, Review …): network first; every page that loads is
 *     kept, together with the script and style files it refers to. Offline,
 *     the kept copy is served — or the Review page as a fallback.
 *   - Built files (/_next/static, fonts): cache first — their names change
 *     with every deploy, so a kept file is never out of date.
 *   - API calls are never cached here: offline study uses the card pack the
 *     app itself keeps (src/lib/offline), and answers wait in its queue.
 *
 * Bump CACHE to drop everything kept (e.g. after changing this file).
 */

const CACHE = "hangugo-v1";
/** Pages kept right away, so offline study works even before visiting them. */
const PAGES = ["/", "/learn", "/review"];

/** Keep a page and every /_next/static file its HTML refers to. */
async function keepPage(cache, url, response) {
  await cache.put(url, response.clone());
  const html = await response.text();
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
  await Promise.all(
    assets.map(async (asset) => {
      if (await cache.match(asset)) return;
      try {
        const file = await fetch(asset);
        if (file.ok) await cache.put(asset, file);
      } catch {
        // Offline already: kept next time.
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        PAGES.map(async (page) => {
          try {
            const response = await fetch(page, { credentials: "include" });
            if (response.ok) await keepPage(cache, page, response);
          } catch {
            // No connection during install: pages are kept as they are visited.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Built files: cache first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const kept = await cache.match(url.pathname);
        if (kept) return kept;
        const response = await fetch(request);
        if (response.ok) await cache.put(url.pathname, response.clone());
        return response;
      })(),
    );
    return;
  }

  // Full page loads: network first, the kept copy when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const response = await fetch(request);
          if (response.ok) event.waitUntil(keepPage(cache, url.pathname, response.clone()));
          return response;
        } catch {
          return (
            (await cache.match(url.pathname)) ||
            (await cache.match("/review")) ||
            new Response("Offline — open the app once with a connection first.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })(),
    );
  }
  // Everything else (in-app navigation data, images): straight to the
  // network. When it fails offline, Next.js falls back to a full page load,
  // which the handler above serves from the kept copy.
});
