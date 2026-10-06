"use client";

import { useState } from "react";

const NEW = "__new__";

/**
 * Pick a category, or type a new one right there. The new name is used as
 * is; the category itself is created when the word is saved.
 */
export default function CategorySelect({
  value,
  options,
  onChange,
  disabled = false,
  className = "",
}: {
  value: string;
  options: string[];
  onChange: (name: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");

  const all = options.includes(value) || !value ? options : [value, ...options];

  function commit() {
    const name = draft.replace(/\s+/g, " ").trim().toLowerCase();
    if (name) onChange(name);
    setCreating(false);
    setDraft("");
  }

  if (creating) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
            if (event.key === "Escape") setCreating(false);
          }}
          maxLength={60}
          placeholder="new category"
          aria-label="New category name"
          className="w-36 rounded-full border border-celadon bg-surface px-2.5 py-1 text-xs outline-none"
        />
        <button
          type="button"
          onClick={commit}
          className="rounded-full bg-celadon-deep px-2.5 py-1 text-xs text-paper"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setCreating(false)}
          aria-label="Cancel"
          className="px-1 text-xs text-muted"
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => {
        if (event.target.value === NEW) setCreating(true);
        else onChange(event.target.value);
      }}
      aria-label="Category"
      className={`max-w-[14rem] rounded-full border border-celadon bg-surface px-2.5 py-1 text-xs text-celadon-deep disabled:opacity-50 ${className}`}
    >
      {all.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
      <option value={NEW}>+ New category…</option>
    </select>
  );
}
