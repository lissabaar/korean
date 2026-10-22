"use client";

/**
 * Invisible helper in the app layout that keeps offline study ready:
 *   1. sends answers made offline (POST /api/offline/sync) and drops the
 *      ones the server took;
 *   2. refreshes the offline pack (GET /api/offline/pack) — reviews due in
 *      the next days and new words — when it is missing, older than
 *      PACK_MAX_AGE, or right after a sync;
 *   3. registers the service worker (public/sw.js) that keeps the app's pages
 *      and files, so the app opens without a connection at all.
 * Runs on every page load and again whenever the browser comes back online.
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys. Renders nothing. See lib/offline for the rest.
 */

import { useEffect } from "react";
import { dropEvents, loadPack, queuedEvents, savePack, setCurrentOfflineUser } from "@/lib/offline/store";
import type { OfflinePack } from "@/lib/offline/types";

/** A pack older than this is rebuilt on the next page load. */
const PACK_MAX_AGE_MS = 15 * 60 * 1000;

export default function OfflineSync({ userId }: { userId: string }) {
  useEffect(() => {
    setCurrentOfflineUser(userId);
    // Production only: in development the worker would serve stale code.
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // No worker (old browser, blocked): the app still works online.
      });
    }

    let running = false;
    async function run() {
      if (running || !navigator.onLine) return;
      running = true;
      try {
        let synced = false;
        const events = queuedEvents(userId);
        if (events.length > 0) {
          const response = await fetch("/api/offline/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ events }),
          });
          if (response.ok) {
            dropEvents(userId, events.map((event) => event.id));
            synced = true;
          }
        }
        const pack = loadPack(userId);
        const stale = !pack || Date.now() - Date.parse(pack.createdAt) > PACK_MAX_AGE_MS;
        // Never rebuild over unsent answers: the pack would bring back cards
        // already answered offline.
        if ((stale || synced) && queuedEvents(userId).length === 0) {
          const response = await fetch("/api/offline/pack");
          if (response.ok) savePack((await response.json()) as OfflinePack);
        }
      } catch {
        // Connection dropped mid-way: everything stays queued for next time.
      } finally {
        running = false;
      }
    }

    void run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [userId]);
  return null;
}
