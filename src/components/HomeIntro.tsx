"use client";

/**
 * A short "what is this site" block at the top of the home page: what the
 * app does in four lines. Open by default; "Hide" folds it to one link,
 * and the choice is remembered in this browser (localStorage).
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys.
 */

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "hangugo:intro-hidden";
const listeners = new Set<() => void>();

/** Re-render when the block is hidden or shown. */
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the user folded the block away. */
function isHidden(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Fold or unfold the block, and remember it. */
function setHidden(hidden: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
  } catch {
    // Storage blocked: it folds for this visit only.
  }
  listeners.forEach((listener) => listener());
}

const POINTS = [
  {
    icon: "bi-clipboard-plus",
    title: "Add from anything",
    text: "Paste a text or a word list, drop a screenshot, subtitles, an Anki or ReWord deck — or just ask for a topic.",
  },
  {
    icon: "bi-book",
    title: "Checked by a dictionary",
    text: "The AI finds the words and their dictionary form; the Korean learners' dictionary (KRDict) supplies meanings, levels, hanja and examples.",
  },
  {
    icon: "bi-stars",
    title: "Learn",
    text: "Meet each new word, then short drills: pick it a few times, then type it.",
  },
  {
    icon: "bi-arrow-repeat",
    title: "Remember",
    text: "Reviews on a spaced-repetition schedule (FSRS): every word comes back just before you would forget it.",
  },
];

/** The intro block, or a one-line "What is this?" link once hidden. */
export default function HomeIntro() {
  // On the server localStorage is unknown: render it open.
  const hidden = useSyncExternalStore(subscribe, isHidden, () => false);

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        className="mb-6 text-sm text-muted underline underline-offset-4 hover:text-ink"
      >
        <i className="bi bi-info-circle mr-1.5" aria-hidden />
        What is this site?
      </button>
    );
  }

  return (
    <section className="mb-8 rounded-lg border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="korean text-2xl text-celadon-deep">한국어 단어장</p>
          <h2 className="mt-1 text-lg font-semibold">Korean words from what you actually read</h2>
          <p className="mt-1 text-sm text-muted">
            A flashcard app for learners of Korean: turn your own texts into cards, learn them, and
            keep them.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="rounded-md px-2 py-1 text-sm text-muted hover:text-ink"
        >
          Hide
        </button>
      </div>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {POINTS.map((point) => (
          <li key={point.title} className="flex gap-3">
            <i className={`bi ${point.icon} text-xl text-celadon-deep`} aria-hidden />
            <div>
              <p className="font-medium">{point.title}</p>
              <p className="mt-0.5 text-sm text-muted">{point.text}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">
        Learning and reviewing are free. Finding words with AI uses credits — new accounts get some
        for free.
      </p>
    </section>
  );
}
