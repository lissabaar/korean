"use client";

/**
 * The study screen, shared by /learn and /review.
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys.
 *
 * Loads a session from /api/review/session, shuffles it, and shows one card
 * at a time:
 *   - Intro: a new word not seen yet is first shown whole, with "Start
 *     learning" / "Skip for 3 days" (/api/review/intro).
 *   - Question: pick the right option (CHOICE) or type the answer (TYPING);
 *     the answer goes to /api/review/answer, which grades it.
 *   - Feedback: right/wrong, then the back of the card (Back).
 * A learning card that has not graduated comes back at a random later place
 * (advance). Below: the pieces of a card — Intro, Question, Front, Back.
 */

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { DeckStats, ReviewItem, StudyMode } from "@/lib/review/queue";
import type { AnswerResult } from "@/lib/review/submit";
import { levelLabel, posLabel } from "@/lib/dictionary/labels";
import type { WordDetails } from "@/lib/words/edit";
import SpeakButton, { speakKorean } from "./SpeakButton";
import WordEditor from "./WordEditor";

type Load = "loading" | "ready" | "error";

/**
 * A learning card answered but not graduated goes back to a random place in
 * the rest of the session, at least this many cards later (never straight
 * back). A small fixed gap (it used to be 2-5) made ten words cycle in
 * almost the same order every round.
 */
const REQUEUE_MIN = 2;

/** Where a repeated card goes back: a random position from REQUEUE_MIN to the end. */
function requeueGap(restLength: number): number {
  if (restLength <= REQUEUE_MIN) return restLength;
  return REQUEUE_MIN + Math.floor(Math.random() * (restLength - REQUEUE_MIN + 1));
}

/**
 * Order of the cards in a session is shuffled — learning the same words in
 * the same sequence teaches the sequence, not the words. (The exercise type
 * of each card stays a pure function of its state; only order is random.)
 */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The study session. `mode`: "learn" (new words), "review" (due reviews) or
 * "all". The queue's head is the card on screen.
 */
/**
 * Text sizes on the card, by the user's "Card text size" setting
 * (User.cardTextSize: 0 normal, 1 large, 2 extra large). Shared through a
 * context so every part of the card reads the same setting.
 */
const TEXT_SIZES = [
  { meaning: "text-2xl", second: "text-base", example: "text-lg sm:text-base", exampleTranslation: "text-sm", definition: "text-base" },
  { meaning: "text-3xl", second: "text-lg", example: "text-xl", exampleTranslation: "text-base", definition: "text-lg" },
  { meaning: "text-4xl", second: "text-xl", example: "text-2xl", exampleTranslation: "text-lg", definition: "text-xl" },
] as const;
type TextSize = (typeof TEXT_SIZES)[number];
const TextSizeContext = createContext<TextSize>(TEXT_SIZES[1]);

/** The meaning a card leads with — the same order as meaningText() on the server. */
function leadMeaning(
  translation: string | null,
  own: string | null,
  definitionKnown: string | null,
  definitionTarget: string | null,
  myMeaningFirst: boolean,
): string {
  return (myMeaningFirst ? own : null) ?? translation ?? definitionKnown ?? own ?? definitionTarget ?? "";
}

/**
 * A card after its word was edited on the spot: the new spelling, meanings,
 * definition, example and categories, also in the options of a choice
 * question (the server grades against the edited word from now on).
 */
