"use client";

/**
 * Invisible helper on the home page: if some words are waiting for the
 * dictionary (needsCheck), it calls /api/verify in the background — up to 5
 * rounds, stopping when nothing is left or the dictionary still is not
 * answering. The counters update on the next visit.
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys. Renders nothing.
 */

import { useEffect } from "react";

/**
 * Mounted on the home page when some words still wait for the dictionary:
 * quietly checks them (a few rounds) — the user does not have to do anything.
 */
export default function BackgroundVerify({ pending }: { pending: number }) {
  useEffect(() => {
    if (pending <= 0) return;
    let cancelled = false;
    (async () => {
      for (let round = 0; round < 5 && !cancelled; round++) {
        try {
          const response = await fetch("/api/verify", { method: "POST" });
          if (!response.ok) return;
          const data: { confirmed: number; notInDictionary: number; remaining: number } =
            await response.json();
          if (data.remaining === 0 || data.confirmed + data.notInDictionary === 0) return;
        } catch {
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pending]);
  return null;
}
