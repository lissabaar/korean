/**
 * The offline pack and the queue of offline answers, kept in this browser,
 * per account.
 *
 * Browser-only library: called by <OfflineSync/> (fills the pack, sends the
 * queue) and Review.tsx (studies from the pack when there is no connection,
 * queues what was done). See types.ts for the whole picture.
 *
 * Where things live:
 *   - the pack in IndexedDB — it holds every word not started yet (≈1 KB per
 *     card; 2 000 words ≈ 4 MB), more than localStorage's ~5 MB limit allows
 *     safely, Safari's especially;
 *   - the queue and the current account in localStorage — small, and
 *     readable synchronously.
 * Every access is wrapped: storage can be full or blocked (private mode), and
 * then offline study simply is not available — online study never depends on
 * any of this.
 */

import type { ReviewItem, StudyMode } from "../review/queue";
import { typedFromStreak } from "../review/steps";
import type { OfflineEvent, OfflinePack } from "./types";

const QUEUE_KEY = (userId: string) => `hangugo:offline-queue:${userId}`;
/** The signed-in (or anonymous) account, set by <OfflineSync/> on every page. */
const USER_KEY = "hangugo:offline-user";
const DB_NAME = "hangugo-offline";
const STORE = "packs";

// ---------------------------------------------------------------- IndexedDB

/** Open (and on first use create) the database with one key-value store. */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Read one value by key; null when missing or IndexedDB is unavailable. */
async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

/** Write one value; false when IndexedDB is unavailable or full. */
async function idbSet(key: string, value: unknown): Promise<boolean> {
  try {
    const db = await openDb();
    return await new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(value, key);
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- localStorage

/** Read and parse a key; null when missing, unreadable or blocked. */
function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Write a value; false when storage is full or blocked. */
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** The account this browser is studying as (null before the first online visit). */
export function currentOfflineUser(): string | null {
  try {
    return localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

export function setCurrentOfflineUser(userId: string): void {
  try {
    localStorage.setItem(USER_KEY, userId);
  } catch {
    // Storage blocked: no offline mode in this browser.
  }
}

// ---------------------------------------------------------------- the pack

/** The current account's pack, or null. */
export async function loadPack(userId = currentOfflineUser()): Promise<OfflinePack | null> {
  if (!userId) return null;
  const pack = await idbGet<OfflinePack>(userId);
  return pack && pack.userId === userId ? pack : null;
}

export function savePack(pack: OfflinePack): Promise<boolean> {
  return idbSet(pack.userId, pack);
}

/**
 * Change the current pack. Changes run one after another, so two quick
 * answers cannot overwrite each other's update.
 */
let pending: Promise<unknown> = Promise.resolve();
function updatePack(change: (pack: OfflinePack) => void): Promise<void> {
  const next = pending.then(async () => {
    const pack = await loadPack();
    if (!pack) return;
    change(pack);
    await savePack(pack);
  });
  pending = next.catch(() => undefined);
  return next;
}

/**
 * A card is done for the pack (reviewed, graduated, skipped): it leaves both
 * lists, so an offline session does not ask it again before the next pack.
 */
export function forgetCard(cardId: string): Promise<void> {
  return updatePack((pack) => {
    pack.review = pack.review.filter((item) => item.cardId !== cardId);
    pack.learn = pack.learn.filter((item) => item.cardId !== cardId);
  });
}

/**
 * A learning card moved on (offline or online): keep its new streak in the
 * pack, with the exercise that streak calls for (mirrors pickExercise).
 */
export function updateLearning(item: ReviewItem, learningStreak: number): Promise<void> {
  const typed = learningStreak >= typedFromStreak(item.learningGoal);
  return updatePack((pack) => {
    pack.learn = pack.learn.map((card) =>
      card.cardId === item.cardId
        ? {
            ...card,
            intro: false,
            learningStreak,
            exercise: typed ? "TYPING" : "CHOICE",
            hint: typed ? ([...card.back.lemma][0] ?? null) : null,
            selfGraded: typed ? false : card.choices === null,
          }
        : card,
    );
  });
}

/** "Start learning" on a word: its cards are met now (no intro offline either). */
export function markIntroduced(senseId: string): Promise<void> {
  return updatePack((pack) => {
    pack.learn = pack.learn.map((card) => (card.senseId === senseId ? { ...card, intro: false } : card));
  });
}

/** Shuffled copy (Fisher–Yates): new words come in random order, as online. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Cards for an offline session in this mode, and the pack's settings — null
 * when there is no pack. Reviews: those due by now. New words: the user's
 * usual number per session, words already started first, the rest at random
 * (as online).
 */
export async function offlineSession(mode: StudyMode): Promise<{ items: ReviewItem[]; pack: OfflinePack } | null> {
  const pack = await loadPack();
  if (!pack) return null;
  const now = Date.now();
  const review = mode === "learn" || mode === "mastered" ? [] : pack.review.filter((item) => Date.parse(item.due) <= now);
  let learn: ReviewItem[] = [];
  if (mode === "learn" || mode === "all") {
    const senses = [...new Set(pack.learn.map((item) => item.senseId))];
    const started = senses.filter((id) => pack.learn.some((item) => item.senseId === id && !item.intro));
    const order = [...started, ...shuffled(senses.filter((id) => !started.includes(id)))].slice(0, pack.newPerSession);
    learn = pack.learn.filter((item) => order.includes(item.senseId));
  }
  return { items: [...review, ...learn], pack };
}

// ---------------------------------------------------------------- the queue

/** Answers and intro choices waiting to be sent. */
export function queuedEvents(userId = currentOfflineUser()): OfflineEvent[] {
  return userId ? (read<OfflineEvent[]>(QUEUE_KEY(userId)) ?? []) : [];
}

type NewEvent =
  | Omit<Extract<OfflineEvent, { kind: "answer" }>, "id" | "at">
  | Omit<Extract<OfflineEvent, { kind: "intro" }>, "id" | "at">;

/** Queue one offline event; it gets a random id (applied once) and the time now. */
export function enqueue(event: NewEvent): void {
  const userId = currentOfflineUser();
  if (!userId) return;
  const full = { ...event, id: crypto.randomUUID(), at: new Date().toISOString() } as OfflineEvent;
  write(QUEUE_KEY(userId), [...queuedEvents(userId), full]);
}

/** Remove events the server has taken. */
export function dropEvents(userId: string, ids: string[]): void {
  const gone = new Set(ids);
  write(QUEUE_KEY(userId), queuedEvents(userId).filter((event) => !gone.has(event.id)));
}

/** Whether a failed fetch means "no connection" (rather than a server error). */
export function isOfflineError(error: unknown): boolean {
  return (typeof navigator !== "undefined" && !navigator.onLine) || error instanceof TypeError;
}
