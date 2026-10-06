"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { AnalysisResult, WordCandidate } from "@/lib/ingest/analyze";
import { readFile, sourceFromText, type ImportSource } from "@/lib/import/read";
import CandidateRow from "./CandidateRow";
import FileDrop from "./FileDrop";
import ManualWord from "./ManualWord";

type Stage = "input" | "preview" | "done";

type Candidate = WordCandidate & { sourceId: string };

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
        all = [sourceFromText(pasted), ...files];
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
            body: JSON.stringify(job.payload),
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
            fresh.push({ ...candidate, id: `${job.id}:${candidate.id}`, sourceId: source.id });
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
          .filter((c) => c.sourceId === source.id && c.selected && c.dictionary)
          .map((c) => ({
            lemma: c.lemma,
            sentence: c.sentence,
            contextNote: c.contextNote,
            register: c.register,
            primaryCategory: c.primaryCategory,
            secondaryCategories: c.secondaryCategories,
            categoriesFromAi: !c.edited,
            dictionary: c.dictionary,
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

  function setAll(selected: boolean) {
    setCandidates((list) => list.map((c) => (c.status === "new" ? { ...c, selected } : c)));
  }

  function reset() {
    setText("");
    setFiles([]);
    setFileErrors([]);
    setSources([]);
    setCandidates([]);
    setSummary(null);
    setStage("input");
  }

  const chosen = candidates.filter((c) => c.selected).length;
  const count = (status: WordCandidate["status"]) => candidates.filter((c) => c.status === status).length;
  const partsTotal = sources.reduce((sum, s) => sum + s.jobs.length, 0);
  const partsDone = sources.reduce((sum, s) => sum + s.partsDone, 0);
  const grouped = sources.length > 1;

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
              Paste Korean text — a lesson, an article, subtitles, or a word list with your own
              translations.
            </span>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={7}
              placeholder="오늘은 날씨가 좋아서 친구랑 공원에서 산책했어요."
              className="korean w-full resize-y rounded-md border border-line bg-surface p-4 text-lg leading-relaxed outline-none focus:border-celadon"
            />
          </label>

          <div className="mt-4">
            <FileDrop onFiles={addFiles} />
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
            {totalParts > 1 ? `Find words · ${totalParts} parts` : "Find words"}
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

          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {count("new")} found
              {count("duplicate") > 0 && `, ${count("duplicate")} already yours`}
              {count("unverified") > 0 && `, ${count("unverified")} unconfirmed`}
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
              const showHeader = grouped || source.error;
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
