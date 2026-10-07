"use client";

/**
 * Edit one saved word (opened from /categories, and from a card while
 * studying): which of its dictionary meanings to learn (each ticked one gets
 * its own cards — /api/words/:id/senses), the word, English meaning,
 * own meaning, definition, example, categories; or delete it. Loads and saves
 * through /api/words/:id.
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys.
 */

import { useEffect, useState } from "react";
import type { WordDetails } from "@/lib/words/edit";
import type { ExampleSuggestion } from "@/lib/words/examples";
import type { SenseOption } from "@/lib/words/senses";
import CategorySelect from "./CategorySelect";

/**
 * Edit or delete one saved word. Calls onDone(changed, deleted, studied):
 * changed is false when the user just closed it; deleted is true after a
 * delete; studied lists the senses with cards after a save (cards of other
 * senses no longer exist).
 */
export default function WordEditor({
  wordId,
  allCategoryNames,
  onDone,
}: {
  wordId: string;
  allCategoryNames: string[];
  onDone: (changed: boolean, deleted?: boolean, studiedSenseIds?: string[]) => void;
}) {
  const [word, setWord] = useState<WordDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** Every meaning the dictionary has for the word; null while loading. */
  const [senses, setSenses] = useState<SenseOption[] | null>(null);
  /** Keys of the ticked meanings. */
  const [studied, setStudied] = useState<Set<string>>(new Set());
  /** "Add example": dictionary suggestions on screen, the picked one's extras. */
  const [suggestions, setSuggestions] = useState<ExampleSuggestion[] | null>(null);
  const [picked, setPicked] = useState<ExampleSuggestion | null>(null);
  const [finding, setFinding] = useState<"dictionary" | "ai" | null>(null);

  useEffect(() => {
    fetch(`/api/words/${wordId}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load the word.");
        setWord(data);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load."));
    fetch(`/api/words/${wordId}/senses`)
      .then(async (response) => {
        if (!response.ok) return;
        const data: { senses: SenseOption[] } = await response.json();
        setSenses(data.senses);
        setStudied(new Set(data.senses.filter((s) => s.studied).map((s) => s.key)));
      })
      .catch(() => {
        // The meanings list is optional; the rest of the editor works without it.
      });
  }, [wordId]);

  /**
   * "From dictionary" lists the dictionary's examples to pick from; "Write
   * with AI" fills the field with a new sentence at once. Nothing is saved
   * until Save.
   */
  async function findExample(kind: "dictionary" | "ai") {
    setFinding(kind);
    setError(null);
    setSuggestions(null);
    try {
      const response = await fetch(`/api/words/${wordId}/example`, { method: kind === "ai" ? "POST" : "GET" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not find an example.");
      if (kind === "ai") pickExample(data.example);
      else if (data.examples.length === 0) setError("The dictionary has no examples for this word — try the AI.");
      else setSuggestions(data.examples);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not find an example.");
    } finally {
      setFinding(null);
    }
  }

  /** Put a suggested example into the Example field (with its translation, if any). */
  function pickExample(example: ExampleSuggestion) {
    setPicked(example);
    setSuggestions(null);
    setWord((current) => (current ? { ...current, example: example.text } : current));
  }

  /** Meanings ticked or unticked since the editor opened. */
  const sensesChanged = Boolean(senses?.some((s) => s.studied !== studied.has(s.key)));
  /** Unticking a studied meaning deletes its cards and their progress. */
  const losesProgress = Boolean(senses?.some((s) => s.studied && !studied.has(s.key)));

  /** Save (PATCH) or delete (DELETE) the word, then tell the list to refresh. */
  async function call(method: "PATCH" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      // Meanings first: if that fails, nothing else has changed yet.
      let studiedSenseIds: string[] | undefined;
      if (method === "PATCH" && sensesChanged) {
        const response = await fetch(`/api/words/${wordId}/senses`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studied: [...studied] }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error ?? "Could not save the meanings.");
        studiedSenseIds = data.studiedSenseIds;
      }
      const response = await fetch(`/api/words/${wordId}`, {
        method,
        headers: method === "PATCH" ? { "Content-Type": "application/json" } : undefined,
        body:
          method === "PATCH"
            ? JSON.stringify({
                ...word,
                // A picked suggestion carries its source and translation —
                // unless the user then changed the sentence by hand.
                ...(picked &&
                  picked.text === word?.example && {
                    exampleSource: picked.source,
                    exampleTranslation: picked.translation ?? undefined,
                  }),
              })
            : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Could not save.");
      onDone(true, method === "DELETE", studiedSenseIds);
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
      <div className="flex flex-col gap-1 text-xs text-muted">
        <label className="flex flex-col gap-1">
          Example
          <input
            value={word.example}
            onChange={(e) => set({ example: e.target.value })}
            lang="ko"
            className={`korean text-ink ${field}`}
          />
        </label>
        {picked?.translation && picked.text === word.example && (
          <span className="text-sm text-muted">{picked.translation}</span>
        )}
        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => findExample("dictionary")}
            disabled={finding !== null}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink disabled:opacity-50"
          >
            <i className="bi bi-book mr-1.5" aria-hidden />
            {finding === "dictionary" ? "Looking…" : "Example from dictionary"}
          </button>
          <button
            type="button"
            onClick={() => findExample("ai")}
            disabled={finding !== null}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink disabled:opacity-50"
          >
            <i className="bi bi-stars mr-1.5" aria-hidden />
            {finding === "ai" ? "Writing…" : "Write one with AI"}
          </button>
        </div>
        {suggestions && (
          <ul className="mt-1 overflow-hidden rounded-md border border-line bg-paper">
            {suggestions.map((example) => (
              <li key={example.text} className="border-t border-line/60 first:border-t-0">
                <button
                  type="button"
                  onClick={() => pickExample(example)}
                  className="w-full px-3 py-2 text-left hover:bg-celadon-soft/50"
                >
                  <span className="korean block text-base text-ink">{example.text}</span>
                  {example.translation && <span className="text-sm text-muted">{example.translation}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Definition in Korean
        <input
          value={word.definition}
          onChange={(e) => set({ definition: e.target.value })}
          lang="ko"
          className={`korean text-ink ${field}`}
        />
      </label>

      {senses && senses.length > 1 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="text-xs text-muted">
            Meanings to learn — each ticked one is its own card ({studied.size} of {senses.length})
          </legend>
          <ul className="mt-1 max-h-64 overflow-y-auto rounded-md border border-line bg-paper">
            {senses.map((sense) => (
              <li key={sense.key} className="border-t border-line/60 first:border-t-0">
                <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={studied.has(sense.key)}
                    onChange={(event) => {
                      const next = new Set(studied);
                      if (event.target.checked) next.add(sense.key);
                      else next.delete(sense.key);
                      setStudied(next);
                    }}
                    className="mt-1 size-4 shrink-0 accent-celadon-deep"
                  />
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{sense.translation ?? "—"}</span>
                    {sense.definition && (
                      <span className="korean block text-xs text-muted">{sense.definition}</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {studied.size === 0 && <p className="text-xs text-clay">Keep at least one meaning ticked.</p>}
          {losesProgress && (
            <p className="text-xs text-clay">Unticked meanings lose their cards and progress.</p>
          )}
        </fieldset>
      )}

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
          disabled={busy || (senses !== null && senses.length > 1 && studied.size === 0)}
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
