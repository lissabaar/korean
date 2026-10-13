"use client";

/**
 * The /hanja page body: the hanja in the user's words, grouped by the
 * syllable they are read as (소: 小 small, 少 few, 所 place ...), with a
 * search, the user's words for each character and "More words" from the
 * dictionary (GET /api/hanja); and a Practice tab of flip cards.
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys. The page (app/(app)/hanja/page.tsx) gathers the
 * cards on the server.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { HanjaWord } from "@/lib/hanja";

export interface HanjaCard {
  char: string;
  /** The syllable as read in the user's words. */
  syllable: string;
  /** Every Korean reading Unihan lists. */
  readings: string[];
  meaning: string | null;
  words: { lemma: string; originalForm: string; translation: string | null }[];
}

/** Lowercase, NFC — for the search box. */
const norm = (text: string) => text.normalize("NFC").toLowerCase().trim();

export default function HanjaBrowser({ cards, initialChar }: { cards: HanjaCard[]; initialChar: string | null }) {
  const [tab, setTab] = useState<"browse" | "practice">("browse");
  const [query, setQuery] = useState(initialChar ?? "");
  const q = norm(query);

  const found = useMemo(
    () =>
      q
        ? cards.filter(
            (card) =>
              card.char === q ||
              card.syllable === q ||
              norm(card.meaning ?? "").includes(q) ||
              card.words.some((word) => word.lemma.includes(q) || norm(word.translation ?? "").includes(q)),
          )
        : cards,
    [cards, q],
  );
  // Grouped by syllable in Korean order; inside, the characters with most words first.
  const groups = useMemo(() => {
    const map = new Map<string, HanjaCard[]>();
    for (const card of found) map.set(card.syllable, [...(map.get(card.syllable) ?? []), card]);
    return [...map]
      .sort(([a], [b]) => a.localeCompare(b, "ko"))
      .map(([syllable, list]) => [syllable, list.sort((a, b) => b.words.length - a.words.length)] as const);
  }, [found]);

  if (cards.length === 0) {
    return (
      <p className="rounded-lg border border-line bg-surface p-5 text-sm text-muted">
        None of your words come from hanja yet — or the dictionary did not say. Words like 학교, 공원 or 시간 will
        show up here.
      </p>
    );
  }

  return (
    <div>
      <div role="tablist" className="mb-4 flex gap-2 text-sm">
        {(
          [
            ["browse", `All ${cards.length} characters`],
            ["practice", "Practice"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={`rounded-full border px-4 py-1.5 ${
              tab === value ? "border-celadon-deep bg-celadon-deep text-paper" : "border-line"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "practice" ? (
        <Practice cards={cards} />
      ) : (
        <>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search — a syllable (소), a character (小), a meaning or a word"
            aria-label="Search hanja"
            className="mb-4 w-full rounded-md border border-line bg-surface px-3 py-2.5 text-base outline-none focus:border-celadon"
          />
          {groups.length === 0 && <p className="text-sm text-muted">Nothing matches.</p>}
          <div className="space-y-5">
            {groups.map(([syllable, list]) => (
              <section key={syllable}>
                <h2 className="korean mb-2 text-2xl text-celadon-deep">{syllable}</h2>
                <ul className="grid items-start gap-2 lg:grid-cols-2">
                  {list.map((card) => (
                    <CharCard key={card.char} card={card} open={card.char === initialChar} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One character: big glyph, reading, meaning, the user's words; "More words"
 * loads dictionary words with it. `open` (from ?char=) scrolls it into view
 * and loads those at once.
 */
function CharCard({ card, open }: { card: HanjaCard; open: boolean }) {
  const ref = useRef<HTMLLIElement>(null);
  const [more, setMore] = useState<HanjaWord[] | null>(null);
  const [loading, setLoading] = useState(false);

  /** Fetch dictionary words built on this character. */
  async function loadMore() {
    setLoading(true);
    try {
      const response = await fetch(`/api/hanja?char=${encodeURIComponent(card.char)}`);
      const data: { words?: HanjaWord[] } = await response.json();
      setMore(data.words ?? []);
    } catch {
      setMore([]);
    } finally {
      setLoading(false);
    }
  }

  // The character asked for in the URL: bring it into view and show its
  // dictionary words straight away (state set in the fetch callback).
  useEffect(() => {
    if (!open) return;
    ref.current?.scrollIntoView({ block: "center" });
    fetch(`/api/hanja?char=${encodeURIComponent(card.char)}`)
      .then((response) => response.json())
      .then((data: { words?: HanjaWord[] }) => setMore(data.words ?? []))
      .catch(() => setMore([]));
  }, [open, card.char]);

  return (
    <li
      ref={ref}
      className={`rounded-lg border bg-surface p-4 ${open ? "border-celadon" : "border-line"}`}
    >
      <div className="flex items-baseline gap-3">
        <span className="korean text-4xl leading-none">{card.char}</span>
        <span className="korean text-lg">{card.syllable}</span>
        <span className="min-w-0 flex-1 text-sm">{card.meaning ?? <span className="text-muted">no meaning in the list</span>}</span>
      </div>
      {card.readings.length > 1 && (
        <p className="mt-1 text-xs text-muted">Also read: {card.readings.filter((r) => r !== card.syllable).join(", ")}</p>
      )}
      <ul className="mt-2 space-y-0.5 text-sm">
        {card.words.map((word) => (
          <li key={word.lemma}>
            <span className="korean">{word.lemma}</span>{" "}
            <span className="korean text-muted">{word.originalForm}</span>
            {word.translation && <span className="text-muted"> — {word.translation}</span>}
          </li>
        ))}
      </ul>
      {more === null ? (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="mt-2 text-xs text-celadon-deep underline underline-offset-4 disabled:opacity-50"
        >
          {loading ? "Loading…" : "More words with this character"}
        </button>
      ) : more.length > 0 ? (
        <ul className="mt-2 space-y-0.5 border-t border-line/60 pt-2 text-sm">
          {more.map((word) => (
            <li key={word.lemma}>
              <span className="korean">{word.lemma}</span>{" "}
              <span className="korean text-muted">{word.originalForm}</span>
              {word.translation && <span className="text-muted"> — {word.translation}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted">No other dictionary words with it.</p>
      )}
    </li>
  );
}

/** Fisher–Yates: a random order of the cards. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Flip cards: the character and its syllable; "Show" reveals the meaning and
 * the user's words. No grading or schedule — a quick run-through.
 */
function Practice({ cards }: { cards: HanjaCard[] }) {
  // Characters with a meaning only: there is nothing to recall otherwise.
  const [deck, setDeck] = useState(() => shuffled(cards.filter((card) => card.meaning)));
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(false);
  const card = deck[index];

  if (!card) return <p className="text-sm text-muted">No characters with a meaning yet.</p>;
  return (
    <div className="mx-auto max-w-md">
      <p className="mb-2 text-xs text-muted">
        {index + 1} of {deck.length}
      </p>
      <div className="rounded-lg border border-line bg-surface p-6 text-center">
        <p className="korean text-7xl leading-tight">{card.char}</p>
        <p className="korean mt-2 text-2xl text-celadon-deep">{card.syllable}</p>
        {shown ? (
          <div className="mt-4 text-left">
            <p className="font-medium">{card.meaning}</p>
            <ul className="mt-2 space-y-0.5 text-sm">
              {card.words.slice(0, 6).map((word) => (
                <li key={word.lemma}>
                  <span className="korean">{word.lemma}</span>{" "}
                  <span className="korean text-muted">{word.originalForm}</span>
                  {word.translation && <span className="text-muted"> — {word.translation}</span>}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">What does it mean? Think of a word with it.</p>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setShown(true)}
          disabled={shown}
          className="rounded-md border border-line bg-surface px-4 py-3 font-medium disabled:opacity-50"
        >
          Show
        </button>
        <button
          type="button"
          onClick={() => {
            setShown(false);
            if (index + 1 < deck.length) setIndex(index + 1);
            else {
              setDeck(shuffled(deck));
              setIndex(0);
            }
          }}
          className="rounded-md bg-celadon-deep px-4 py-3 font-medium text-paper"
        >
          Next
        </button>
      </div>
    </div>
  );
}
