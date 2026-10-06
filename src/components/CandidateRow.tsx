"use client";

/**
 * One word in the import preview on /add: the word as a heading with a
 * pronunciation button, its meaning (English, the user's own, or the AI's),
 * notes (already in your words, saved with the AI meaning, a conflict
 * between your meaning and the dictionary's), the definition,
 * a category picker, the sentence it came from, and — when the dictionary has
 * several words with this spelling — a picker for the right one.
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys.
 *
 * It holds no state of its own: every change goes up through onChange to
 * <AddWords/>, which owns the list.
 */

import { useState } from "react";
import type { WordCandidate } from "@/lib/ingest/analyze";
import CategorySelect from "./CategorySelect";
import SpeakButton from "./SpeakButton";
import type { DictEntry } from "@/lib/dictionary/krdict";

interface Props {
  candidate: WordCandidate;
  onChange: (next: WordCandidate) => void;
  /** Category names to choose from: the user's own plus the built-in set. */
  categories: string[];
}

/**
 * One preview row. `candidate` is the word with everything known about it;
 * `onChange` reports edits; `categories` fills the category picker.
 */
export default function CandidateRow({ candidate, onChange, categories }: Props) {
  const [open, setOpen] = useState(false);

  const sense = candidate.dictionary?.senses[0];
  const aiOnly = candidate.status === "ai";
  const unreachable = candidate.status === "unreachable";
  const duplicate = candidate.status === "duplicate";
  const disabled = duplicate;
  // More than three syllables do not fit the square word cell on a phone.
  // As on the cards: English (dictionary, else AI) leads, the user's own
  // meaning is shown under it — it is kept, never replaced.
  const english = sense?.translation ?? (aiOnly || unreachable ? candidate.aiMeaning : null);
  const own = candidate.userMeaning && !candidate.useDictionaryMeaning ? candidate.userMeaning : null;
  const saved = Boolean((candidate as { saved?: boolean }).saved);

  return (
    <li
      className={`border-b border-line px-4 py-4 last:border-b-0 sm:px-5 ${
        candidate.selected || saved ? "" : "opacity-55"
      }`}
    >
      {/* Row 1: the word as the heading — it can wrap, nothing sits beside it. */}
      <div className="flex items-start gap-3">
        {saved ? (
          <i
            className="bi bi-check-circle-fill mt-1.5 shrink-0 text-lg text-celadon-deep"
            aria-label="Added"
            title="Added"
          />
        ) : (
          <input
            type="checkbox"
            checked={candidate.selected}
            onChange={(event) => onChange({ ...candidate, selected: event.target.checked })}
            aria-label={`Include ${candidate.lemma}`}
            className="mt-2 size-5 shrink-0 accent-celadon-deep"
          />
        )}
        <h3
          className={`korean min-w-0 flex-1 leading-tight [overflow-wrap:anywhere] ${
            candidate.kind === "phrase" ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl"
          }`}
        >
          {candidate.lemma}
        </h3>
        <SpeakButton text={candidate.lemma} />
      </div>

      {/* Row 2: two columns on wide screens, one on phones. */}
      <div className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <div className="min-w-0">
          {english && <p className="font-medium [overflow-wrap:anywhere]">{english}</p>}
          {own && <p className="text-sm text-muted [overflow-wrap:anywhere]">Yours: {own}</p>}

          {(aiOnly || candidate.kind === "phrase" || candidate.register) && (
            <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
              {candidate.kind === "phrase" && (
                <span className="rounded-full bg-celadon-soft px-2 py-0.5 text-celadon-deep">phrase</span>
              )}
              {candidate.register && (
                <span className="rounded-full bg-celadon-soft px-2 py-0.5 text-celadon-deep">
                  {candidate.register.toLowerCase()}
                </span>
              )}
              {aiOnly && (
                <span className="rounded-full bg-clay-soft px-2 py-0.5 text-clay">
                  English by AI — not in the dictionary
                </span>
              )}
            </p>
          )}

          {unreachable && (
            <p className="mt-1 text-sm text-clay">
              {saved
                ? "Saved with the AI meaning — the dictionary check runs automatically later."
                : "The dictionary did not answer — it will be checked automatically after saving."}
            </p>
          )}
          {candidate.conflict === "meaning" && (sense?.translation || candidate.aiMeaning) && (
            <div className="mt-1.5 rounded-md bg-clay-soft px-2.5 py-2 text-sm">
              <p className="text-clay">
                Your meaning looks wrong for this word.{" "}
                {sense?.translation ? "The dictionary says" : "Suggested"}:{" "}
                <strong>{sense?.translation ?? candidate.aiMeaning}</strong>
              </p>
              {!saved && (
                <label className="mt-1 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={candidate.useDictionaryMeaning}
                    onChange={(event) =>
                      onChange({ ...candidate, useDictionaryMeaning: event.target.checked })
                    }
                    className="size-4 accent-celadon-deep"
                  />
                  Use {sense?.translation ? "the dictionary" : "the suggested"} meaning instead of “
                  {candidate.userMeaning}”
                </label>
              )}
            </div>
          )}
          {candidate.conflict === "spelling" && (
            <p className="mt-1 text-sm text-clay">
              Written as <span className="korean">{candidate.surface}</span> — corrected to the dictionary
              spelling.
            </p>
          )}
          {duplicate && <p className="mt-1 text-sm text-muted">Already in your words.</p>}

          {!disabled && !saved && candidate.homographs.length > 1 && (
            <HomographPicker
              candidate={candidate}
              onPick={(dictionary) => onChange({ ...candidate, dictionary })}
            />
          )}
        </div>

        <div className="min-w-0">
          {sense?.definition && (
            <p className="korean line-clamp-3 text-sm text-muted">{sense.definition}</p>
          )}
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
            <CategorySelect
              value={candidate.primaryCategory}
              options={categories}
              onChange={(primaryCategory) => onChange({ ...candidate, primaryCategory, edited: true })}
              disabled={disabled || saved}
            />
          </div>
          {(candidate.sentence || candidate.contextNote || sense?.examples.length) ? (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              className="mt-2 text-xs text-muted underline underline-offset-4"
            >
              {open ? "Hide context" : "Show context"}
            </button>
          ) : null}
        </div>
      </div>

      {open && (
        <div className="mt-2 border-l-2 border-celadon pl-3 text-base sm:text-sm">
          {candidate.sentence && <p className="korean">{candidate.sentence}</p>}
          {candidate.contextNote && <p className="mt-1 text-muted">{candidate.contextNote}</p>}
          {sense?.examples.slice(0, 2).map((example) => (
            <p key={example} className="korean mt-1 text-muted">
              {example}
            </p>
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * Several dictionary entries share this spelling. The best match for the
 * context is picked automatically; this lets the user correct it.
 */
function HomographPicker({
  candidate,
  onPick,
}: {
  candidate: WordCandidate;
  onPick: (entry: DictEntry) => void;
}) {
  const label = (entry: DictEntry) =>
    [entry.senses[0]?.translation ?? entry.senses[0]?.definition, entry.originalForm]
      .filter(Boolean)
      .join(" · ");

  return (
    <label className="mt-1 flex items-center gap-2 text-xs text-muted">
      <span>Meaning</span>
      <select
        // Compared by dictionary id: after the JSON round trip, `dictionary`
        // and its twin in `homographs` are different objects.
        value={Math.max(
          0,
          candidate.homographs.findIndex(
            (entry) => entry.targetCode === candidate.dictionary?.targetCode,
          ),
        )}
        onChange={(event) => onPick(candidate.homographs[Number(event.target.value)])}
        className="korean min-w-0 max-w-full truncate rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
      >
        {candidate.homographs.map((entry, index) => (
          <option key={entry.targetCode ?? index} value={index}>
            {label(entry)}
          </option>
        ))}
      </select>
    </label>
  );
}
