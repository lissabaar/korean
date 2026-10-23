/*
 * Service worker: lets the app open with no connection (offline study).
 *
 * Plain browser script served as /sw.js, registered by <OfflineSync/> in the
 * app layout (production only). The browser runs it in the background and
 * routes the site's requests through the "fetch" handler below.
 *
 *   - Pages (Home, Learn, Review …): network first, but a page with a kept
 *     copy waits for the network at most NAVIGATION_WAIT_MS — then the copy
 *     is shown (a hanging request on plane Wi-Fi or a weak signal used to
 *     leave the app on a blank screen). Every page that loads is kept,
 *     together with the script and style files it refers to. Offline, the
 *     kept copy is served — or the Review page as a fallback.
 *   - Built files (/_next/static, fonts): cache first — their names change
 *     with every deploy, so a kept file is never out of date.
 *   - API calls are never cached here: offline study uses the card pack the
 *     app itself keeps (src/lib/offline), and answers wait in its queue.
 *
 * Bump CACHE to drop everything kept (e.g. after changing this file).
 */

const CACHE = "hangugo-v1";
/** Pages kept right away, so offline study works even before visiting them. */
const PAGES = ["/", "/learn", "/review", "/how-it-works"];
/** How long a page with a kept copy waits for the network. */
const NAVIGATION_WAIT_MS = 3000;
/** How long in-app navigation data waits before the full-page fallback. */
const RSC_WAIT_MS = 2500;

/** A promise that fails after `ms` — raced against a slow fetch. */
function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

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
        const kept = await cache.match(url.pathname);
        // Known offline: the copy at once, no waiting.
        if (kept && self.navigator && self.navigator.onLine === false) return kept;
        const network = fetch(request).then((response) => {
          if (response.ok) event.waitUntil(keepPage(cache, url.pathname, response.clone()));
          return response;
        });
        // Keep the page fresh even when the copy is shown this time.
        event.waitUntil(network.catch(() => undefined));
        try {
          return await (kept ? Promise.race([network, timeout(NAVIGATION_WAIT_MS)]) : network);
        } catch {
          return (
            kept ||
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
  // In-app navigation data (Next.js asks for a page's data with an "RSC"
  // header): known offline, fail at once; otherwise give the network
  // RSC_WAIT_MS. Next.js then falls back to a full page load, which the
  // handler above serves from the kept copy — instead of hanging.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    if (self.navigator && self.navigator.onLine === false) {
      event.respondWith(Response.error());
      return;
    }
    event.respondWith(Promise.race([fetch(request), timeout(RSC_WAIT_MS)]).catch(() => Response.error()));
  }
  // Everything else (images): straight to the network.
});
