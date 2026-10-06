"use client";

import { useState } from "react";
import CategorySelect from "./CategorySelect";

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

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lemma, translation, definition, example, category }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save.");
      setMessage({ ok: true, text: `“${lemma.trim()}” added.` });
      if (!categories.includes(category)) setExtraCategories((list) => [...list, category]);
      // Keep the category: words are usually entered a topic at a time.
      setLemma("");
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
          <input
            value={lemma}
            onChange={(event) => setLemma(event.target.value)}
            lang="ko"
            required
            maxLength={60}
            placeholder="공원"
            className={`korean text-xl ${field}`}
          />
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