function withEdit(item: ReviewItem, word: WordDetails, myMeaningFirst: boolean): ReviewItem {
  const translation = word.translation.trim() || null;
  const own = word.userMeaning.trim() || null;
  const definition = word.definition.trim() || null;
  const recall = item.direction === "RECALL";
  const oldCorrect = recall
    ? item.back.lemma
    : leadMeaning(item.back.translation, item.back.userMeaning, item.back.definitionKnown, item.back.definitionTarget, myMeaningFirst);
  const newCorrect = recall
    ? word.lemma
    : leadMeaning(translation, own, item.back.definitionKnown, definition, myMeaningFirst);
  const main = leadMeaning(translation, own, null, null, myMeaningFirst) || null;
  const second = myMeaningFirst ? translation : own;
  const example = word.example.trim() || null;
  return {
    ...item,
    categories: [...word.categories].sort(),
    choices: item.choices?.map((choice) => (choice === oldCorrect ? newCorrect : choice)) ?? null,
    hint: item.hint && recall ? [...word.lemma][0] : item.hint,
    front: item.front.lemma
      ? { ...item.front, lemma: word.lemma }
      : {
          ...item.front,
          meaning: item.front.meaning === null ? null : main,
          altMeaning: item.front.meaning === null ? null : second && second !== main ? second : null,
          definitionTarget: item.front.definitionTarget === null ? null : definition,
        },
    back: {
      ...item.back,
      lemma: word.lemma,
      translation,
      userMeaning: own,
      definitionTarget: definition,
      example,
      // The old translation only fits the old sentence.
      exampleTranslation: example === item.back.example ? item.back.exampleTranslation : null,
    },
  };
}

