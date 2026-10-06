"use client";

/**
 * The whole "Add words" screen (/add) — the largest component in the app.
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys.
 *
 * Flow:
 *   1. Input: pasted text, a topic request, or dropped files (<FileDrop/>).
 *      Files are parsed right here in the browser (lib/import/*) and split
 *      into parts ("jobs") of 40 lines.
 *   2. Analysis: parts are sent to /api/ingest/analyze, 3 at a time
 *      (runJobs). Each returns word candidates.
 *   3. Saving: in "Add automatically" mode every part is saved as soon as it
 *      is read (/api/ingest/commit), so Stop keeps what was found; finished
 *      parts are remembered in localStorage, so dropping the same file again
 *      resumes. In "Let me review first" mode the user ticks words in the
 *      preview (<CandidateRow/>) and presses Save.
 *   4. Afterwards: words the dictionary did not answer for are checked again
 *      (/api/verify), then missing meanings, examples and their translations
 *      are filled in (fillExamples).
 */

import Link from "next/link";
import { useRef, useState, useSyncExternalStore } from "react";
import type { AnalysisResult, RecheckResult, WordCandidate } from "@/lib/ingest/analyze";
import {
  isTopicRequest,
  readFile,
  sourceFromText,
  sourceFromTopic,
  type ImportJob,
  type ImportSource,
} from "@/lib/import/read";
import CandidateRow from "./CandidateRow";
import CategorySelect from "./CategorySelect";
import FileDrop from "./FileDrop";
import ManualWord from "./ManualWord";

type Stage = "input" | "preview" | "done";

/**
 * originalCategory: the model's pick, restored when "Put every word in" is unticked.
 * saved: already added (automatic mode) — shown as added, not saved again.
 */
/**
 * lockCategory: the word goes into a category the user asked for (in the
 * text, "All into one category", or a file's own category) — saved locked.
 */
type Candidate = WordCandidate & {
  sourceId: string;
  originalCategory: string;
  saved?: boolean;
  lockCategory?: boolean;
};

/**
 * How words get their category:
 *   ai   — the model picks one per word (default)
 *   one  — every word goes into one category the user names; it gets locked
 *   each — the user picks per word in the preview (forces "Let me review first")
 */
type CategoryMode = "ai" | "one" | "each";

/** Parts read at the same time. */
const PARALLEL_PARTS = 3;

/** Remembered per file, so adding the same file again resumes where it stopped. */
function doneKey(source: ImportSource) {
  return `hangugo:parts-done:${source.name}:${source.text.length}:${source.jobs.length}`;
}
/**
 * Which parts of this file were already analysed and saved (from localStorage) —
 * used to resume an interrupted import.
 */
function loadDoneParts(source: ImportSource): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(doneKey(source)) ?? "[]") as number[]);
  } catch {
    return new Set();
  }
}
/**
 * Remember that one part of this file is saved, so dropping the same file again
 * skips it.
 */
function markPartDone(source: ImportSource, index: number) {
  try {
    const done = loadDoneParts(source);
    done.add(index);
    localStorage.setItem(doneKey(source), JSON.stringify([...done]));
  } catch {
    // Private mode or storage blocked: resuming just will not skip parts.
  }
}
/** The add-mode preference lives in localStorage; this keeps React in sync with it. */
const autoAddListeners = new Set<() => void>();
/** Lets React re-render when the add-mode preference is changed on this page. */
function subscribeAutoAdd(listener: () => void) {
  autoAddListeners.add(listener);
  return () => autoAddListeners.delete(listener);
}
/**
 * Save the add-mode preference: true = add automatically, false = let me review
 * first.
 */
function setAutoAdd(value: boolean) {
  try {
    localStorage.setItem("hangugo:auto-add", value ? "1" : "0");
  } catch {
    // Not remembered beyond this visit.
  }
  autoAddListeners.forEach((listener) => listener());
}
/** Read the add-mode preference; automatic unless the user turned it off. */
function loadAutoAdd(): boolean {
  try {
    return localStorage.getItem("hangugo:auto-add") !== "0";
  } catch {
    return true;
  }
}

