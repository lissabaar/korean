"use client";

/**
 * Invisible helper in the app layout: for an account with no words yet it
 * calls POST /api/starter-categories once and then refreshes the page, so
 * the ready-made categories and their words show up.
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys. Renders nothing.
 *
 * Done from the browser rather than while rendering the page, so no page
 * waits for ~350 words to be saved.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function StarterSeed() {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/starter-categories", { method: "POST" });
        const data: { added?: number; linked?: number } = await response.json().catch(() => ({}));
        // New words or links: show them (counters, category list).
        if (!cancelled && response.ok && ((data.added ?? 0) > 0 || (data.linked ?? 0) > 0)) router.refresh();
      } catch {
        // Offline or the server busy: the next page load tries again.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);
  return null;
}
