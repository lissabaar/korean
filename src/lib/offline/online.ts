/**
 * Is there a connection? The browser's own navigator.onLine, corrected by
 * what the app actually sees: a request that failed or timed out means
 * offline (onLine stays true on plane Wi-Fi without a plan, or a dead
 * signal), one that succeeded means online.
 *
 * Browser-only library. Review.tsx reports results (markOffline /
 * markOnline); the nav (useOnline) hides pages that need the server while
 * offline. A window event carries the change to every component.
 */

import { useSyncExternalStore } from "react";

const EVENT = "hangugo:connection";
/** What the app last saw; null = nothing yet, trust navigator.onLine. */
let seen: boolean | null = null;

/** Current best guess. */
export function isOnline(): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  return seen ?? true;
}

/** A request failed for lack of a connection. */
export function markOffline(): void {
  if (seen === false) return;
  seen = false;
  window.dispatchEvent(new Event(EVENT));
}

/** A request reached the server. */
export function markOnline(): void {
  if (seen === true) return;
  seen = true;
  window.dispatchEvent(new Event(EVENT));
}

/** Re-render on any change: the browser's online/offline events or ours. */
function subscribe(listener: () => void) {
  const back = () => {
    // The browser says the connection is back: trust it until a request fails.
    seen = null;
    listener();
  };
  window.addEventListener("online", back);
  window.addEventListener("offline", listener);
  window.addEventListener(EVENT, listener);
  return () => {
    window.removeEventListener("online", back);
    window.removeEventListener("offline", listener);
    window.removeEventListener(EVENT, listener);
  };
}

/** React hook: true while online. On the server (and first render) it says online. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, isOnline, () => true);
}

/**
 * fetch() that gives up after `ms`: a hanging request (weak signal, captive
 * Wi-Fi) fails as a TypeError like a dropped one, so callers fall back to the
 * offline copy in seconds instead of waiting for the system timeout.
 */
export async function fetchWithTimeout(input: string, init: RequestInit = {}, ms = 4000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    throw new TypeError("No connection");
  } finally {
    clearTimeout(timer);
  }
}