interface SourceState extends ImportSource {
  status: "waiting" | "analysing" | "done" | "error";
  partsDone: number;
  /** Parts finished in an earlier run of the same file, skipped this time. */
  skippedParts?: number;
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
  const seenRef = useRef<Set<string>>(new Set());
  const [failedJobs, setFailedJobs] = useState<ImportJob[]>([]);
  /** Running totals of automatic adding. */
  const [added, setAdded] = useState({ created: 0, pending: 0, alreadySaved: 0 });
  /** Add each part's words as soon as it is read (default), or review first. */
  const autoAddSetting = useSyncExternalStore(subscribeAutoAdd, loadAutoAdd, () => true);
  const [categoryMode, setCategoryMode] = useState<CategoryMode>("ai");
  /** The category for categoryMode "one" (an existing name or a new one). */
  const [oneCategory, setOneCategory] = useState("");
  /** Picking categories per word needs the preview, so it turns automatic adding off. */
  const autoAdd = autoAddSetting && categoryMode !== "each";
  /** Sources whose words all go into the file's own category (read inside the async loop). */
  const forcedRef = useRef<Record<string, string>>({});
  const [forced, setForced] = useState<Record<string, string>>({});
  const [rechecking, setRechecking] = useState(false);
  const [verifyNote, setVerifyNote] = useState<string | null>(null);
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

  /**
   * Parts run three at a time (the model is the slow step; the dictionary
   * handles that fine). In "add automatically" mode each part is saved as
   * soon as it is read, so stopping never loses what was already read, and
   * the parts a file had already finished are skipped when it is added
   * again — that is how an import resumes.
   */
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

    // "All into one category": every source's words go there, locked.
    const oneName = oneCategory.replace(/\s+/g, " ").trim().toLowerCase();
    if (categoryMode === "one" && !oneName) {
      setError("Choose the category to put the words in.");
      return;
    }
    const forcedStart: Record<string, string> = {};
    if (categoryMode === "one") for (const s of all) forcedStart[s.id] = oneName;
    forcedRef.current = forcedStart;
    setForced(forcedStart);

    const initial: SourceState[] = all.map((s) => {
      const doneBefore = autoAdd ? loadDoneParts(s) : new Set<number>();
      return {
        ...s,
        status: "waiting",
        partsDone: doneBefore.size,
        skippedParts: doneBefore.size,
      };
    });
    setSources(initial);
    seenRef.current = new Set();
    setCandidates([]);
    setMerged(0);
    setFailedJobs([]);
    setAdded({ created: 0, pending: 0, alreadySaved: 0 });
    setError(null);
    setStage("preview");

