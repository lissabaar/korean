/**
 * The offline pack and the queue of offline answers, kept in this browser
 * (localStorage), per account.
 *
 * Browser-only library: called by <OfflineSync/> (fills the pack, sends the
 * queue) and Review.tsx (studies from the pack when there is no connection,
 * queues what was done). See types.ts for the whole picture.
 *
 * Every access is wrapped: storage can be full or blocked (private mode), and
 * then offline study simply is not available — online study never depends on
 * any of this.
 */

import type { ReviewItem, StudyMode } from "../review/queue";
import { typedFromStreak } from "../review/steps";
import type { OfflineEvent, OfflinePack } from "./types";

const PACK_KEY = (userId: string) => `hangugo:offline-pack:${userId}`;
const QUEUE_KEY = (userId: string) => `hangugo:offline-queue:${userId}`;
/** The signed-in (or anonymous) account, set by <OfflineSync/> on every page. */
const USER_KEY = "hangugo:offline-user";

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

/** The current account's pack, or null. */
export function loadPack(userId = currentOfflineUser()): OfflinePack | null {
  if (!userId) return null;
  const pack = read<OfflinePack>(PACK_KEY(userId));
  return pack && pack.userId === userId ? pack : null;
}

export function savePack(pack: OfflinePack): boolean {
  return write(PACK_KEY(pack.userId), pack);
}

/** Change the current pack in place (no pack: nothing to do). */
function updatePack(change: (pack: OfflinePack) => void): void {
  const pack = loadPack();
  if (!pack) return;
  change(pack);
  savePack(pack);
}

/** Answers and intro choices waiting to be sent. */
export function queuedEvents(userId = currentOfflineUser()): OfflineEvent[] {
  return userId ? (read<OfflineEvent[]>(QUEUE_KEY(userId)) ?? []) : [];
}

/** Queue one offline event; it gets a random id (applied once) and the time now. */
export function enqueue(event: Omit<Extract<OfflineEvent, { kind: "answer" }>, "id" | "at"> | Omit<Extract<OfflineEvent, { kind: "intro" }>, "id" | "at">): void {
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

/**
 * A card is done for the pack (reviewed, graduated, skipped): it leaves both
 * lists, so an offline session does not ask it again before the next pack.
 */
export function forgetCard(cardId: string): void {
  updatePack((pack) => {
    pack.review = pack.review.filter((item) => item.cardId !== cardId);
    pack.learn = pack.learn.filter((item) => item.cardId !== cardId);
  });
}

/**
 * A learning card moved on (offline or online): keep its new streak in the
 * pack, with the exercise that streak calls for (mirrors pickExercise).
 */
export function updateLearning(item: ReviewItem, learningStreak: number): void {
  const typed = learningStreak >= typedFromStreak(item.learningGoal);
  updatePack((pack) => {
    pack.learn = pack.learn.map((card) =>
      card.cardId === item.cardId
        ? {
            ...card,
            intro: false,
            learningStreak,
            exercise: typed ? "TYPING" : "CHOICE",
            hint: typed ? [...card.back.lemma][0] ?? null : null,
            selfGraded: typed ? false : card.choices === null,
          }
        : card,
    );
  });
}

/** "Start learning" on a word: its cards are met now (no intro offline either). */
export function markIntroduced(senseId: string): void {
  updatePack((pack) => {
    pack.learn = pack.learn.map((card) => (card.senseId === senseId ? { ...card, intro: false } : card));
  });
}

/**
 * Cards for an offline session in this mode — null when there is no pack.
 * Reviews: those due by now. New words: the user's usual number, words
 * already started first (as online).
 */
export function offlineSession(mode: StudyMode): ReviewItem[] | null {
  const pack = loadPack();
  if (!pack) return null;
  const now = Date.now();
  const review = mode === "learn" || mode === "mastered" ? [] : pack.review.filter((item) => Date.parse(item.due) <= now);
  let learn: ReviewItem[] = [];
  if (mode === "learn" || mode === "all") {
    const senses = [...new Set(pack.learn.map((item) => item.senseId))];
    const started = senses.filter((id) => pack.learn.some((item) => item.senseId === id && !item.intro));
    const order = [...started, ...senses.filter((id) => !started.includes(id))].slice(0, pack.newPerSession);
    learn = pack.learn.filter((item) => order.includes(item.senseId));
  }
  return [...review, ...learn];
}

/** Whether a failed fetch means "no connection" (rather than a server error). */
export function isOfflineError(error: unknown): boolean {
  return (typeof navigator !== "undefined" && !navigator.onLine) || error instanceof TypeError;
}
