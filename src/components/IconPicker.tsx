"use client";

/**
 * Popup grid of Bootstrap Icons for choosing a category's icon, with a few
 * suggestions for the category's name (lib/category-icons.ts).
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { SUGGESTED_ICONS } from "@/lib/category-icons";

/**
 * Suggested icons up front; typing searches all ~2000 Bootstrap Icons by
 * name ("food", "cup", "heart"). The full name list is loaded only once the
 * user starts searching.
 */
export default function IconPicker({
  value,
  onPick,
  onClose,
}: {
  value: string;
  onPick: (icon: string) => void;
  /** Called on a click or tap outside the picker, and on Escape. */
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    // Deferred one tick so the tap that opened the picker does not close it.
    const timer = setTimeout(() => {
      document.addEventListener("pointerdown", onPointer);
      document.addEventListener("keydown", onKey);
    });
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
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
    <div ref={rootRef}>
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search icons — food, heart, book…"
        aria-label="Search icons"
        className="mb-3 w-full rounded-md border border-line bg-paper px-3 py-2 text-base outline-none focus:border-celadon"
      />
      {/* Capped height: on a phone the full grid would fill several screens. */}
      <div className="grid max-h-52 grid-cols-7 gap-1 overflow-y-auto overscroll-contain sm:max-h-64 sm:grid-cols-12">
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