    const jobs = initial.flatMap((source) => {
      const doneBefore = autoAdd ? loadDoneParts(source) : new Set<number>();
      return source.jobs.filter((_, index) => !doneBefore.has(index));
    });
    await runJobs(jobs, initial);
  }

  /** Run the given parts; also used to retry the ones that failed. */
  async function runJobs(jobs: ImportJob[], sourceList: SourceState[]) {
    setRunning(true);
    const controller = new AbortController();
    stopRef.current = controller;
    const unreachable: WordCandidate[] = [];
    const failed: ImportJob[] = [];
    const byId = new Map(sourceList.map((s) => [s.id, s]));
    const patch = (id: string, change: (s: SourceState) => Partial<SourceState>) =>
      setSources((list) => list.map((s) => (s.id === id ? { ...s, ...change(s) } : s)));

    const queue = [...jobs];
    async function worker() {
      for (let job = queue.shift(); job; job = queue.shift()) {
        if (controller.signal.aborted) return;
        const source = byId.get(job.sourceId)!;
        patch(source.id, () => ({ status: "analysing" }));
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
            return;
          }
          if (!response.ok) throw new Error(data.error ?? "Analysis failed.");
          if (data.aiCreditsLeft !== undefined) setCredits(data.aiCreditsLeft);

          const result = data as AnalysisResult;
          const fresh: Candidate[] = [];
          let repeats = 0;
          for (const candidate of result.candidates) {
            // The same word from two files or two parts: keep the first.
            const key = `${candidate.lemma}|${candidate.dictionary?.targetCode ?? ""}`;
            if (seenRef.current.has(key)) {
              repeats += 1;
              continue;
            }
            seenRef.current.add(key);
            // A category asked for in the text itself ("put these in drama")
            // applies to this whole source from now on.
            if (!forcedRef.current[source.id] && result.requestedCategory) {
              forcedRef.current = { ...forcedRef.current, [source.id]: result.requestedCategory };
              setForced(forcedRef.current);
            }
            const forcedName = forcedRef.current[source.id];
            const id = `${job.id}:${candidate.id}`;
            fresh.push({
              ...candidate,
              id,
              sourceId: source.id,
              originalCategory: candidate.primaryCategory,
              ...(forcedName && { primaryCategory: forcedName, edited: true, lockCategory: true }),
            });
            if (candidate.status === "unreachable") unreachable.push({ ...candidate, id });
          }

          if (autoAdd) {
            const saved = await commitWords(source, fresh.filter(isAddable));
            for (const c of fresh) if (isAddable(c)) c.saved = true;
            markPartDone(source, source.jobs.indexOf(job));
            setAdded((a) => ({
              created: a.created + saved.created,
              pending: a.pending + saved.pending,
              alreadySaved: a.alreadySaved + saved.alreadySaved,
            }));
          }
          setCandidates((list) => [...list, ...fresh]);
          setMerged((n) => n + repeats);
        } catch (cause) {
          if (controller.signal.aborted) return;
          failed.push(job);
          const message = cause instanceof Error ? cause.message : "Analysis failed.";
          patch(source.id, () => ({ error: message }));
          // A daily-limit error will fail every remaining part too.
          if (/daily limit/i.test(message)) controller.abort();
        }
        patch(source.id, (s) => ({ partsDone: s.partsDone + 1 }));
      }
    }
    await Promise.all(Array.from({ length: PARALLEL_PARTS }, worker));

    setSources((list) =>
      list.map((s) => ({ ...s, status: s.partsDone >= s.jobs.length ? "done" : s.status === "waiting" ? "waiting" : "done" })),
    );
    setFailedJobs(failed);
    setRunning(false);
    stopRef.current = null;

    if (autoAdd) {
      // Words saved without the dictionary get checked in the background,
      // then English meanings and examples are filled in.
      verifyInBackground();
      fillExamples();
    } else if (unreachable.length && !controller.signal.aborted) {
      // Review mode: one automatic second try before the user looks.
      await recheck(unreachable);
    }
  }

  /**
   * Run the parts that failed (timeout, network) once more, keeping everything
   * already found.
   */
  async function retryFailed() {
    const jobs = failedJobs;
    setFailedJobs([]);
    setSources((list) =>
      list.map((s) => ({
        ...s,
        error: undefined,
        partsDone: Math.max(0, s.partsDone - jobs.filter((j) => j.sourceId === s.id).length),
      })),
    );
    await runJobs(jobs, sources);
  }

  // ---------------------------------------------------------------- save

  /** What gets added: everything ticked that has some meaning to store. */
  function isAddable(c: Candidate): boolean {
    return c.selected && !c.saved && Boolean(c.dictionary || c.aiMeaning || c.userMeaning);
  }

  /**
   * Shape a candidate the way /api/ingest/commit expects it (the ApprovedWord
   * type in lib/ingest/commit.ts).
   */
  function toApproved(c: Candidate) {
    return {
      lemma: c.lemma,
      sentence: c.sentence,
      contextNote: c.contextNote,
      register: c.register,
      primaryCategory: c.primaryCategory,
      secondaryCategories: c.secondaryCategories,
      categoriesFromAi: !c.edited,
      lockCategory: Boolean(c.lockCategory),
      dictionary: c.dictionary,
      aiMeaning: c.aiMeaning,
      userMeaning: c.userMeaning,
      useDictionaryMeaning: c.useDictionaryMeaning,
      // Not checked by the dictionary yet: verified later in the background.
      needsCheck: c.status === "unreachable",
    };
  }

  /**
   * Save one file's ticked words in batches through /api/ingest/commit and count
   * what happened: created, already saved, failed.
   */
  async function commitWords(source: ImportSource, words: Candidate[]) {
    const result = { created: 0, pending: 0, alreadySaved: 0, failed: [] as string[] };
    if (words.length === 0) return result;
    const response = await fetch("/api/ingest/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: source.kind,
        title: source.name,
        text: source.text,
        words: words.map(toApproved),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not save.");
    result.created = data.created;
    result.pending = words.filter((w) => w.status === "unreachable").length;
    result.alreadySaved = data.alreadySaved?.length ?? 0;
    result.failed = data.skipped ?? [];
    return result;
  }

  /**
   * "Save" in review mode: commit every source's ticked words, show the summary,
   * then verify and fill in examples in the background.
   */
  async function save() {
    setBusy(true);
    setError(null);
    const total: SaveSummary = { created: 0, alreadySaved: 0, failed: [] };
    try {
      for (const source of sources) {
        const saved = await commitWords(
          source,
          candidates.filter((c) => c.sourceId === source.id && isAddable(c)),
        );
        total.created += saved.created;
        total.alreadySaved += saved.alreadySaved;
        total.failed.push(...saved.failed);
      }
      setSummary(total);
      if (total.created > 0) {
        verifyInBackground();
        fillExamples();
      }
      setStage("done");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  /** "Check now" in automatic mode: verify saved words and show the preview's rows as checked. */
  async function checkSavedNow() {
    setRechecking(true);
    setVerifyNote(null);
    let confirmed = 0;
    let missing = 0;
    let remaining = 0;
    try {
      for (let round = 0; round < 10; round++) {
        const response = await fetch("/api/verify", { method: "POST" });
        if (!response.ok) break;
        const data: { confirmed: number; notInDictionary: number; remaining: number } = await response.json();
        confirmed += data.confirmed;
        missing += data.notInDictionary;
        remaining = data.remaining;
        if (data.remaining === 0 || data.confirmed + data.notInDictionary === 0) break;
      }
      // The saved words are updated in the database; mirror it in the list.
      if (confirmed + missing > 0) {
        await recheck(candidates.filter((c) => c.status === "unreachable"));
      }
      setVerifyNote(
        remaining > 0
          ? `Checked ${confirmed + missing}; the dictionary is still not answering for ${remaining} — they will be tried again later.`
          : `All checked: ${confirmed} confirmed by the dictionary, ${missing} not in it (AI meaning kept).`,
      );
    } finally {
      setRechecking(false);
    }
  }

  /** Words saved without a dictionary answer: check them, quietly. */
  async function verifyInBackground() {
    for (let round = 0; round < 30; round++) {
      try {
        const response = await fetch("/api/verify", { method: "POST" });
        if (!response.ok) return;
        const data: { confirmed: number; notInDictionary: number; remaining: number } =
          await response.json();
        if (data.remaining === 0 || data.confirmed + data.notInDictionary === 0) return;
      } catch {
        return;
      }
    }
  }

  /**
   * Apply a change from one <CandidateRow/> (ticked, category, homograph,
   * meaning choice) to the list.
   */
  function update(next: WordCandidate) {
    setCandidates((list) =>
      list.map((c) =>
        c.id !== next.id
          ? c
          : {
              ...c,
              ...next,
              // Moved by hand to another category: no longer the requested one.
              lockCategory: c.lockCategory && next.primaryCategory === c.primaryCategory,
            },
      ),
    );
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
            ? { ...c, primaryCategory: name, edited: true, lockCategory: true }
            : { ...c, primaryCategory: c.originalCategory, edited: false, lockCategory: false },
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
    // English meanings first (words saved with only the user's own meaning),
    // so examples are then written in the right sense.
    for (let round = 0; round < 20; round++) {
      try {
        const response = await fetch("/api/meanings", { method: "POST" });
        if (!response.ok) break;
        const data: { fromDictionary: number; fromAi: number; remaining: number; aiBlocked?: string } =
          await response.json();
        if (data.remaining === 0 || data.aiBlocked || data.fromDictionary + data.fromAi === 0) break;
      } catch {
        break;
      }
    }
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
    // Dictionary examples are Korean only: add English translations.
    for (let round = 0; round < 40; round++) {
      try {
        const response = await fetch("/api/translations", { method: "POST" });
        if (!response.ok) break;
        const data: { fromDictionary: number; fromAi: number; remaining: number; aiBlocked?: string } =
          await response.json();
        if (data.remaining === 0 || data.aiBlocked || data.fromDictionary + data.fromAi === 0) break;
      } catch {
        break;
      }
    }
    setExamples((current) => ({ added, done: true, note: current?.note }));
  }

  /**
   * Select all / Clear: tick or untick every word that can still be added (not
   * duplicates, not already saved).
   */
  function setAll(selected: boolean) {
    setCandidates((list) =>
      list.map((c) => (c.status !== "duplicate" && !c.saved ? { ...c, selected } : c)),
    );
  }

  /**
   * Start over: clear the input, files, results and messages, back to the input
   * stage.
   */
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
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-8 sm:px-6">
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

          <div role="radiogroup" aria-label="Categories" className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Categories</span>
            {(
              [
                ["ai", "AI sorts"],
                ["one", "All into one"],
                ["each", "I pick for each word"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={categoryMode === value}
                onClick={() => setCategoryMode(value)}
                className={`rounded-full border px-3 py-1 ${
                  categoryMode === value ? "border-celadon-deep bg-celadon-deep text-paper" : "border-line"
                }`}
              >
                {label}
              </button>
            ))}
            {categoryMode === "one" && (
              <CategorySelect
                value={oneCategory}
                options={categories}
                onChange={setOneCategory}
                placeholder="Choose a category…"
                className="min-w-48"
              />
            )}
            <span className="w-full text-xs text-muted">
              {categoryMode === "ai"
                ? "The AI puts each word in the category that fits it best. Tip: write “put these in …” above your text to choose one category for all of them."
                : categoryMode === "one"
                  ? "Every word goes into this category, and the category is locked — “Re-sort with AI” will not move them out."
                  : "You see the words first and choose each one's category (the AI's pick is filled in to start from)."}
            </span>
          </div>

          <div role="radiogroup" aria-label="When to add" className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">Then</span>
            {(
              [
                [true, "Add automatically"],
                [false, "Let me review first"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={autoAdd === value}
                onClick={() => setAutoAdd(value)}
                // Picking categories per word needs the preview.
                disabled={categoryMode === "each" && value}
                className={`rounded-full border px-3 py-1 disabled:opacity-40 ${
                  autoAdd === value ? "border-celadon-deep bg-celadon-deep text-paper" : "border-line"
                }`}
              >
                {label}
              </button>
            ))}
            <span className="w-full text-xs text-muted">
              {autoAdd
                ? "Words are saved as each part is read — stopping keeps them, and adding the same file again continues where it stopped. Words the dictionary could not check are verified later on their own."
                : "You see every word first and choose what to add."}
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
                  Read {partsDone} of {partsTotal} parts
                  {autoAdd && added.created > 0 && ` · ${added.created} words added`}
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

          {failedJobs.length > 0 && !running && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-clay-soft px-4 py-3 text-sm">
              <span className="flex-1 text-clay">
                {failedJobs.length} {failedJobs.length === 1 ? "part" : "parts"} could not be read.
              </span>
              <button
                type="button"
                onClick={retryFailed}
                className="rounded-md border border-clay px-3 py-1.5 text-clay"
              >
                <i className="bi bi-arrow-clockwise mr-1.5" aria-hidden />
                Read them again
              </button>
            </div>
          )}

          {autoAdd && !running && (added.created > 0 || added.alreadySaved > 0) && (
            <div className="mb-4 rounded-md bg-celadon-soft px-4 py-3 text-sm text-celadon-deep">
              <p className="font-medium">
                {added.created} {added.created === 1 ? "word" : "words"} added.
              </p>
              <p className="mt-0.5">
                {added.alreadySaved > 0 && `${added.alreadySaved} were already yours. `}
                {added.pending > 0 &&
                  `${added.pending} are waiting for the dictionary and will be checked automatically. `}
                {examples && !examples.done && `Adding examples… ${examples.added} so far.`}
                {examples?.done && `${examples.added} examples added.`}
              </p>
            </div>
          )}

          {autoAdd && unreachableCount > 0 && !running && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-4 py-3 text-sm">
              <span className="flex-1">
                {unreachableCount} {unreachableCount === 1 ? "word was" : "words were"} saved while the
                dictionary was not answering — with the AI meaning for now. They are checked against the
                dictionary automatically (also each time you open the app).
                {verifyNote && <span className="mt-1 block text-muted">{verifyNote}</span>}
              </span>
              <button
                type="button"
                disabled={rechecking}
                onClick={checkSavedNow}
                className="rounded-md bg-celadon-deep px-3 py-1.5 text-paper disabled:opacity-50"
              >
                <i className={`bi ${rechecking ? "bi-hourglass-split" : "bi-arrow-clockwise"} mr-1.5`} aria-hidden />
                {rechecking ? "Checking…" : "Check now"}
              </button>
            </div>
          )}

          {!autoAdd && unreachableCount > 0 && !running && (
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

          {!autoAdd && (
            <p className="mb-3 text-sm text-muted">
              <i className="bi bi-check2-square mr-1.5" aria-hidden />
              Ticked words will be added — untick anything you don&apos;t want.
            </p>
          )}

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
                `, ${count("unreachable")} waiting for the dictionary`}
              {merged > 0 && `, ${merged} repeats merged`}
            </p>
            {!autoAdd && (
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
            )}
          </div>

          <div className="flex flex-col gap-5">
            {sources.map((source) => {
              const rows = candidates.filter((c) => c.sourceId === source.id);
              const showHeader = grouped || source.error || source.suggestedCategory || forced[source.id];
              if (!showHeader && rows.length === 0) return null;
              return (
                <section key={source.id}>
                  {showHeader && (
                    <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-medium">{source.name}</span>
                      <span className="text-xs text-muted">
                        {`${source.partsDone} of ${source.jobs.length} parts read · ${rows.length} words`}
                        {source.skippedParts ? ` · ${source.skippedParts} done earlier, skipped` : ""}
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
                      {forced[source.id] && !source.suggestedCategory && (
                        <span className="ml-auto flex items-center gap-1.5 text-xs text-celadon-deep">
                          <i className="bi bi-lock" aria-hidden />
                          All words go into “{forced[source.id]}” (locked)
                        </span>
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
            {!autoAdd && (
              <div className="mx-auto mb-2 flex max-w-4xl gap-4 text-sm">
                <button type="button" onClick={() => setAll(true)} className="text-celadon-deep underline underline-offset-4">
                  Select all
                </button>
                <button type="button" onClick={() => setAll(false)} className="text-muted underline underline-offset-4">
                  Clear
                </button>
              </div>
            )}
            <div className="mx-auto flex max-w-4xl gap-3">
              <button
                type="button"
                onClick={() => {
                  stopRef.current?.abort();
                  if (autoAdd && added.created > 0) reset();
                  else setStage("input");
                }}
                className="rounded-md border border-line px-4 py-3 text-sm"
              >
                {autoAdd && !running ? "Add more" : "Back"}
              </button>
              {autoAdd ? (
                running ? (
                  <button
                    type="button"
                    onClick={() => stopRef.current?.abort()}
                    className="flex-1 rounded-md border border-line bg-surface px-4 py-3 font-medium"
                  >
                    Stop — keep what is added
                  </button>
                ) : (
                  <Link
                    href="/learn"
                    className="flex-1 rounded-md bg-celadon-deep px-4 py-3 text-center font-medium text-paper"
                  >
                    Start learning
                  </Link>
                )
              ) : (
                <button
                  type="button"
                  onClick={save}
                  disabled={busy || running || chosen === 0}
                  className="flex-1 rounded-md bg-celadon-deep px-4 py-3 font-medium text-paper disabled:opacity-50"
                >
                  {busy ? "Saving…" : running ? "Still reading…" : `Add ${chosen} to my words`}
                </button>
              )}
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