export default function Review({ mode }: { mode: StudyMode }) {
  const [load, setLoad] = useState<Load>("loading");
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [stats, setStats] = useState<DeckStats | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Words met in this session: the other direction of the same word needs no second intro.
  const [introduced, setIntroduced] = useState<Set<string>>(() => new Set());
  /** The word open in the editor under the card (its Entry id), if any. */
  const [editing, setEditing] = useState<string | null>(null);
  const [myMeaningFirst, setMyMeaningFirst] = useState(false);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  const [textSize, setTextSize] = useState(1);

  useEffect(() => {
    fetch(`/api/review/session?mode=${mode}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load reviews.");
        setQueue(shuffle(data.items));
        setTotal(data.items.length);
        setStats(data.stats);
        setAutoPlay(Boolean(data.autoPlay));
        setMyMeaningFirst(Boolean(data.myMeaningFirst));
        setCategoryNames(data.categoryNames ?? []);
        setTextSize(typeof data.textSize === "number" ? data.textSize : 1);
        setLoad("ready");
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : "Could not load reviews.");
        setLoad("error");
      });
  }, [mode]);

  const current = queue[0];
  const showIntro = Boolean(current?.intro && !introduced.has(current.senseId));

  /**
   * The editor under the card closed. After a save, every card of that word
   * in this session takes the edited data; after a delete, they leave it.
   */
  async function finishEdit(entryId: string, changed: boolean, deleted?: boolean, studiedSenseIds?: string[]) {
    setEditing(null);
    if (!changed) return;
    if (deleted) {
      setQueue((items) => items.filter((item) => item.entryId !== entryId));
      return;
    }
    // Meanings unticked in the editor: their cards are gone, so they leave
    // the session. Newly ticked ones start in a later session.
    if (studiedSenseIds) {
      setQueue((items) =>
        items.filter((item) => item.entryId !== entryId || studiedSenseIds.includes(item.senseId)),
      );
    }
    try {
      const response = await fetch(`/api/words/${entryId}`);
      if (!response.ok) return;
      const word: WordDetails = await response.json();
      setQueue((items) => items.map((item) => (item.entryId === entryId ? withEdit(item, word, myMeaningFirst) : item)));
    } catch {
      // Saved anyway; the card shows the old text until the next session.
    }
  }

  /** "Start learning": the word joins the drill a few cards later. */
  async function startWord(item: ReviewItem) {
    setEditing(null);
    const response = await fetch("/api/review/intro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId: item.cardId, action: "start" }),
    });
    if (!response.ok) throw new Error((await response.json()).error ?? "Could not save that.");
    setIntroduced((set) => new Set(set).add(item.senseId));
    setQueue(([head, ...rest]) => {
      const at = requeueGap(rest.length);
      return [...rest.slice(0, at), head, ...rest.slice(at)];
    });
  }

  /** "Skip": the word leaves this session and new ones for a few days; another takes its place. */
  async function skipWord(item: ReviewItem) {
    setEditing(null);
    const response = await fetch("/api/review/intro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: item.cardId,
        action: "skip",
        sessionSenseIds: [...new Set(queue.map((q) => q.senseId))],
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not save that.");
    const replacement: ReviewItem[] = data.replacement ?? [];
    setQueue((items) => {
      const rest = items.filter((q) => q.senseId !== item.senseId);
      // Spread the newcomers through the rest of the session.
      for (const fresh of shuffle(replacement)) {
        const at = Math.floor(Math.random() * (rest.length + 1));
        rest.splice(at, 0, fresh);
      }
      return rest;
    });
  }

  /** Called once the user has seen the feedback and moves on. */
  function advance(result: AnswerResult) {
    setEditing(null);
    setDone((n) => n + 1);
    if (result.correct) setCorrectCount((n) => n + 1);
    setQueue(([head, ...rest]) => {
      if (!result.requeue) return rest;
      // Mirror pickExercise(): the last learning step is typed.
      const typed = result.learningStreak >= head.learningGoal - 1;
      const answer = head.direction === "RECALL" ? head.back.lemma : (head.back.translation ?? "");
      const again: ReviewItem = {
        ...head,
        learningStreak: result.learningStreak,
        exercise: typed ? "TYPING" : "CHOICE",
        hint: typed && answer ? [...answer][0] : null,
        selfGraded: typed ? head.direction === "RECOGNITION" && !head.back.translation : head.choices === null,
      };
      // Comes back a few cards later — how many varies, so the gap cannot be learned either.
      const at = requeueGap(rest.length);
      return [...rest.slice(0, at), again, ...rest.slice(at)];
    });
  }

  if (load === "loading") {
    return <Shell><p className="text-muted">Loading your cards…</p></Shell>;
  }

  if (load === "error") {
    return (
      <Shell>
        <p role="alert" className="rounded-md bg-clay-soft px-3 py-2.5 text-sm text-clay">
          {error}
        </p>
      </Shell>
    );
  }

  if (total === 0) {
    return (
      <Shell>
        <div className="rounded-lg border border-line bg-surface p-6">
          <p className="korean text-3xl text-celadon-deep">쉬는 시간</p>
          <p className="mt-2 font-medium">
            {mode === "learn" ? "No new words to learn." : "Nothing to review right now."}
          </p>
          <p className="mt-1 text-sm text-muted">
            {stats && stats.words === 0
              ? "Add some words first — they show up here to learn."
              : mode === "learn"
                ? "Add words, or switch Learn on for more categories."
                : "Everything is scheduled for later. Come back then, or learn new words."}
          </p>
          {mode !== "learn" && stats?.nextDue && (
            <NextReview at={new Date(stats.nextDue)} soon={stats.dueSoon} />
          )}
          <Link
            href="/add"
            className="mt-5 inline-block rounded-md bg-celadon-deep px-5 py-2.5 text-sm font-medium text-paper"
          >
            Add words
          </Link>
        </div>
      </Shell>
    );
  }

  if (!current) {
    return (
      <Shell>
        <div className="rounded-lg border border-line bg-surface p-6">
          <p className="korean text-3xl text-celadon-deep">수고했어요</p>
          <p className="mt-2 font-medium">Session done.</p>
          <p className="mt-1 text-sm text-muted">
            {done} answers, {correctCount} right.
          </p>
          <div className="mt-5 flex gap-3">
            <Link
              href="/"
              className="rounded-md bg-celadon-deep px-5 py-2.5 text-sm font-medium text-paper"
            >
              Back home
            </Link>
            <Link href="/add" className="rounded-md border border-line px-5 py-2.5 text-sm">
              Add words
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  // Requeued learning cards make the session longer than it started.
  const progress = done / (done + queue.length);

  return (
    <Shell>
      <div className="mb-5">
        <div className="mb-1.5 flex justify-between text-xs text-muted">
          <span>
            {showIntro
              ? "New word"
              : current.phase === "LEARNING"
              ? `New word · right in a row: ${current.learningStreak}/${current.learningGoal}`
              : "Review"}
          </span>
          <span className="tabular-nums">{queue.length} cards left this session</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden>
          <div
            className="h-full bg-celadon transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      <TextSizeContext.Provider value={TEXT_SIZES[textSize] ?? TEXT_SIZES[1]}>
      {showIntro ? (
        <Intro
          key={`intro-${current.cardId}`}
          item={current}
          autoPlay={autoPlay}
          onStart={() => startWord(current)}
          onSkip={() => skipWord(current)}
          onEdit={() => setEditing(current.entryId)}
        />
      ) : (
        // Keyed on the card and attempt, so state resets for every question.
        <Question
          key={`${current.cardId}-${done}`}
          item={current}
          onDone={advance}
          autoPlay={autoPlay}
          onEdit={() => setEditing(current.entryId)}
        />
      )}

      {editing && editing === current.entryId && (
        <div className="mt-4 overflow-hidden rounded-lg border border-celadon bg-surface">
          <WordEditor
            wordId={editing}
            allCategoryNames={categoryNames}
            onDone={(changed, deleted, studiedSenseIds) => finishEdit(editing, changed, deleted, studiedSenseIds)}
          />
        </div>
      )}
      </TextSizeContext.Provider>
    </Shell>
  );
}

/** Page frame (width and padding) shared by every state of the screen. */
/**
 * Countdown to the next review when nothing is due: "next word in 2 h 13
 * min", how many come up within a day, and a button once the time is up.
 */
function NextReview({ at, soon }: { at: Date; soon: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = at.getTime() - now;

  if (left <= 0) {
    return (
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-4 rounded-md bg-celadon-deep px-5 py-2.5 text-sm font-medium text-paper"
      >
        <i className="bi bi-arrow-repeat mr-1.5" aria-hidden />
        Words are ready — start review
      </button>
    );
  }

  const seconds = Math.ceil(left / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  // Seconds only matter in the last hour; days only beyond one.
  const parts = days > 0 ? [`${days} d`, `${hours} h`] : hours > 0 ? [`${hours} h`, `${minutes} min`] : [`${minutes} min`, `${secs} s`];

  return (
    <div className="mt-4 rounded-md bg-celadon-soft px-4 py-3">
      <p className="text-xs text-muted">Next word to review in</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums text-celadon-deep">{parts.join(" ")}</p>
      <p className="mt-1 text-xs text-muted">
        {at.toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
        {soon > 1 && ` · ${soon} words within the next 24 hours`}
      </p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  // Wider on desktop, so long examples fit on one line.
  return <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">{children}</main>;
}

// ---------------------------------------------------------------- question

function Question({
  item,
  onDone,
  autoPlay,
  onEdit,
}: {
  item: ReviewItem;
  onDone: (r: AnswerResult) => void;
  autoPlay: boolean;
  /** Open the word editor (offered once the answer is shown). */
  onEdit: () => void;
}) {
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [usedHint, setUsedHint] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);

  const submit = useCallback(
    async (body: { answer?: string; knewIt?: boolean }) => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/review/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: item.cardId, usedHint, ...body }),
        });
        const data = await response.json();
        // 401/404: the card belongs to a different session than the one now
        // in the browser — signed in or out in another tab since loading.
        if (response.status === 401 || response.status === 404) {
          setStale(true);
          return;
        }
        if (!response.ok) throw new Error(data.error ?? "Could not save that answer.");
        setResult(data);
        // Hear the word right after answering, while it is on screen.
        if (autoPlay) speakKorean(item.back.lemma);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not save that answer.");
      } finally {
        setBusy(false);
      }
    },
    [item.cardId, usedHint, autoPlay, item.back.lemma],
  );

  const choose = useCallback(
    (option: string) => {
      if (result || busy) return;
      setPicked(option);
      submit({ answer: option });
    },
    [result, busy, submit],
  );

  // Keyboard: 1–4 pick an option, Enter moves on after feedback.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement) return;
      if (!result && item.choices && /^[1-9]$/.test(event.key)) {
        const option = item.choices[Number(event.key) - 1];
        if (option) choose(option);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item.choices, result, choose]);

  useEffect(() => {
    if (result) nextRef.current?.focus();
    else if (item.exercise === "TYPING" && !item.selfGraded) inputRef.current?.focus();
  }, [result, item.exercise, item.selfGraded]);

  const recall = item.direction === "RECALL";

  return (
    <div>
      {/* scroll-mt clears the sticky nav when this is scrolled into view. */}
      <div ref={frontRef} className="scroll-mt-16">
        <Front item={item} />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-clay-soft px-3 py-2 text-sm text-clay">
          {error}
        </p>
      )}

      {stale && (
        <div role="alert" className="mt-4 rounded-md bg-clay-soft px-3 py-3 text-sm text-clay">
          You signed in or out since this page opened, so these cards belong to another
          account.
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="ml-2 font-medium underline underline-offset-4"
          >
            Reload
          </button>
        </div>
      )}

      {/* ---- answering ---- */}
      {!result && item.selfGraded && (
        <div className="mt-6">
          {!revealed ? (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="w-full rounded-md bg-celadon-deep px-4 py-3 font-medium text-paper"
            >
              Show answer
            </button>
          ) : (
            <>
              <Back item={item} onEdit={onEdit} />
              <p className="mt-5 text-sm text-muted">Did you know it?</p>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => submit({ knewIt: false })}
                  className="rounded-md border border-line bg-surface px-4 py-3 font-medium disabled:opacity-50"
                >
                  Not yet
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => submit({ knewIt: true })}
                  className="rounded-md bg-celadon-deep px-4 py-3 font-medium text-paper disabled:opacity-50"
                >
                  Knew it
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {!item.selfGraded && item.exercise === "CHOICE" && item.choices && (
        // On phones the options make way for the answer card once answered,
        // so it appears where the eye already is instead of below the fold.
        <ul className={`mt-6 flex-col gap-2.5 ${result ? "hidden sm:flex" : "flex"}`}>
          {item.choices.map((option, index) => {
            const isPicked = picked === option;
            const isAnswer = result && option === result.expected;
            const tone = !result
              ? "border-line bg-surface hover:border-celadon"
              : isAnswer
                ? "border-celadon bg-celadon-soft text-celadon-deep"
                : isPicked
                  ? "border-clay bg-clay-soft text-clay"
                  : "border-line bg-surface opacity-60";
            return (
              <li key={option}>
                <button
                  type="button"
                  onClick={() => choose(option)}
                  disabled={Boolean(result) || busy}
                  className={`flex w-full items-baseline gap-3 rounded-md border px-4 py-3 text-left ${tone}`}
                >
                  <span className="text-xs text-muted tabular-nums">{index + 1}</span>
                  <span className={recall ? "korean text-xl" : ""}>{option}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!item.selfGraded && item.exercise === "TYPING" && (
        <form
          className="mt-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!result && typed.trim()) submit({ answer: typed });
          }}
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm text-muted">
              {recall ? "Type the Korean word" : "Type the meaning in English"}
            </span>
            <input
              ref={inputRef}
              // iOS scrolls the focused field above the keyboard and pushes
              // the question off screen; bring the question back into view.
              onFocus={() => setTimeout(() => frontRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 300)}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={Boolean(result) || busy}
              lang={recall ? "ko" : "en"}
              // Keyboard suggestions would give the answer away. Browsers honour
              // these; a system predictive bar can still need turning off.
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-gramm="false"
              className={`rounded-md border border-line bg-surface px-4 py-3 outline-none focus:border-celadon ${
                recall ? "korean text-2xl" : "text-lg"
              }`}
            />
          </label>
          {!result && (
            <div className="mt-3 flex items-center gap-3">
              <button
                type="submit"
                disabled={busy || !typed.trim()}
                className="flex-1 rounded-md bg-celadon-deep px-4 py-3 font-medium text-paper disabled:opacity-50"
              >
                Check
              </button>
              {item.hint && (
                <button
                  type="button"
                  onClick={() => setUsedHint(true)}
                  disabled={usedHint}
                  className="rounded-md border border-line px-4 py-3 text-sm"
                >
                  {usedHint ? (
                    <span>
                      Starts with <span className="korean">{item.hint}</span>
                    </span>
                  ) : (
                    "Hint"
                  )}
                </button>
              )}
            </div>
          )}
          {!recall && !result && (
            <p className="mt-2 text-xs text-muted">Recalling the word counts, spelling slips are fine.</p>
          )}
        </form>
      )}

      {/* ---- feedback ---- */}
      {result && (
        <div className="mt-6">
          <p
            className={`rounded-md px-3 py-2.5 text-sm font-medium ${
              result.correct ? "bg-celadon-soft text-celadon-deep" : "bg-clay-soft text-clay"
            }`}
          >
            {feedbackLine(result, item, picked)}
          </p>
          {!item.selfGraded && <Back item={item} onEdit={onEdit} />}
          <button
            ref={nextRef}
            type="button"
            onClick={() => onDone(result)}
            className="mt-5 w-full rounded-md bg-celadon-deep px-4 py-3 font-medium text-paper"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The sentence under an answer: right / almost (with a note) / wrong (with the
 * expected answer), and how many right answers are left for a new word.
 */
function feedbackLine(result: AnswerResult, item: ReviewItem, picked: string | null): string {
  if (result.graduated) return "Learned — this word now moves to spaced review.";
  if (result.verdict === "almost") return `${result.note ?? "Close."} Expected: ${result.expected}`;
  if (result.correct) {
    if (item.phase !== "LEARNING") return "Right.";
    const left = item.learningGoal - result.learningStreak;
    return left === 1 ? "Right — one more, and this time type it." : `Right — ${left} more to go.`;
  }
  // The options are hidden on phones after answering, so say what was picked.
  return picked
    ? `Not quite — you picked ${picked}. The answer: ${result.expected}`
    : `Not quite. The answer: ${result.expected}`;
}

// ---------------------------------------------------------------- intro

/**
 * First meeting with a new word: everything about it at once, before any
 * drill asks for it. Nobody can pick the meaning of a word never seen.
 */
function Intro({
  item,
  autoPlay,
  onStart,
  onSkip,
  onEdit,
}: {
  item: ReviewItem;
  autoPlay: boolean;
  onStart: () => Promise<void>;
  onSkip: () => Promise<void>;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState<"start" | "skip" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  const { back } = item;
  const size = useContext(TextSizeContext);
  const level = levelLabel(back.level);
  const pos = posLabel(back.partOfSpeech);

  useEffect(() => {
    startRef.current?.focus();
    if (autoPlay) speakKorean(item.back.lemma);
  }, [autoPlay, item.back.lemma]);

  /** Press a button: call the parent's action and show an error if it fails. */
  async function run(action: "start" | "skip") {
    setBusy(action);
    setError(null);
    try {
      await (action === "start" ? onStart() : onSkip());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save that.");
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="rounded-lg border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="korean text-5xl leading-tight">{back.lemma}</span>
          <SpeakButton text={back.lemma} />
          <EditButton onClick={onEdit} className="ml-auto" />
        </div>
        <CategoryChips names={item.categories} />
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {back.originalForm && (
            <span className="korean text-lg text-muted" title="Hanja — the Chinese characters behind the word">
              {back.originalForm}
            </span>
          )}
          {level && (
            <span className="rounded-full bg-celadon-soft px-2.5 py-0.5 text-xs text-celadon-deep">{level}</span>
          )}
          {pos && <span className="text-xs text-muted">{pos}</span>}
        </div>
        {back.translation && <p className={`mt-4 font-semibold ${size.meaning}`}>{back.translation}</p>}
        {back.userMeaning && (
          <p className={back.translation ? `mt-1 text-muted ${size.second}` : `mt-4 font-semibold ${size.meaning}`}>
            {back.translation ? `Yours: ${back.userMeaning}` : back.userMeaning}
          </p>
        )}
        {back.definitionTarget && <p className={`korean mt-3 ${size.definition}`}>{back.definitionTarget}</p>}
        {back.definitionKnown && <p className="mt-1 text-sm text-muted">{back.definitionKnown}</p>}
        {back.example && (
          <div className="mt-4 border-l-2 border-celadon pl-3">
            <p className={`korean leading-relaxed ${size.example}`}>{back.example}</p>
            {back.exampleTranslation && <p className={`mt-0.5 text-muted ${size.exampleTranslation}`}>{back.exampleTranslation}</p>}
          </div>
        )}
        {/* The model's note on how the word was used in the user's text — labelled,
            so it is not mistaken for the example's translation. */}
        {back.contextNote && (
          <p className="mt-3 rounded-md bg-paper px-3 py-2 text-sm text-muted">
            <i className="bi bi-info-circle mr-1.5" aria-hidden />
            Note from your text: {back.contextNote}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md bg-clay-soft px-3 py-2 text-sm text-clay">
          {error}
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("skip")}
          className="rounded-md border border-line bg-surface px-4 py-3 font-medium disabled:opacity-50"
        >
          {busy === "skip" ? "Skipping…" : "Skip for 3 days"}
        </button>
        <button
          ref={startRef}
          type="button"
          disabled={busy !== null}
          onClick={() => run("start")}
          className="rounded-md bg-celadon-deep px-4 py-3 font-medium text-paper disabled:opacity-50"
        >
          {busy === "start" ? "Starting…" : "Start learning"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- card faces

function Front({ item }: { item: ReviewItem }) {
  const size = useContext(TextSizeContext);
  if (item.front.lemma) {
    return (
      <div className="grid min-h-40 place-items-center rounded-lg bg-celadon-soft px-6 py-10">
        <div className="flex flex-col items-center gap-2">
          <p className="korean text-center text-5xl leading-tight">{item.front.lemma}</p>
          <SpeakButton text={item.front.lemma} />
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-line bg-surface px-6 py-8">
      {item.front.meaning && <p className={`font-semibold ${size.meaning}`}>{item.front.meaning}</p>}
      {item.front.altMeaning && <p className={`mt-1 text-muted ${size.second}`}>{item.front.altMeaning}</p>}
      {item.front.definitionTarget && (
        <p className={`korean text-muted ${item.front.meaning ? "mt-3" : "text-lg text-ink"}`}>
          {item.front.definitionTarget}
        </p>
      )}
    </div>
  );
}

/**
 * The answer side. Shows only what the front did not: on an English →
 * Korean card the meaning and Korean definition were the question, so they
 * are not repeated here.
 */
function Back({ item, onEdit }: { item: ReviewItem; onEdit: () => void }) {
  const { back, front } = item;
  const size = useContext(TextSizeContext);
  const level = levelLabel(back.level);
  const pos = posLabel(back.partOfSpeech);
  return (
    <div className="mt-4 rounded-lg border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="korean text-3xl">{back.lemma}</span>
        <SpeakButton text={back.lemma} className="self-center" />
        {back.originalForm && (
          <span className="korean text-lg text-muted" title="Hanja — the Chinese characters behind the word">
            {back.originalForm}
          </span>
        )}
        {level && (
          <span className="rounded-full bg-celadon-soft px-2.5 py-0.5 text-xs text-celadon-deep">{level}</span>
        )}
        {pos && <span className="text-xs text-muted">{pos}</span>}
        {/* Last in the row, so ml-auto pushes only the button to the right. */}
        <EditButton onClick={onEdit} className="ml-auto" />
      </div>
      <CategoryChips names={item.categories} />
      {back.translation && !front.meaning && <p className={`mt-2 font-medium ${size.second}`}>{back.translation}</p>}
      {back.userMeaning && !front.meaning && (
        <p className="mt-1 text-sm text-muted">Yours: {back.userMeaning}</p>
      )}
      {back.definitionTarget && !front.definitionTarget && (
        <p className={`korean mt-2 ${size.definition}`}>{back.definitionTarget}</p>
      )}
      {back.definitionKnown && !front.meaning && (
        <p className="mt-1 text-sm text-muted">{back.definitionKnown}</p>
      )}
      {back.example && (
        <div className="mt-3 border-l-2 border-celadon pl-3">
          <p className={`korean leading-relaxed ${size.example}`}>{back.example}</p>
          {back.exampleTranslation && (
            <p className={`mt-0.5 text-muted ${size.exampleTranslation}`}>{back.exampleTranslation}</p>
          )}
        </div>
      )}
    </div>
  );
}

/** "Edit" — opens the word editor under the card, to fix the word on the spot. */
function EditButton({ onClick, className = "" }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-sm text-muted hover:text-ink ${className}`}
    >
      <i className="bi bi-pencil mr-1" aria-hidden />
      Edit
    </button>
  );
}

/** The word's categories as small tags under the word. */
function CategoryChips({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <p className="mt-2 flex flex-wrap gap-1.5">
      {names.map((name) => (
        <span key={name} className="rounded-full bg-paper px-2.5 py-0.5 text-xs text-muted">
          <i className="bi bi-tag mr-1" aria-hidden />
          {name}
        </span>
      ))}
    </p>
  );
}
