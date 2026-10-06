"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";

interface FillResult {
  fromDictionary: number;
  fromAi: number;
  remaining: number;
  aiBlocked?: "anonymous" | "user" | "daily";
}

export default function SettingsPanel({
  email,
  askRecognition: initialAsk,
  showKoreanDefinition: initialKorean,
  learningGoal: initialGoal,
  autoPlayAudio: initialAutoPlay,
  myMeaningFirst: initialMyFirst,
  newPerSession: initialNewPerSession,
  credits,
  missingExamples,
  missingMeanings,
  planName,
  lookups,
}: {
  /** null = no account yet. */
  email: string | null;
  askRecognition: boolean;
  showKoreanDefinition: boolean;
  learningGoal: number;
  autoPlayAudio: boolean;
  myMeaningFirst: boolean;
  newPerSession: number;
  /** null = unlimited. */
  credits: number | null;
  missingExamples: number;
  missingMeanings: number;
  planName: string;
  /** Typed-in dictionary lookups today; limit null = unlimited. */
  lookups: { used: number; limit: number | null };
}) {
  const router = useRouter();
  const [askRecognition, setAskRecognition] = useState(initialAsk);
  const [showKorean, setShowKorean] = useState(initialKorean);
  const [goal, setGoal] = useState(initialGoal);
  const [autoPlay, setAutoPlay] = useState(initialAutoPlay);
  const [myFirst, setMyFirst] = useState(initialMyFirst);
  const [perSession, setPerSession] = useState(initialNewPerSession);
  const [error, setError] = useState<string | null>(null);
  /** One fill at a time: while one runs, the other button waits. */
  const [task, setTask] = useState<"meanings" | "examples" | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [filled, setFilled] = useState<FillResult | null>(null);
  const [meaningsDone, setMeaningsDone] = useState<FillResult | null>(null);

  /**
   * Runs a fill endpoint round after round (each handles up to ~60 words)
   * until nothing is left, nothing more can be done, or AI credits run out.
   */
  async function runFill(
    kind: "meanings" | "examples",
    total: number,
    onDone: (result: FillResult) => void,
  ) {
    setTask(kind);
    setProgress({ done: 0, total });
    setError(null);
    const sum: FillResult = { fromDictionary: 0, fromAi: 0, remaining: total };
    try {
      for (let round = 0; round < 50; round++) {
        const response = await fetch(`/api/${kind}`, { method: "POST" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Something went wrong.");
        sum.fromDictionary += data.fromDictionary;
        sum.fromAi += data.fromAi;
        sum.remaining = data.remaining;
        sum.aiBlocked = data.aiBlocked;
        setProgress({ done: Math.max(0, total - data.remaining), total });
        if (data.remaining === 0 || data.aiBlocked || data.fromDictionary + data.fromAi === 0) break;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      onDone(sum);
      setTask(null);
      router.refresh();
    }
  }

  const fillMeanings = () => runFill("meanings", missingMeanings, setMeaningsDone);

  async function save(change: Record<string, boolean | number>, undo: () => void) {
    setError(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Could not save.");
    } catch (cause) {
      undo();
      setError(cause instanceof Error ? cause.message : "Could not save.");
    }
  }

  const fillExamples = () => runFill("examples", missingExamples, setFilled);

  const section = "rounded-lg border border-line bg-surface p-4";

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-2">
        <p className="korean text-4xl text-celadon-deep">설정</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Settings</h1>
      </header>

      {error && (
        <p role="alert" className="rounded-md bg-clay-soft px-3 py-2.5 text-sm text-clay">
          {error}
        </p>
      )}

      <section className={section}>
        <h2 className="font-medium">Cards</h2>
        <p className="mt-1 text-sm text-muted">
          Cards show the meaning and ask for the Korean word. Words you added with your own meaning
          show both — the English one and yours.
        </p>
        <Toggle
          checked={myFirst}
          onChange={(value) => {
            setMyFirst(value);
            save({ myMeaningFirst: value }, () => setMyFirst(!value));
          }}
          label="Lead with my own meaning (English below it)"
        />
        <Toggle
          checked={showKorean}
          onChange={(value) => {
            setShowKorean(value);
            save({ showKoreanDefinition: value }, () => setShowKorean(!value));
          }}
          label="Show the Korean definition under the English meaning"
        />
        <Toggle
          checked={askRecognition}
          onChange={(value) => {
            setAskRecognition(value);
            save({ askRecognition: value }, () => setAskRecognition(!value));
          }}
          label="Also ask the other way: Korean word → English meaning"
        />
        <Toggle
          checked={autoPlay}
          onChange={(value) => {
            setAutoPlay(value);
            save({ autoPlayAudio: value }, () => setAutoPlay(!value));
          }}
          label="Say the Korean word out loud after each answer (🔊 buttons work either way)"
        />
      </section>

      <section className={section}>
        <h2 className="font-medium">Learning new words</h2>
        <p className="mt-1 text-sm text-muted">
          A new word counts as learned after this many right answers in a row — the last one typed,
          the rest picked from options. Its first review is the next day; after that the gaps grow
          (roughly 1, 3, 7–10, 20+ days), shorter whenever you miss it.
        </p>
        <div role="radiogroup" aria-label="Right answers in a row" className="mt-3 flex flex-wrap gap-2">
          {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={goal === n}
              onClick={() => {
                const before = goal;
                setGoal(n);
                save({ learningGoal: n }, () => setGoal(before));
              }}
              className={`size-11 rounded-md border text-base ${
                goal === n ? "border-celadon-deep bg-celadon-deep text-paper" : "border-line"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      {(missingMeanings > 0 || meaningsDone) && (
        <section className={section}>
          <h2 className="font-medium">English meanings</h2>
          <p className="mt-1 text-sm text-muted">
            {missingMeanings === 0
              ? "Every word has an English meaning."
              : `${missingMeanings} ${missingMeanings === 1 ? "word has" : "words have"} only your own meaning. The dictionary fills in English where it can; the AI does the rest. Your meanings stay as they are.`}
          </p>
          {missingMeanings > 0 && (
            <button
              type="button"
              onClick={fillMeanings}
              disabled={task !== null}
              className="mt-3 rounded-md bg-celadon-deep px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
            >
              <i className={`bi ${task === "meanings" ? "bi-hourglass-split" : "bi-translate"} mr-1.5`} aria-hidden />
              {task === "meanings" ? "Adding meanings…" : "Fill in English meanings"}
            </button>
          )}
          {task === "meanings" && <Progress {...progress} />}
          {meaningsDone && (
            <p className="mt-3 text-sm">
              Added {meaningsDone.fromDictionary} from the dictionary and {meaningsDone.fromAi} from AI.
              {meaningsDone.remaining > 0 &&
                (meaningsDone.aiBlocked
                  ? ` ${meaningsDone.remaining} left — out of AI credits for now.`
                  : ` ${meaningsDone.remaining} left — the dictionary did not answer; try again later.`)}
            </p>
          )}
        </section>
      )}

      <section className={section}>
        <h2 className="font-medium">New words per session</h2>
        <p className="mt-1 text-sm text-muted">
          How many new words one Learn session introduces. Each is asked until you get it right
          {" "}several times in a row, so 10 new words is already a few dozen answers.
        </p>
        <div role="radiogroup" aria-label="New words per session" className="mt-3 flex flex-wrap gap-2">
          {[5, 10, 20, 30, 50].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={perSession === n}
              onClick={() => {
                const before = perSession;
                setPerSession(n);
                save({ newPerSession: n }, () => setPerSession(before));
              }}
              className={`h-11 min-w-11 rounded-md border px-3 text-base ${
                perSession === n ? "border-celadon-deep bg-celadon-deep text-paper" : "border-line"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <section className={section}>
        <h2 className="font-medium">Examples</h2>
        <p className="mt-1 text-sm text-muted">
          {missingExamples === 0
            ? "Every word has an example sentence."
            : `${missingExamples} ${missingExamples === 1 ? "word has" : "words have"} no example yet. Examples come from the dictionary first; the AI writes one only where the dictionary has none${email === null ? " (needs an account)" : ""}.`}
        </p>
        {missingExamples > 0 && (
          <button
            type="button"
            onClick={fillExamples}
            disabled={task !== null}
            className="mt-3 rounded-md bg-celadon-deep px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50"
          >
            <i className={`bi ${task === "examples" ? "bi-hourglass-split" : "bi-chat-quote"} mr-1.5`} aria-hidden />
            {task === "examples" ? "Adding examples…" : "Add missing examples"}
          </button>
        )}
        {task === "examples" && <Progress {...progress} />}
        {filled && (
          <p className="mt-3 text-sm">
            Added {filled.fromDictionary} from the dictionary and {filled.fromAi} written by AI.
            {filled.remaining > 0 && ` ${filled.remaining} still without — `}
            {filled.remaining > 0 &&
              (filled.aiBlocked === "anonymous"
                ? "create an account to let the AI fill those."
                : filled.aiBlocked
                  ? "out of AI credits for now."
                  : "the dictionary did not answer; try again later.")}
          </p>
        )}
      </section>

      <section className={section}>
        <h2 className="font-medium">Account</h2>
        {email === null ? (
          <>
            <p className="mt-1 text-sm text-muted">
              You are using the app without an account. Your words are kept on this device&apos;s
              session; sign in or create an account to keep them anywhere and to use AI.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Link href="/sign-up" className="rounded-md bg-celadon-deep px-4 py-2.5 text-sm font-medium text-paper">
                Create account
              </Link>
              <Link href="/sign-in" className="rounded-md border border-line px-4 py-2.5 text-sm">
                Sign in
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm">{email}</p>
            <p className="mt-1 text-sm text-muted">
              Plan: {planName}.{" "}
              {credits === null ? "Unlimited AI." : `${credits} AI credits left.`}{" "}
              Dictionary lookups today: {lookups.used}
              {lookups.limit === null ? "" : ` of ${lookups.limit}`}.{" "}
              <Link href="/pricing" className="text-celadon-deep underline underline-offset-4">
                Plans
              </Link>
            </p>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                router.push("/");
                router.refresh();
              }}
              className="mt-3 rounded-md border border-line px-4 py-2.5 text-sm"
            >
              <i className="bi bi-box-arrow-right mr-1.5" aria-hidden />
              Sign out
            </button>
          </>
        )}
      </section>
    </main>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="mt-3">
      <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full bg-celadon transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-xs text-muted tabular-nums">
        {done} of {total} — keep this page open
      </p>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="mt-3 flex items-start gap-3 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-celadon-deep" : "bg-line"
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-surface shadow transition-[left] ${
            checked ? "left-[1.125rem]" : "left-0.5"
          }`}
        />
      </button>
      {label}
    </label>
  );
}
