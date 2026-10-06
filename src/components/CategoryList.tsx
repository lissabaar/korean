"use client";

/**
 * The interactive list on /categories: each category with its words, the
 * total word count, Learn/Review switches, rename/merge, icon picker, delete,
 * and the word editor for a single word.
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys.
 *
 * Changes are sent to /api/categories/:id and /api/words/:id; after a change
 * that moves words around the page re-reads its data (router.refresh()).
 */

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import IconPicker from "./IconPicker";
import WordEditor from "./WordEditor";

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

/**
 * Small fetch() wrapper: JSON in, JSON out, throws with the server's error
 * message on failure.
 */
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

/**
 * Toggles and icons update in place (optimistically). Anything that moves
 * words around — rename/merge, delete, editing a word — refreshes the page,
 * and the server component remounts this list with fresh data.
 */
export default function CategoryList({
  initial,
  allCategoryNames,
}: {
  initial: CategoryView[];
  allCategoryNames: string[];
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(initial);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  /**
   * Change a field of one category (switches, icon) — shown at once, saved in
   * the background, undone if the server refuses.
   */
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

  /**
   * For changes that move words around (rename/merge, delete): run it, then
   * reload the page's data from the server.
   */
  async function structural(run: () => Promise<unknown>) {
    setError(null);
    try {
      await run();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
    }
  }

  // A word in two categories is still one word.
  const totalWords = new Set(categories.flatMap((c) => c.words.map((w) => w.id))).size;
  const learning = categories.filter((c) => c.learnActive).length;
  const reviewing = categories.filter((c) => c.reviewActive).length;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-6">
        <p className="korean text-4xl text-celadon-deep">분류</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Categories</h1>
        <p className="mt-1 text-sm font-medium text-celadon-deep">
          {totalWords} {totalWords === 1 ? "word" : "words"} in {categories.length}{" "}
          {categories.length === 1 ? "category" : "categories"}
        </p>
        <p className="mt-2 text-sm text-muted">
          <strong className="font-medium text-ink">Learn</strong> — new words for{" "}
          <em>Learn new words</em> come from these.{" "}
          <strong className="font-medium text-ink">Review</strong> — learned words from these come
          back in <em>Review</em>. A word counts if any of its categories is on. Tap a word to edit it.
        </p>
      </header>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-clay-soft px-3 py-2.5 text-sm text-clay">
          {error}
        </p>
      )}

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
            allCategoryNames={allCategoryNames}
            onPatch={(change) => patch(category.id, change)}
            onRename={(name) =>
              structural(() => send(`/api/categories/${category.id}`, "PATCH", { name }))
            }
            onDelete={() => structural(() => send(`/api/categories/${category.id}`, "DELETE"))}
            onWordChanged={() => router.refresh()}
          />
        ))}
      </ul>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!newName.trim()) return;
          structural(async () => {
            await send("/api/categories", "POST", { name: newName });
            setNewName("");
          });
        }}
        className="mt-4 flex gap-2"
      >
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

/**
 * One category: icon, name (click to rename), word count, Learn/Review switches,
 * delete, and its words (click one to edit).
 */
