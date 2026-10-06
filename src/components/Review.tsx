"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DeckStats, ReviewItem, StudyMode } from "@/lib/review/queue";
import type { AnswerResult } from "@/lib/review/submit";
import { levelLabel, posLabel } from "@/lib/dictionary/labels";
import SpeakButton, { speakKorean } from "./SpeakButton";

type Load = "loading" | "ready" | "error";

/** A learning card answered but not graduated comes back this many cards later. */
const REQUEUE_GAP = 3;

export default function Review({ mode }: { mode: StudyMode }) {
  const [load, setLoad] = useState<Load>("loading");
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [stats, setStats] = useState<DeckStats | null>(null);
  const [autoPlay, setAutoPlay] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/review/session?mode=${mode}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load reviews.");
        setQueue(data.items);
        setTotal(data.items.length);
        setStats(data.stats);
        setAutoPlay(Boolean(data.autoPlay));
        setLoad("ready");
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : "Could not load reviews.");
        setLoad("error");
      });
  }, [mode]);

  const current = queue[0];

  /** Called once the user has seen the feedback and moves on. */
  function advance(result: AnswerResult) {
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
      const at = Math.min(REQUEUE_GAP, rest.length);
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
            {current.phase === "LEARNING"
              ? `New word · ${current.learningStreak} of ${current.learningGoal} in a row`
              : "Review"}
          </span>
          <span className="tabular-nums">{queue.length} left</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden>
          <div
            className="h-full bg-celadon transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      </div>

      {/* Keyed on the card and attempt, so state resets for every question. */}
      <Question
        key={`${current.cardId}-${done}`}
        item={current}
        onDone={advance}
        autoPlay={autoPlay}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-xl px-4 pb-24 pt-8 sm:px-6">{children}</main>;
}

// ---------------------------------------------------------------- question

function Question({
  item,
  onDone,
  autoPlay,
}: {
  item: ReviewItem;
  onDone: (r: AnswerResult) => void;
  autoPlay: boolean;
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
      <Front item={item} />

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
              <Back item={item} />
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
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={Boolean(result) || busy}
              lang={recall ? "ko" : "en"}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
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
          {!item.selfGraded && <Back item={item} />}
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

// ---------------------------------------------------------------- card faces

function Front({ item }: { item: ReviewItem }) {
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
      {item.front.meaning && <p className="text-2xl font-semibold">{item.front.meaning}</p>}
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
function Back({ item }: { item: ReviewItem }) {
  const { back, front } = item;
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
      </div>
      {back.translation && !front.meaning && <p className="mt-2 font-medium">{back.translation}</p>}
      {back.definitionTarget && !front.definitionTarget && (
        <p className="korean mt-2 text-base sm:text-sm">{back.definitionTarget}</p>
      )}
      {back.definitionKnown && !front.meaning && (
        <p className="mt-1 text-sm text-muted">{back.definitionKnown}</p>
      )}
      {back.example && (
        <div className="mt-3 border-l-2 border-celadon pl-3">
          <p className="korean text-lg leading-relaxed sm:text-base">{back.example}</p>
          {back.exampleTranslation && (
            <p className="mt-0.5 text-sm text-muted">{back.exampleTranslation}</p>
          )}
        </div>
      )}
    </div>
  );
}
