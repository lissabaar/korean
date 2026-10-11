"use client";

/**
 * Drop zone / file picker for imports on /add (images, .apkg/.colpkg Anki
 * decks, CSV/TSV, .reword, text, subtitles). Only collects the files and
 * passes them up; reading them is lib/import/read.ts's job. The parent passes
 * the list of added files as children: it is shown inside the zone, which
 * then shrinks to a "drop more" line under it.
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ACCEPTED_FILES } from "@/lib/import/read";

/**
 * Drop zone for any number of files. Also catches files dropped anywhere
 * on the page (instead of the browser opening them) and images pasted with
 * Ctrl+V — the quickest way to bring in a screenshot.
 */
export default function FileDrop({
  onFiles,
  disabled = false,
  hasFiles = false,
  children,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Files are already added: show them (children) and a compact "add more" line. */
  hasFiles?: boolean;
  /** The added files, rendered inside the zone. */
  children?: ReactNode;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // The window listeners below are attached once; they read the latest
  // callback through this ref instead of re-subscribing on every render.
  const onFilesRef = useRef(onFiles);
  useEffect(() => {
    onFilesRef.current = onFiles;
  }, [onFiles]);

  useEffect(() => {
    if (disabled) return;

    function onDragOver(event: DragEvent) {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    }
    function onDrop(event: DragEvent) {
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault();
      setOver(false);
      onFilesRef.current([...event.dataTransfer.files]);
    }
    function onPaste(event: ClipboardEvent) {
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      // Text pastes into the textarea are left alone; only files are taken.
      event.preventDefault();
      onFilesRef.current(files);
    }

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, [disabled]);

  return (
    <div
      onDragEnter={() => setOver(true)}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false);
      }}
      className={`rounded-lg border-2 border-dashed px-4 text-center transition-colors ${hasFiles ? "py-3" : "py-6"} ${
        over ? "border-celadon bg-celadon-soft" : hasFiles ? "border-celadon bg-surface" : "border-line bg-surface"
      } ${disabled ? "opacity-50" : ""}`}
    >
      {children}
      {hasFiles ? (
        // Files are in: one compact line to add more.
        <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted">
          Drop more files here, paste with Ctrl+V, or
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="rounded-md border border-line px-3 py-1 text-sm text-ink"
          >
            Add files
          </button>
        </p>
      ) : (
        <>
          <p className="text-sm font-medium">Drop files here</p>
          <p className="mt-1 text-xs text-muted">
            Screenshots and photos, Anki decks (.apkg), ReWord categories (.reword), CSV, text or subtitles — as many as you like.
            Or paste a screenshot with Ctrl+V.
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="mt-3 rounded-md border border-line px-4 py-2 text-sm"
          >
            Choose files
          </button>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_FILES}
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
