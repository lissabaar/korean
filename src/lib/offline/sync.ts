/**
 * Apply what was done offline: answers and intro choices, oldest first, each
 * with the time it happened — FSRS then sees the real gaps, and the learning
 * streak moves exactly as it did on the phone.
 *
 * Library module (server). Called by POST /api/offline/sync.
 *
 * Every event is applied once: its id goes into the OfflineEvent table, and
 * an id seen before is skipped (a sync retried after a dropped connection).
 * A card that no longer exists (word deleted meanwhile) is skipped too.
 */

import type { PrismaClient } from "@prisma/client";
import { CardNotFoundError, submitAnswer } from "../review/submit";
import { IntroCardNotFoundError, introduceWord } from "../review/intro";
import type { OfflineEvent } from "./types";

/** Events older than this are dropped: a phone left offline for months. */
const MAX_AGE_DAYS = 60;

export interface SyncResult {
  applied: number;
  /** Already applied before, malformed, too old, or for a card that is gone. */
  skipped: number;
}

/** Apply the events in time order; see the file comment. */
export async function applyOfflineEvents(
  prisma: PrismaClient,
  userId: string,
  events: OfflineEvent[],
): Promise<SyncResult> {
  const now = Date.now();
  const valid = events
    .filter((event) => typeof event?.id === "string" && event.id.length <= 64 && typeof event.cardId === "string")
    // A phone clock ahead of the server's is clamped to now.
    .map((event) => ({ event, at: Math.min(Date.parse(event.at), now) }))
    .filter(({ at }) => Number.isFinite(at) && at > now - MAX_AGE_DAYS * 24 * 60 * 60 * 1000)
    .sort((a, b) => a.at - b.at);

  const seen = new Set(
    (
      await prisma.offlineEvent.findMany({
        where: { id: { in: valid.map(({ event }) => event.id) } },
        select: { id: true },
      })
    ).map((row) => row.id),
  );

  let applied = 0;
  let skipped = events.length - valid.length;
  for (const { event, at } of valid) {
    if (seen.has(event.id)) {
      skipped += 1;
      continue;
    }
    try {
      if (event.kind === "answer") {
        await submitAnswer(
          prisma,
          userId,
          { cardId: event.cardId, answer: event.answer, knewIt: event.knewIt, usedHint: event.usedHint === true },
          { now: new Date(at) },
        );
      } else {
        await introduceWord(prisma, userId, {
          cardId: event.cardId,
          action: event.action,
          at: new Date(at),
          noReplacement: true,
        });
      }
      applied += 1;
    } catch (error) {
      if (!(error instanceof CardNotFoundError) && !(error instanceof IntroCardNotFoundError)) throw error;
      skipped += 1;
    }
    // Remembered even when skipped: retrying it would not help.
    seen.add(event.id);
    await prisma.offlineEvent.create({ data: { id: event.id, userId } });
  }
  return { applied, skipped };
}
