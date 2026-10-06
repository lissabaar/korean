"use client";

import { useState } from "react";
import { categoryIcon } from "@/lib/category-icons";
import IconPicker from "./IconPicker";

export interface WordView {
  id: string;
  lemma: string;
  translation: string | null;
}

export interface CategoryView {
  id: string;
  name: string;
  icon: string;
  learnActive: boolean;
  reviewActive: boolean;
  words: WordView[];
}

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

export default function CategoryList({
  initial,
  looseWords,
  askRecognition: initialAsk,
}: {
  initial: CategoryView[];
  looseWords: WordView[];
  askRecognition: boolean;
}) {
  const [categories, setCategories] = useState(initial);
  const [askRecognition, setAskRecognition] = useState(initialAsk);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  /** Optimistic: flip locally, roll back if the server refuses. */
  async function patch(id: string, change: Partial<CategoryView>) {
    const before = categories;
    setCategories((list) => list.map((c) => (c.id === id ? { ...c, ...change } : c)));
    setError(null);
    try {
      await send(`/api/categories/${id}`, "PATCH", change);
    } catch (cause) {
      setCategories(before);
      setError(cause instanceof Error ? cause.message : "Could not save.");
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await send(`/api/categories/${id}`, "DELETE");
      setCategories((list) => list.filter((c) => c.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete.");
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    try {
      const created: { id: string; name: string } = await send("/api/categories", "POST", {
        name: newName,
      });
      setNewName("");
      if (!categories.some((c) => c.id === created.id)) {
        const view: CategoryView = {
          ...created,
          icon: categoryIcon(created.name, null),
          learnActive: true,
          reviewActive: true,
          words: [],
        };
        setCategories((list) => [...list, view].sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create.");
    }
  }

  async function toggleRecognition(value: boolean) {
    setAskRecognition(value);
    try {
      await send("/api/settings", "PATCH", { askRecognition: value });
    } catch (cause) {
      setAskRecognition(!value);
      setError(cause instanceof Error ? cause.message : "Could not save.");
    }
  }

  const learning = categories.filter((c) => c.learnActive).length;
  const reviewing = categories.filter((c) => c.reviewActive).length;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-6">
        <p className="korean text-4xl text-celadon-deep">분류</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Categories</h1>
        <p className="mt-2 text-sm text-muted">
          Choose what you study. <strong className="font-medium text-ink">Learn</strong> decides
          where new words come from, <strong className="font-medium text-ink">Review</strong>{" "}
          which learned words come back. A word takes part if any of its categories is on.
        </p>
      </header>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-clay-soft px-3 py-2.5 text-sm text-clay">
          {error}
        </p>
      )}

      <section className="mb-6 rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-medium">Review direction</h2>
        <p className="mt-1 text-sm text-muted">
          Cards show the English meaning and ask for the Korean word.
        </p>
        <label className="mt-3 flex items-center gap-3 text-sm">
          <Switch checked={askRecognition} onChange={toggleRecognition} label="Also ask Korean → English" />
          Also ask Korean → English
        </label>
      </section>

      {categories.length > 0 && (
        <p className="mb-2 text-xs text-muted">
          Learning from {learning} of {categories.length} · reviewing {reviewing} of{" "}
          {categories.length}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {categories.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            onPatch={(change) => patch(category.id, change)}
            onDelete={() => remove(category.id)}
          />
        ))}
        {looseWords.length > 0 && (
          <li className="rounded-lg border border-dashed border-line bg-surface">
            <details>
              <summary className="cursor-pointer px-4 py-3 text-sm">
                <i className="bi bi-inbox mr-2 text-muted" aria-hidden />
                No category · {looseWords.length} — always studied
              </summary>
              <WordList words={looseWords} />
            </details>
          </li>
        )}
      </ul>

      <form onSubmit={create} className="mt-5 flex gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          maxLength={60}
          placeholder="New category"
          aria-label="New category name"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-celadon"
        />
        <button
          type="submit"
          disabled={!newName.trim()}
          className="rounded-md bg-celadon-deep px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
        >
          <i className="bi bi-plus-lg sm:mr-1.5" aria-hidden />
          <span className="hidden sm:inline">Create</span>
        </button>
      </form>
    </main>
  );
}

function CategoryRow({
  category,
  onPatch,
  onDelete,
}: {
  category: CategoryView;
  onPatch: (change: Partial<CategoryView>) => void;
  onDelete: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const off = !category.learnActive && !category.reviewActive;

  return (
    <li className={`rounded-lg border border-line bg-surface ${off ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setPicking(!picking)}
          aria-label={`Change icon for ${category.name}`}
          className="grid size-10 shrink-0 place-items-center rounded-md bg-celadon-soft text-xl text-celadon-deep"
        >
          <i className={`bi bi-${category.icon}`} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{category.name}</p>
          <p className="text-xs text-muted">
            {category.words.length} {category.words.length === 1 ? "word" : "words"}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <label className="flex items-center gap-1.5">
            <Switch
              checked={category.learnActive}
                  onChange={(learnActive) => onPatch({ learnActive })}
              label={`Learn new words from ${category.name}`}
            />
            Learn
          </label>
          <label className="flex items-center gap-1.5">
            <Switch
              checked={category.reviewActive}
                  onChange={(reviewActive) => onPatch({ reviewActive })}
              label={`Review ${category.name}`}
            />
            Review
          </label>
          {category.words.length === 0 && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${category.name}`}
              className="text-muted hover:text-clay"
            >
              <i className="bi bi-trash" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {picking && (
        <div className="border-t border-line px-4 py-3">
          <IconPicker
            value={category.icon}
            onPick={(icon) => {
              onPatch({ icon });
              setPicking(false);
            }}
          />
        </div>
      )}

      {category.words.length > 0 && (
        <details className="border-t border-line">
          <summary className="cursor-pointer px-4 py-2 text-xs text-muted">Show words</summary>
          <WordList words={category.words} />
        </details>
      )}
    </li>
  );
}

function WordList({ words }: { words: WordView[] }) {
  return (
    <ul className="grid gap-x-4 gap-y-1 px-4 pb-3 sm:grid-cols-2">
      {words.map((word) => (
        <li key={word.id} className="flex items-baseline gap-2 text-sm">
          <span className="korean text-base">{word.lemma}</span>
          {word.translation && <span className="truncate text-muted">{word.translation}</span>}
        </li>
      ))}
    </ul>
  );
}

function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-celadon-deep" : "bg-line"
      }`}
    >
      <span
        className={`absolute top-0.5 size-4 rounded-full bg-surface shadow transition-[left] ${
          checked ? "left-[1.125rem]" : "left-0.5"
        }`}
      />
    </button>
  );
}
