"use client";

import { useEffect, useState } from "react";
import type { WordDetails } from "@/lib/words/edit";
import CategorySelect from "./CategorySelect";

/** Edit or delete one saved word. Calls onDone(true) when something changed. */
export default function WordEditor({
  wordId,
  allCategoryNames,
  onDone,
}: {
  wordId: string;
  allCategoryNames: string[];
  onDone: (changed: boolean) => void;
}) {
  const [word, setWord] = useState<WordDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    fetch(`/api/words/${wordId}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load the word.");
        setWord(data);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load."));
  }, [wordId]);

  async function call(method: "PATCH" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/words/${wordId}`, {
        method,
        headers: method === "PATCH" ? { "Content-Type": "application/json" } : undefined,
        body: method === "PATCH" ? JSON.stringify(word) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not save.");
      onDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
      setBusy(false);
    }
  }

  if (!word) {
    return <p className="px-4 py-3 text-sm text-muted">{error ?? "Loading…"}</p>;
  }

  const set = (change: Partial<WordDetails>) => setWord({ ...word, ...change });
  const field =
    "rounded-md border border-line bg-paper px-3 py-2 text-base outline-none focus:border-celadon";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        call("PATCH");
      }}
      className="flex flex-col gap-3 bg-celadon-soft/40 px-4 py-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Korean
          <input
            value={word.lemma}
            onChange={(e) => set({ lemma: e.target.value })}
            lang="ko"
            className={`korean text-lg text-ink ${field}`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Meaning in English
          <input
            value={word.translation}
            onChange={(e) => set({ translation: e.target.value })}
            className={`text-ink ${field}`}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Your own meaning (any language)
        <input
          value={word.userMeaning}
          onChange={(e) => set({ userMeaning: e.target.value })}
          className={`text-ink ${field}`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Example
        <input
          value={word.example}
          onChange={(e) => set({ example: e.target.value })}
          lang="ko"
          className={`korean text-ink ${field}`}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Definition in Korean
        <input
          value={word.definition}
          onChange={(e) => set({ definition: e.target.value })}
          lang="ko"
          className={`korean text-ink ${field}`}
        />
      </label>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted">Categories</span>
        {word.categories.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-1 rounded-full bg-surface px-2.5 py-1 text-xs"
          >
            {name}
            <button
              type="button"
              onClick={() => set({ categories: word.categories.filter((c) => c !== name) })}
              aria-label={`Remove from ${name}`}
              className="text-muted hover:text-clay"
            >
              ✕
            </button>
          </span>
        ))}
        <CategorySelect
          value=""
          placeholder="+ Add to category"
          options={allCategoryNames.filter((name) => !word.categories.includes(name))}
          onChange={(name) => set({ categories: [...word.categories, name] })}
        />
      </div>

      {error && <p className="rounded-md bg-clay-soft px-3 py-2 text-sm text-clay">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-celadon-deep px-4 py-2 text-sm font-medium text-paper disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => onDone(false)}
          className="rounded-md border border-line bg-surface px-4 py-2 text-sm"
        >
          Cancel
        </button>
        {confirmDelete ? (
          <span className="ml-auto flex items-center gap-2 text-sm">
            Delete with its review history?
            <button
              type="button"
              onClick={() => call("DELETE")}
              disabled={busy}
              className="rounded-md bg-clay px-3 py-2 text-paper"
            >
              Delete
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="ml-auto rounded-md px-3 py-2 text-sm text-muted hover:text-clay"
          >
            <i className="bi bi-trash mr-1" aria-hidden />
            Delete word
          </button>
        )}
      </div>
    </form>
  );
}