function CategoryRow({
  category,
  allCategoryNames,
  onPatch,
  onRename,
  onDelete,
  onWordChanged,
}: {
  category: CategoryView;
  allCategoryNames: string[];
  onPatch: (change: Partial<CategoryView>) => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onWordChanged: () => void;
}) {
  const [panel, setPanel] = useState<"none" | "icon" | "rename" | "delete">("none");
  const [draft, setDraft] = useState(category.name);
  const [editing, setEditing] = useState<string | null>(null);
  const off = !category.learnActive && !category.reviewActive;
  const toggle = (value: typeof panel) => setPanel(panel === value ? "none" : value);
  const closePanel = useCallback(() => setPanel("none"), []);

  return (
    <li className="overflow-hidden rounded-lg border border-line bg-surface">
      {/* Row 1: icon, full name, actions. Row 2 on phones: the switches. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <button
          type="button"
          onClick={() => toggle("icon")}
          // While open, this button closes the picker itself; keep its press
          // from also counting as an "outside" tap (which would reopen it).
          onPointerDown={(event) => {
            if (panel === "icon") event.stopPropagation();
          }}
          aria-label={`Change icon for ${category.name}`}
          className={`grid size-10 shrink-0 place-items-center rounded-md bg-celadon-soft text-xl text-celadon-deep ${off ? "opacity-50" : ""}`}
        >
          <i className={`bi bi-${category.icon}`} aria-hidden />
        </button>
        <div className={`min-w-0 flex-1 basis-40 ${off ? "opacity-60" : ""}`}>
          <p className="font-medium break-words">{category.name}</p>
          <p className="text-xs text-muted">
            {category.words.length} {category.words.length === 1 ? "word" : "words"}
          </p>
        </div>
        <div className="flex items-center gap-1 text-muted">
          <button
            type="button"
            onClick={() => toggle("rename")}
            aria-label={`Rename ${category.name}`}
            className="rounded p-1.5 hover:text-ink"
          >
            <i className="bi bi-pencil" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => toggle("delete")}
            aria-label={`Delete ${category.name}`}
            className="rounded p-1.5 hover:text-clay"
          >
            <i className="bi bi-trash" aria-hidden />
          </button>
        </div>
        <div className="flex w-full items-center gap-5 pl-[3.25rem] text-sm sm:w-auto sm:pl-0">
          <label className="flex items-center gap-2">
            <Switch
              checked={category.learnActive}
              onChange={(learnActive) => onPatch({ learnActive })}
              label={`Learn new words from ${category.name}`}
            />
            Learn
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={category.reviewActive}
              onChange={(reviewActive) => onPatch({ reviewActive })}
              label={`Review ${category.name}`}
            />
            Review
          </label>
        </div>
      </div>

      {panel === "icon" && (
        <div className="border-t border-line px-4 py-3">
          <IconPicker
            value={category.icon}
            onPick={(icon) => {
              onPatch({ icon });
              setPanel("none");
            }}
            onClose={closePanel}
          />
        </div>
      )}

      {panel === "rename" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) onRename(draft);
          }}
          className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3"
        >
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={60}
            aria-label="Category name"
            className="min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-2 text-base outline-none focus:border-celadon"
          />
          <button type="submit" className="rounded-md bg-celadon-deep px-4 py-2 text-sm text-paper">
            Rename
          </button>
          <p className="w-full text-xs text-muted">
            Using the name of another category merges the two.
          </p>
        </form>
      )}

      {panel === "delete" && (
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-clay-soft px-4 py-3 text-sm">
          <span className="flex-1">
            {category.words.length === 0
              ? "Delete this empty category?"
              : "Delete the category? Its words stay — any without another category move to “uncategorised”."}
          </span>
          <button type="button" onClick={onDelete} className="rounded-md bg-clay px-3 py-1.5 text-paper">
            Delete
          </button>
          <button type="button" onClick={() => setPanel("none")} className="text-muted">
            Cancel
          </button>
        </div>
      )}

      {category.words.length > 0 && (
        <details className="border-t border-line">
          <summary className="cursor-pointer px-4 py-2 text-xs text-muted">Show words</summary>
          <ul className="pb-2">
            {category.words.map((word) => (
              <li key={word.id} className="border-t border-line/60 first:border-t-0">
                {editing === word.id ? (
                  <WordEditor
                    wordId={word.id}
                    allCategoryNames={allCategoryNames}
                    onDone={(changed) => {
                      setEditing(null);
                      if (changed) onWordChanged();
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(word.id)}
                    className="flex w-full items-baseline gap-2 px-4 py-1.5 text-left text-sm hover:bg-celadon-soft/50"
                  >
                    <span className="korean text-base">{word.lemma}</span>
                    {word.translation && <span className="truncate text-muted">{word.translation}</span>}
                    <i className="bi bi-pencil ml-auto text-xs text-muted" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

/** An on/off switch (role="switch" for screen readers). */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
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
