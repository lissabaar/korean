"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function StarterDeckButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/starter-deck", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not add the starter deck.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add the starter deck.");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={add}
        disabled={busy}
        className="mt-4 rounded-md bg-celadon-deep px-5 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
      >
        <i className="bi bi-box-seam mr-1.5" aria-hidden />
        {busy ? "Adding…" : "Add the starter deck"}
      </button>
      {error && <p className="mt-2 text-sm text-clay">{error}</p>}
    </>
  );
}
