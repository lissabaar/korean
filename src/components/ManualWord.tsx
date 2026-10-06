"use client";

import { useState } from "react";
import { levelLabel, posLabel } from "@/lib/dictionary/labels";
import CategorySelect from "./CategorySelect";

interface Found {
  targetCode: string | null;
  lemma: string;
  originalForm: string | null;
  partOfSpeech: string | null;
  level: string | null;
  translation: string | null;
  definition: string | null;
}

/** Add one word by hand: no AI, no dictionary, works for everyone. */
export default function ManualWord({ categories }: { categories: string[] }) {
  const [lemma, setLemma] = useState("");
  const [translation, setTranslation] = useState("");
  const [definition, setDefinition] = useState("");
  const [example, setExample] = useState("");
  const [category, setCategory] = useState("uncategorised");
  const [extraCategories, setExtraCategories] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [found, setFound] = useState<Found[] | null>(null);
  const [picked, setPicked] = useState<Found | null>(null);
  const [looking, setLooking] = useState(false);

  /** Dictionary lookup — no AI. Fills the form; everything stays editable. */
  async function lookUp() {
    const q = lemma.trim();
    if (!q) return;
    setLooking(true);
    setMessage(null);
    setFound(null);
    try {
      const response = await fetch(`/api/dictionary?q=${encodeURIComponent(q)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Lookup failed.");
      if (data.entries.length === 0) {
        setMessage({ ok: false, text: `The dictionary has no “${q}”. Fill the fields in yourself.` });
      } else if (data.entries.length === 1) {
        pick(data.entries[0]);
      } else {
        setFound(data.entries);
      }
    } catch (cause) {
      setMessage({ ok: false, text: cause instanceof Error ? cause.message : "Lookup failed." });
    } finally {
      setLooking(false);
    }
  }

  function pick(entry: Found) {
    setPicked(entry);
    setFound(null);
    setLemma(entry.lemma);
    if (entry.translation) setTranslation(entry.translation);
    if (entry.definition) setDefinition(entry.definition);
    // The search result has no examples; the dictionary's entry page does.
    if (entry.targetCode && !example.trim()) {
      fetch(`/api/dictionary/examples?code=${encodeURIComponent(entry.targetCode)}`)
        .then((response) => response.json())
        .then((data: { examples?: string[] }) => {
          const first = data.examples?.[0];
          if (first) setExample((current) => current || first);
        })
        .catch(() => {});
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lemma,
          translation,
          definition,
          example,
          category,
          dictionary: picked && picked.lemma === lemma.trim() ? picked : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save.");
      setMessage({ ok: true, text: `“${lemma.trim()}” added.` });
      if (!categories.includes(category)) setExtraCategories((list) => [...list, category]);
      // Keep the category: words are usually entered a topic at a time.
      setLemma("");
      setPicked(null);
      setTranslation("");
      setDefinition("");
      setExample("");
    } catch (cause) {
      setMessage({ ok: false, text: cause instanceof Error ? cause.message : "Could not save." });
    } finally {
      setBusy(false);
    }
  }

  const field =
    "rounded-md border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-celadon";

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Korean word</span>
          <span className="flex gap-2">
            <input
              value={lemma}
              onChange={(event) => setLemma(event.target.value)}
              lang="ko"
              required
              maxLength={60}
              placeholder="공원"
              className={`korean min-w-0 flex-1 text-xl ${field}`}
            />
            <button
              type="button"
              onClick={lookUp}
              disabled={looking || !lemma.trim()}
              title="Fill in from the dictionary"
              className="rounded-md border border-line px-3 text-sm disabled:opacity-50"
            >
              <i className={`bi ${looking ? "bi-hourglass-split" : "bi-search"} sm:mr-1.5`} aria-hidden />
              <span className="hidden sm:inline">Dictionary</span>
            </button>
          </span>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Meaning in English</span>
          <input
            value={translation}
            onChange={(event) => setTranslation(event.target.value)}
            required
            maxLength={200}
            placeholder="park"
            className={field}
          />
        </label>
      </div>

      {found && (
        <div className="rounded-md border border-line bg-surface">
          <p className="px-3 pt-2 text-xs text-muted">Several meanings — pick one:</p>
          <ul>
            {found.map((entry, index) => (
              <li key={entry.targetCode ?? index}>
                <button
                  type="button"
                  onClick={() => pick(entry)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-celadon-soft"
                >
                  <span className="korean text-base">{entry.lemma}</span>
                  {entry.originalForm && <span className="korean ml-1.5 text-muted">{entry.originalForm}</span>}
                  <span className="ml-2">{entry.translation ?? entry.definition}</span>
                  <span className="ml-2 text-xs text-muted">
                    {[levelLabel(entry.level), posLabel(entry.partOfSpeech)].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">
          Example sentence <span className="font-normal text-muted">(optional)</span>
        </span>
        <input
          value={example}
          onChange={(event) => setExample(event.target.value)}
          lang="ko"
          maxLength={500}
          placeholder="친구랑 공원에서 산책했어요."
          className={`korean ${field}`}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">
          Definition in Korean <span className="font-normal text-muted">(optional)</span>
        </span>
        <input
          value={definition}
          onChange={(event) => setDefinition(event.target.value)}
          lang="ko"
          maxLength={500}
          className={`korean ${field}`}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Category</span>
        <CategorySelect
          value={category}
          options={[...new Set([...categories, ...extraCategories])]}
          onChange={setCategory}
        />
      </div>

      {message && (
        <p
          role="status"
          className={`rounded-md px-3 py-2 text-sm ${
            message.ok ? "bg-celadon-soft text-celadon-deep" : "bg-clay-soft text-clay"
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-celadon-deep px-4 py-3 font-medium text-paper disabled:opacity-50 sm:w-auto sm:self-start sm:px-8"
      >
        {busy ? "Saving…" : "Add word"}
      </button>
    </form>
  );
}
