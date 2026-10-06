"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { AnalysisResult, RecheckResult, WordCandidate } from "@/lib/ingest/analyze";
import {
  isTopicRequest,
  readFile,
  sourceFromText,
  sourceFromTopic,
  type ImportSource,
} from "@/lib/import/read";
import CandidateRow from "./CandidateRow";
import FileDrop from "./FileDrop";
import ManualWord from "./ManualWord";

type Stage = "input" | "preview" | "done";

/** originalCategory: the model's pick, restored when "Put every word in" is unticked. */
type Candidate = WordCandidate & { sourceId: string; originalCategory: string };

interface SourceState extends ImportSource {
  status: "waiting" | "analysing" | "done" | "error";
  partsDone: number;
  error?: string;
}

interface SaveSummary {
  created: number;
  alreadySaved: number;
  failed: string[];
}

/** null = unlimited. */
export default function AddWords({
  initialCredits,
  anonymous,
  categories,
}: {
  /** null = unlimited. */
  initialCredits: number | null;
  /** No account: AI is off, typing words in works. */
  anonymous: boolean;
  /** The user's categories plus the built-in ones, for the pickers. */
  categories: string[];
}) {
  const [mode, setMode] = useState<"ai" | "manual">(anonymous ? "manual" : "ai");
  /** Keep phrases and sentences whole, not only single words. */
  const [phrases, setPhrases] = useState(true);
  const [credits, setCredits] = useState(initialCredits);
  const outOfCredits = credits !== null && credits <= 0;
  const [stage, setStage] = useState<Stage>("input");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<ImportSource[]>([]);
  const [reading, setReading] = useState(0);
  const [fileErrors, setFileErrors] = useState<string[]>([]);

  const [sources, setSources] = useState<SourceState[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [merged, setMerged] = useState(0);
  const [running, setRunning] = useState(false);
  const stopRef = useRef<AbortController | null>(null);
  /** Sources whose words all go into the file's own category (read inside the async loop). */
  const forcedRef = useRef<Record<string, string>>({});
  const [forced, setForced] = useState<Record<string, string>>({});
  const [rechecking, setRechecking] = useState(false);
  /** Background example filling after a save: null = not started. */
  const [examples, setExamples] = useState<{ added: number; done: boolean; note?: string } | null>(null);

  const [summary, setSummary] = useState<SaveSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ---------------------------------------------------------------- input

  async function addFiles(dropped: File[]) {
    setReading((n) => n + dropped.length);
    await Promise.all(
      dropped.map(async (file) => {
        try {
          const source = await readFile(file);
          setFiles((list) => [...list, source]);
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : `${file.name}: could not read`;
          setFileErrors((list) => [...list, message]);
        } finally {
          setReading((n) => n - 1);
        }
      }),
    );
  }

  const pasted = text.trim();
  const totalParts =
    files.reduce((sum, source) => sum + source.jobs.length, 0) +
    (pasted ? Math.max(1, Math.ceil(pasted.split("\n").length / 40)) : 0);

  // ---------------------------------------------------------------- analyse

  async function analyse() {
    let all: ImportSource[] = files;
    if (pasted) {
      try {
        all = [isTopicRequest(pasted) ? sourceFromTopic(pasted) : sourceFromText(pasted), ...files];
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No Korean text found.");
        return;
      }
    }
    if (all.length === 0) return;

    const initial: SourceState[] = all.map((s) => ({ ...s, status: "waiting", partsDone: 0 }));
    setSources(initial);
    setCandidates([]);
    setMerged(0);
    setError(null);
    setStage("preview");
    setRunning(true);

    const controller = new AbortController();
    stopRef.current = controller;
    const seen = new Set<string>();
    const unreachable: WordCandidate[] = [];
    const patch = (id: string, change: Partial<SourceState>) =>
      setSources((list) => list.map((s) => (s.id === id ? { ...s, ...change } : s)));

    // One part at a time: gentle on the dictionary API, and stopping
    // halfway leaves everything found so far usable.
    for (const source of initial) {
      if (controller.signal.aborted) break;
      patch(source.id, { status: "analysing" });
      let partsDone = 0;
      let failure: string | undefined;

      for (const job of source.jobs) {
        if (controller.signal.aborted) break;
        try {
          const response = await fetch("/api/ingest/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...job.payload, phrases }),
            signal: controller.signal,
          });
          const data = await response.json();
          if (data.aiQuota) {
            // Every remaining part would be refused the same way.
            if (data.aiQuota === "user") setCredits(0);
            setError(data.error);
            controller.abort();
            break;
          }
          if (!response.ok) throw new Error(data.error ?? "Analysis failed.");
          if (data.aiCreditsLeft !== undefined) setCredits(data.aiCreditsLeft);

          const result = data as AnalysisResult;
          const fresh: Candidate[] = [];
          let repeats = 0;
          for (const candidate of result.candidates) {
            // The same word from two files or two parts: keep the first.
            const key = `${candidate.lemma}|${candidate.dictionary?.targetCode ?? ""}`;
            if (seen.has(key)) {
              repeats += 1;
              continue;
            }
            seen.add(key);
            const forcedName = forcedRef.current[source.id];
            const id = `${job.id}:${candidate.id}`;
            fresh.push({
              ...candidate,
              id,
              sourceId: source.id,
              originalCategory: candidate.primaryCategory,
              ...(forcedName && { primaryCategory: forcedName, edited: true }),
            });
            if (candidate.status === "unreachable") unreachable.push({ ...candidate, id });
          }
          setCandidates((list) => [...list, ...fresh]);
          setMerged((n) => n + repeats);
        } catch (cause) {
          if (controller.signal.aborted) break;
          failure = cause instanceof Error ? cause.message : "Analysis failed.";
          // A daily-limit error will fail every remaining part too.
          if (/daily limit/i.test(failure)) controller.abort();
        }
        partsDone += 1;
        patch(source.id, { partsDone });
      }

      patch(source.id, {
        status: failure ? "error" : "done",
        error: failure && partsDone > 1 ? `Some parts failed: ${failure}` : failure,
      });
    }

    setRunning(false);
    // One automatic second try for words the dictionary did not answer.
    if (unreachable.length && !controller.signal.aborted) await recheck(unreachable);
    stopRef.current = null;
  }

  // ---------------------------------------------------------------- save

  async function save() {
    setBusy(true);
    setError(null);
    const total: SaveSummary = { created: 0, alreadySaved: 0, failed: [] };
    try {
      for (const source of sources) {
        const words = candidates
          .filter(
            (c) => c.sourceId === source.id && c.selected && (c.dictionary || c.aiMeaning || c.userMeaning),
          )
          .map((c) => ({
            lemma: c.lemma,
            sentence: c.sentence,
            contextNote: c.contextNote,
            register: c.register,
            primaryCategory: c.primaryCategory,
            secondaryCategories: c.secondaryCategories,
            categoriesFromAi: !c.edited,
            dictionary: c.dictionary,
            aiMeaning: c.aiMeaning,
            userMeaning: c.userMeaning,
            useDictionaryMeaning: c.useDictionaryMeaning,
          }));
        if (words.length === 0) continue;

        const response = await fetch("/api/ingest/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: source.kind,
            title: source.name,
            text: source.text,
            words,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not save.");
        total.created += data.created;
        total.alreadySaved += data.alreadySaved?.length ?? 0;
        total.failed.push(...(data.skipped ?? []));
      }
      setSummary(total);
      if (total.created > 0) fillExamples();
      setStage("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  function update(next: WordCandidate) {
    setCandidates((list) => list.map((c) => (c.id === next.id ? { ...c, ...next } : c)));
  }

  /** Tick: all of the file's words go into its own category. Untick: back to the model's picks. */
  function putAllIn(sourceId: string, name: string, on: boolean) {
    const next = { ...forcedRef.current };
    if (on) next[sourceId] = name;
    else delete next[sourceId];
    forcedRef.current = next;
    setForced(next);
    setCandidates((list) =>
      list.map((c) =>
        c.sourceId !== sourceId
          ? c
          : on
            ? { ...c, primaryCategory: name, edited: true }
            : { ...c, primaryCategory: c.originalCategory, edited: false },
      ),
    );
  }

  /** Ask the dictionary again about words it did not answer for. No AI, no credits. */
  async function recheck(items: WordCandidate[]) {
    if (items.length === 0) return;
    setRechecking(true);
    try {
      for (let i = 0; i < items.length; i += 60) {
        const batch = items
          .slice(i, i + 60)
          .map(({ id, lemma, gloss, contextNote }) => ({ id, lemma, gloss, contextNote }));
        const response = await fetch("/api/ingest/recheck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: batch }),
        });
        if (!response.ok) break;
        const { results } = (await response.json()) as { results: RecheckResult[] };
        const byId = new Map(results.filter((r) => r.status !== "unreachable").map((r) => [r.id, r]));
        setCandidates((list) =>
          list.map((c) => {
            const r = byId.get(c.id);
            if (!r) return c;
            return {
              ...c,
              status: r.status,
              dictionary: r.dictionary,
              homographs: r.homographs,
              selected: r.status === "duplicate" ? false : r.status === "new" ? true : c.selected,
            };
          }),
        );
      }
    } finally {
      setRechecking(false);
    }
  }

  /**
   * Saved words without an example get one: dictionary first, AI for the
   * rest (in the user's meaning). Runs in rounds of up to 60 words until
   * nothing is left or nothing more can be done.
   */
  async function fillExamples() {
    setExamples({ added: 0, done: false });
    let added = 0;
    for (let round = 0; round < 40; round++) {
      let data: { fromDictionary: number; fromAi: number; remaining: number; aiBlocked?: string };
      try {
        const response = await fetch("/api/examples", { method: "POST" });
        if (!response.ok) break;
        data = await response.json();
      } catch {
        break;
      }
      added += data.fromDictionary + data.fromAi;
      setExamples({ added, done: false });
      if (data.remaining === 0) break;
      if (data.aiBlocked) {
        setExamples({
          added,
          done: true,
          note:
            data.aiBlocked === "anonymous"
              ? "Create an account to have AI write the rest."
              : "The rest need AI credits.",
        });
        return;
      }
      // No progress this round (dictionary down, nothing generated): stop.
      if (data.fromDictionary + data.fromAi === 0) break;
    }
    setExamples((current) => ({ added, done: true, note: current?.note }));
  }

  function setAll(selected: boolean) {
    setCandidates((list) =>
      list.map((c) => (c.status === "new" || c.status === "ai" ? { ...c, selected } : c)),
    );
  }

  function reset() {
    setText("");
    setFiles([]);
    setFileErrors([]);
    setSources([]);
    setCandidates([]);
    setSummary(null);
    setExamples(null);
    setStage("input");
  }

  const chosen = candidates.filter((c) => c.selected).length;
  const count = (status: WordCandidate["status"]) => candidates.filter((c) => c.status === status).length;
  const partsTotal = sources.reduce((sum, s) => sum + s.jobs.length, 0);
  const partsDone = sources.reduce((sum, s) => sum + s.partsDone, 0);
  const grouped = sources.length > 1;
  const conflicts = candidates.filter((c) => c.conflict === "meaning" && c.selected).length;
  const unreachableCount = candidates.filter((c) => c.status === "unreachable").length;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-28 pt-8 sm:px-6">
      <header className="mb-7">
        <p className="korean text-4xl text-celadon-deep">새 단어</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Add words</h1>
      </header>

      {error && (
        <p role="alert" className="mb-5 rounded-md bg-clay-soft px-3 py-2.5 text-sm text-clay">
          {error}
        </p>
      )}

      {stage === "input" && (
        <div role="tablist" className="mb-6 flex gap-1 rounded-lg bg-celadon-soft p-1 text-sm">
          {(
            [
              ["ai", "From text & files", "bi-magic"],
              ["manual", "Type a word", "bi-pencil"],
            ] as const
          ).map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`flex-1 rounded-md px-3 py-2 ${
                mode === value ? "bg-surface font-medium shadow-sm" : "text-muted"
              }`}
            >
              <i className={`bi ${icon} mr-1.5`} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}

      {stage === "input" && mode === "manual" && <ManualWord categories={categories} />}

      {stage === "input" && mode === "ai" && anonymous && (
        <div className="rounded-lg border border-line bg-surface p-6">
          <p className="font-medium">Finding words with AI needs a free account</p>
          <p className="mt-1 text-sm text-muted">
            Paste texts, drop screenshots, Anki decks or tables — the AI picks out the words and
            the dictionary fills them in. New accounts get free AI credits, and everything you
            have added so far comes along.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/sign-up"
              className="rounded-md bg-celadon-deep px-5 py-2.5 text-sm font-medium text-paper"
            >
              Create account
            </Link>
            <Link href="/sign-in" className="rounded-md border border-line px-5 py-2.5 text-sm">
              Sign in
            </Link>
          </div>
        </div>
      )}

      {stage === "input" && mode === "ai" && !anonymous && (
        <>
          <label className="flex flex-col gap-2">
            <span className="text-sm text-muted">
              Paste Korean text, a word list with your translations — or just ask, in any
              language: <em>“weather words”</em>, <em>“ordering in a cafe, beginner”</em>.
            </span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              placeholder="오늘은 날씨가 좋아서 친구랑 공원에서 산책했어요."
              className="korean w-full resize-y rounded-md border border-line bg-surface p-4 text-lg leading-relaxed outline-none focus:border-celadon"
            />
          </label>

          <div className="mt-4">
            <FileDrop onFiles={addFiles} />
          </div>

          <div role="radiogroup" aria-label="What to keep" className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Keep</span>
            {(
              [
                [false, "Words only"],
                [true, "Words & phrases"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={phrases === value}
                onClick={() => setPhrases(value)}
                className={`rounded-full border px-3 py-1 ${
                  phrases === value ? "border-celadon-deep bg-celadon-deep text-paper" : "border-line"
                }`}
              >
                {label}
              </button>
            ))}
            <span className="w-full text-xs text-muted">
              With phrases, set expressions and sentences (from a phrase list or a screenshot) are kept
              whole and learned as one card.
            </span>
          </div>

          {(files.length > 0 || reading > 0 || fileErrors.length > 0) && (
            <ul className="mt-4 flex flex-col gap-2">
              {files.map((source) => (
                <li
                  key={source.id}
                  className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2 text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{source.name}</span>
                    <span className="text-xs text-muted">{source.summary}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles((list) => list.filter((s) => s.id !== source.id))}
                    aria-label={`Remove ${source.name}`}
                    className="rounded px-2 py-1 text-muted hover:text-ink"
                  >
                    ✕
                  </button>
                </li>
              ))}
              {reading > 0 && (
                <li className="px-3 py-2 text-sm text-muted">
                  Reading {reading} {reading === 1 ? "file" : "files"}…
                </li>
              )}
              {fileErrors.map((message, index) => (
                <li key={index} className="rounded-md bg-clay-soft px-3 py-2 text-sm text-clay">
                  {message}
                </li>
              ))}
            </ul>
          )}

          {outOfCredits ? (
            <p className="mt-5 rounded-md bg-clay-soft px-3 py-2.5 text-sm text-clay">
              Your free AI credits are used up, so new words cannot be found automatically.
              Reviews and everything you saved keep working.
            </p>
          ) : (
            credits !== null && (
              <p className="mt-4 text-xs text-muted">
                {credits} AI credits left · a part costs about 2–5
              </p>
            )
          )}

          <button
            type="button"
            onClick={analyse}
            disabled={reading > 0 || totalParts === 0 || outOfCredits}
            className="mt-5 w-full rounded-md bg-celadon-deep px-4 py-3 font-medium text-paper disabled:opacity-50 sm:w-auto sm:px-8"
          >
            {totalParts > 1
              ? `Find words · ${totalParts} parts`
              : isTopicRequest(pasted) && files.length === 0
                ? "Find words on this topic"
                : "Find words"}
          </button>
          {totalParts > 10 && (
            <p className="mt-2 text-xs text-muted">
              Each part is one AI request plus dictionary lookups. Large decks take a few minutes;
              you can stop at any point and keep what was found.
            </p>
          )}
        </>
      )}

      {stage === "preview" && (
        <>
          {running && (
            <div className="mb-4 rounded-md border border-line bg-surface px-4 py-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>
                  Reading and looking up words… {partsDone} of {partsTotal}
                </span>
                <button
                  type="button"
                  onClick={() => stopRef.current?.abort()}
                  className="rounded-md border border-line px-3 py-1 text-sm"
                >
                  Stop
                </button>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-line" aria-hidden>
                <div
                  className="h-full bg-celadon transition-[width]"
                  style={{ width: `${partsTotal ? Math.round((partsDone / partsTotal) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}

          {unreachableCount > 0 && !running && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-4 py-3 text-sm">
              <span className="flex-1">
                The dictionary did not answer for {unreachableCount}{" "}
                {unreachableCount === 1 ? "word" : "words"} (a network hiccup). Checking again costs no AI
                credits and keeps everything else as it is.
              </span>
              <button
                type="button"
                disabled={rechecking}
                onClick={() => recheck(candidates.filter((c) => c.status === "unreachable"))}
                className="rounded-md bg-celadon-deep px-3 py-1.5 text-paper disabled:opacity-50"
              >
                <i
                  className={`bi ${rechecking ? "bi-hourglass-split" : "bi-arrow-clockwise"} mr-1.5`}
                  aria-hidden
                />
                {rechecking ? "Checking…" : "Check again"}
              </button>
            </div>
          )}

          <p className="mb-3 text-sm text-muted">
            <i className="bi bi-check2-square mr-1.5" aria-hidden />
            Ticked words will be added — untick anything you don&apos;t want.
          </p>

          {conflicts > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-clay-soft px-4 py-3 text-sm">
              <span className="flex-1 text-clay">
                {conflicts} {conflicts === 1 ? "word disagrees" : "words disagree"} with the dictionary —
                your meanings are kept unless you tick “Use the dictionary meaning”.
              </span>
              <button
                type="button"
                onClick={() =>
                  setCandidates((list) =>
                    list.map((c) => (c.conflict === "meaning" ? { ...c, useDictionaryMeaning: true } : c)),
                  )
                }
                className="rounded-md border border-clay px-3 py-1 text-clay"
              >
                Use dictionary for all
              </button>
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {count("new")} found
              {count("duplicate") > 0 && `, ${count("duplicate")} already yours`}
              {count("ai") > 0 && `, ${count("ai")} with AI meaning`}
              {count("unreachable") > 0 &&
                `, ${count("unreachable")} not checked — dictionary did not respond`}
              {merged > 0 && `, ${merged} repeats merged`}
            </p>
            <div className="flex gap-3 text-sm">
              <button
                type="button"
                onClick={() => setAll(true)}
                className="text-celadon-deep underline underline-offset-4"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setAll(false)}
                className="text-muted underline underline-offset-4"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {sources.map((source) => {
              const rows = candidates.filter((c) => c.sourceId === source.id);
              const showHeader = grouped || source.error || source.suggestedCategory;
              if (!showHeader && rows.length === 0) return null;
              return (
                <section key={source.id}>
                  {showHeader && (
                    <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-medium">{source.name}</span>
                      <span className="text-xs text-muted">
                        {source.status === "waiting"
                          ? "waiting"
                          : source.status === "analysing"
                            ? `part ${source.partsDone + 1} of ${source.jobs.length}`
                            : `${rows.length} words`}
                      </span>
                      {source.suggestedCategory && (
                        <label className="ml-auto flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={Boolean(forced[source.id])}
                            onChange={(event) =>
                              putAllIn(source.id, source.suggestedCategory!, event.target.checked)
                            }
                            className="size-4 accent-celadon-deep"
                          />
                          Put every word in “{source.suggestedCategory}”
                        </label>
                      )}
                      {source.error && <span className="w-full text-xs text-clay">{source.error}</span>}
                    </h2>
                  )}
                  {rows.length > 0 && (
                    <ul className="overflow-hidden rounded-lg border border-line bg-surface">
                      {rows.map((candidate) => (
                        <CandidateRow
                          key={candidate.id}
                          candidate={candidate}
                          onChange={update}
                          categories={categories}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>

          {/* Fixed on mobile so the action stays reachable in a long list. */}
          <div className="fixed inset-x-0 bottom-0 border-t border-line bg-paper px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mt-5 sm:border-0 sm:bg-transparent sm:p-0">
            <div className="mx-auto flex max-w-2xl gap-3">
              <button
                type="button"
                onClick={() => {
                  stopRef.current?.abort();
                  setStage("input");
                }}
                className="rounded-md border border-line px-4 py-3 text-sm"
              >
                Back
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy || running || chosen === 0}
                className="flex-1 rounded-md bg-celadon-deep px-4 py-3 font-medium text-paper disabled:opacity-50"
              >
                {busy ? "Saving…" : running ? "Still reading…" : `Add ${chosen} to my words`}
              </button>
            </div>
          </div>
        </>
      )}

      {stage === "done" && summary && (
        <div className="rounded-lg border border-line bg-surface p-6">
          <p className="korean text-3xl text-celadon-deep">완료</p>
          <p className="mt-2 font-medium">
            {summary.created} {summary.created === 1 ? "word" : "words"} added.
          </p>
          <p className="mt-1 text-sm text-muted">
            {summary.alreadySaved > 0 && `${summary.alreadySaved} were already in your words. `}
            {summary.failed.length > 0 && `Could not save: ${summary.failed.join(", ")}. `}
            They are ready to learn whenever you are.
          </p>
          {examples && (
            <p className="mt-2 text-sm text-muted">
              <i
                className={`bi ${examples.done ? "bi-chat-quote" : "bi-hourglass-split"} mr-1.5`}
                aria-hidden
              />
              {examples.done
                ? `${examples.added} example ${examples.added === 1 ? "sentence" : "sentences"} added.`
                : `Adding example sentences… ${examples.added} so far. Keep this page open — or finish later in Settings → Add missing examples.`}
              {examples.note && ` ${examples.note}`}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            className="mt-5 rounded-md bg-celadon-deep px-5 py-2.5 text-sm font-medium text-paper"
          >
            Add more
          </button>
        </div>
      )}
    </main>
  );
}
