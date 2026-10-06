"use client";

import { useState } from "react";
import type { WordCandidate } from "@/lib/ingest/analyze";
import { readableMeaning } from "@/lib/dictionary/romanize";
import CategorySelect from "./CategorySelect";
import SpeakButton from "./SpeakButton";
import type { DictEntry } from "@/lib/dictionary/krdict";

interface Props {
  candidate: WordCandidate;
  onChange: (next: WordCandidate) => void;
  /** Category names to choose from: the user's own plus the built-in set. */
  categories: string[];
}

export default function CandidateRow({ candidate, onChange, categories }: Props) {
  const [open, setOpen] = useState(false);

  const sense = candidate.dictionary?.senses[0];
  const aiOnly = candidate.status === "ai";
  const unreachable = candidate.status === "unreachable";
  const duplicate = candidate.status === "duplicate";
  const disabled = duplicate;
  // More than three syllables do not fit the square word cell on a phone.
  // Only one or two syllables fit the square cell (three overflow at the
  // larger desktop size); longer words get a stretching box.
  const long = candidate.kind === "phrase" || candidate.lemma.length > 2;
  // As on the cards: English (dictionary, else AI) leads, the user's own
  // meaning is shown under it — it is kept, never replaced.
  const english = sense?.translation
    ? readableMeaning(candidate.lemma, sense.translation, candidate.aiMeaning)
    : aiOnly || unreachable
      ? candidate.aiMeaning
      : null;
  const own = candidate.userMeaning && !candidate.useDictionaryMeaning ? candidate.userMeaning : null;
  const saved = Boolean((candidate as { saved?: boolean }).saved);

  return (
    <li
      className={`border-b border-line last:border-b-0 ${
        candidate.selected || saved ? "" : "opacity-55"
      }`}
    >
      <div className="flex gap-3 px-4 py-4 sm:gap-4 sm:px-5">
        {saved ? (
          <i
            className="bi bi-check-circle-fill mt-1 shrink-0 text-lg text-celadon-deep"
            aria-label="Added"
            title="Added"
          />
        ) : (
          <input
            type="checkbox"
            checked={candidate.selected}
            onChange={(event) => onChange({ ...candidate, selected: event.target.checked })}
            aria-label={`Include ${candidate.lemma}`}
            className="mt-1.5 size-5 shrink-0 accent-celadon-deep"
          />
        )}

        {/* The word is the hero: a Hangul-block-shaped cell, set large. */}
        <div
          className={`grid shrink-0 place-items-center rounded-sm ${
            long ? "max-w-[40%] min-h-14 min-w-0 px-2.5 py-2" : "size-16 sm:size-20"
          } ${aiOnly || unreachable ? "bg-clay-soft" : "bg-celadon-soft"}`}
        >
          <span
            className={`korean break-words text-center leading-snug [overflow-wrap:anywhere] ${long ? "text-base sm:text-xl" : "text-2xl leading-none sm:text-3xl"}`}
          >
            {candidate.lemma}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              {english && <p className="font-medium break-words">{english}</p>}
              {own && <p className="text-sm text-muted break-words">Yours: {own}</p>}
            </div>
            <SpeakButton text={candidate.lemma} className="ml-auto -mt-1" />
          </div>

          {(aiOnly || candidate.kind === "phrase") && (
            <p className="mt-0.5 flex flex-wrap gap-1.5 text-xs">
              {candidate.kind === "phrase" && (
                <span className="rounded-full bg-celadon-soft px-2 py-0.5 text-celadon-deep">phrase</span>
              )}
              {aiOnly && (
                <span className="rounded-full bg-clay-soft px-2 py-0.5 text-clay">
                  English by AI — not in the dictionary
                </span>
              )}
            </p>
          )}
          {unreachable && (
            <p className="text-sm text-clay">
              The dictionary did not respond, so this is not checked. Run it again for dictionary data
              — or keep it with {candidate.userMeaning ? "your meaning" : "the AI meaning"}.
            </p>
          )}
          {candidate.conflict === "meaning" && (sense?.translation || candidate.aiMeaning) && (
            <div className="mt-1.5 rounded-md bg-clay-soft px-2.5 py-2 text-sm">
              <p className="text-clay">
                Your meaning looks wrong for this word.{" "}
                {sense?.translation ? "The dictionary says" : "Suggested"}:{" "}
                <strong>{sense?.translation ?? candidate.aiMeaning}</strong>
              </p>
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
            </div>
          )}
          {candidate.conflict === "spelling" && (
            <p className="mt-1 text-sm text-clay">
              Written as <span className="korean">{candidate.surface}</span> — corrected to the dictionary
              spelling.
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

          <div className="mt-2.5 flex min-w-0 flex-wrap items-center gap-1.5">
            <CategorySelect
              value={candidate.primaryCategory}
              options={categories}
              onChange={(primaryCategory) =>
                onChange({ ...candidate, primaryCategory, edited: true })
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
            <div className="mt-2 border-l-2 border-celadon pl-3 text-base sm:text-sm">
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
