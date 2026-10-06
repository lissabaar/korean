"use client";

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
