"use client";

import { useState } from "react";
import type { WordCandidate } from "@/lib/ingest/analyze";
import { BASE_CATEGORIES } from "@/lib/ingest/categories";
import type { DictEntry } from "@/lib/dictionary/krdict";

interface Props {
  candidate: WordCandidate;
  onChange: (next: WordCandidate) => void;
}

export default function CandidateRow({ candidate, onChange }: Props) {
  const [open, setOpen] = useState(false);

  const sense = candidate.dictionary?.senses[0];
  const unverified = candidate.status === "unverified";
  const unreachable = candidate.status === "unreachable";
  const duplicate = candidate.status === "duplicate";
  const disabled = unverified || unreachable || duplicate;

  return (
    <li
      className={`border-b border-line last:border-b-0 ${
        candidate.selected ? "" : "opacity-55"
      }`}
    >
      <div className="flex gap-3 px-4 py-4 sm:gap-4 sm:px-5">
        <input
          type="checkbox"
          checked={candidate.selected}
          onChange={(event) =>
            onChange({ ...candidate, selected: event.target.checked })
          }
          aria-label={`Include ${candidate.lemma}`}
          className="mt-1.5 size-5 shrink-0 accent-celadon-deep"
        />

        {/* The word is the hero: a Hangul-block-shaped cell, set large. */}
        <div
          className={`grid size-16 shrink-0 place-items-center rounded-sm sm:size-20 ${
            unverified || unreachable ? "bg-clay-soft" : "bg-celadon-soft"
          }`}
        >
          <span className="korean text-2xl leading-none sm:text-3xl">
            {candidate.lemma}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          {sense?.translation && (
            <p className="font-medium">{sense.translation}</p>
          )}

          {unverified && (
            <p className="text-sm text-clay">
              No dictionary entry — the dictionary form is probably wrong.
            </p>
          )}
          {unreachable && (
            <p className="text-sm text-clay">
              The dictionary did not respond. Run the text again to check this word.
            </p>
          )}
          {duplicate && (
            <p className="text-sm text-muted">Already in your words.</p>
          )}

          {!disabled && candidate.homographs.length > 1 && (
            <HomographPicker
              candidate={candidate}
              onPick={(dictionary) => onChange({ ...candidate, dictionary })}
            />
          )}

          {sense?.definition && (
            <p className="korean mt-1 line-clamp-2 text-sm text-muted">
              {sense.definition}
            </p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <CategoryPicker
              value={candidate.primaryCategory}
              onChange={(primaryCategory) =>
                onChange({ ...candidate, primaryCategory, edited: true } as WordCandidate)
              }
              disabled={disabled}
            />
            {candidate.secondaryCategories.map((name) => (
              <span
                key={name}
                className="rounded-full border border-line px-2.5 py-1 text-xs text-muted"
              >
                {name}
              </span>
            ))}
            {candidate.register && (
              <span className="rounded-full bg-celadon-soft px-2.5 py-1 text-xs text-celadon-deep">
                {candidate.register.toLowerCase()}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="mt-2 text-xs text-muted underline underline-offset-4"
          >
            {open ? "Hide context" : "Show context"}
          </button>

          {open && (
            <div className="mt-2 border-l-2 border-celadon pl-3 text-sm">
              <p className="korean">{candidate.sentence}</p>
              <p className="mt-1 text-muted">{candidate.contextNote}</p>
              {sense?.examples.slice(0, 2).map((example) => (
                <p key={example} className="korean mt-1 text-muted">
                  {example}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function CategoryPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Category"
      className="max-w-[12rem] rounded-full border border-celadon bg-surface px-2.5 py-1 text-xs text-celadon-deep disabled:opacity-50"
    >
      {BASE_CATEGORIES.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
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
