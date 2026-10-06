"use client";

import { useEffect, useMemo, useState } from "react";
import { SUGGESTED_ICONS } from "@/lib/category-icons";

/**
 * Suggested icons up front; typing searches all ~2000 Bootstrap Icons by
 * name ("food", "cup", "heart"). The full name list is loaded only once the
 * user starts searching.
 */
export default function IconPicker({
  value,
  onPick,
}: {
  value: string;
  onPick: (icon: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [allNames, setAllNames] = useState<string[] | null>(null);

  useEffect(() => {
    if (!query || allNames) return;
    import("bootstrap-icons/font/bootstrap-icons.json").then((module) =>
      setAllNames(Object.keys(module.default)),
    );
  }, [query, allNames]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SUGGESTED_ICONS;
    if (!allNames) return [];
    return allNames.filter((name) => name.includes(q)).slice(0, 96);
  }, [query, allNames]);

  return (
    <div>
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search icons — food, heart, book…"
        aria-label="Search icons"
        className="mb-3 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-celadon"
      />
      <div className="grid grid-cols-8 gap-1 sm:grid-cols-12">
        {shown.map((name) => (
          <button
            key={name}
            type="button"
            title={name}
            aria-label={name}
            onClick={() => onPick(name)}
            className={`grid aspect-square place-items-center rounded-md text-lg hover:bg-celadon-soft ${
              name === value ? "bg-celadon-soft text-celadon-deep" : ""
            }`}
          >
            <i className={`bi bi-${name}`} aria-hidden />
          </button>
        ))}
      </div>
      {query && allNames && shown.length === 0 && (
        <p className="text-sm text-muted">No icon matches “{query}”.</p>
      )}
    </div>
  );
}
