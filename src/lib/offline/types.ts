/**
 * Shapes shared by the offline mode's server and browser sides.
 *
 * Library module with no runtime code (types only), so both the server
 * (pack.ts, sync.ts) and the browser (store.ts, Review.tsx) import it.
 *
 * Offline mode in short: while online, the browser keeps an OfflinePack —
 * reviews due in the coming days and every word not started yet — in
 * IndexedDB.
 * Without a connection, Review.tsx studies from it, grades answers in the
 * browser (grade.ts) and queues them as OfflineEvents; once online again the
 * queue goes to POST /api/offline/sync, which applies each event with its
 * own time, and a fresh pack is fetched.
 */

import type { ReviewItem } from "../review/queue";

export interface OfflinePack {
  /** Whose cards these are: a pack from another account is thrown away. */
  userId: string;
  /** When the pack was built (ISO). */
  createdAt: string;
  /** Reviews due within OFFLINE_DAYS — each shown once its due time comes. */
  review: ReviewItem[];
  /** Every word not started yet (and ones in progress), for learning sessions. */
  learn: ReviewItem[];
  /** New words per learning session (User.newPerSession). */
  newPerSession: number;
  /** Typed answers: one-letter typos forgiven (User.acceptTypos). */
  acceptTypos: boolean;
  /** The card settings an online session gets from /api/review/session. */
  autoPlay: boolean;
  myMeaningFirst: boolean;
  textSize: number;
}

/** One thing done offline, applied by the server on sync. */
export type OfflineEvent =
  | {
      /** Random id: a retried sync must not apply it twice (OfflineEvent table). */
      id: string;
      kind: "answer";
      cardId: string;
      /** When it was answered (ISO). */
      at: string;
      answer?: string;
      knewIt?: boolean;
      usedHint?: boolean;
    }
  | {
      id: string;
      kind: "intro";
      cardId: string;
      at: string;
      action: "start" | "skip" | "known";
    };
