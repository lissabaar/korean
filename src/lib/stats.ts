/**
 * Numbers for the /stats page: where the user's words are now, and what
 * happened on each of the last days.
 *
 * Library module (server only: reads the database). Called by
 * GET /api/stats. Words are counted by their English → Korean (RECALL) card,
 * which every word has — one word, one count; the Korean → English card is
 * optional and would count words twice. Reviews count every review answer
 * (both directions): that is the work done.
 *
 * Days are the user's local days: the browser sends its UTC offset, since
 * the server runs in UTC and a day boundary three hours off would put an
 * evening session into "tomorrow".
 */

import type { PrismaClient } from "@prisma/client";

/** Days shown in the per-day table, today included. */
export const STATS_DAYS = 14;

export interface WordTotals {
  /** Every saved word. */
  words: number;
  /** Not met yet (LEARNING, never introduced). */
  notStarted: number;
  /** Being learned now (LEARNING, introduced). */
  learning: number;
  /** Learned, in spaced review (SCHEDULED). */
  inReview: number;
  /** Learned for good, out of review (MASTERED). */
  mastered: number;
}

export interface DayStats {
  /** Local date, YYYY-MM-DD. */
  date: string;
  /** Words met for the first time ("Start learning" or a first answer). */
  started: number;
  /** Words that finished learning and moved to review. */
  learned: number;
  /** Review answers given, and how many of them were right. */
  reviews: number;
  reviewsRight: number;
  /** Words that became mastered. */
  mastered: number;
}

export interface StatsResult {
  totals: WordTotals;
  days: DayStats[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `tzOffsetMinutes` is JavaScript's getTimezoneOffset() from the browser:
 * minutes to ADD to local time to get UTC (São Paulo: 180).
 */
export async function getStats(prisma: PrismaClient, userId: string, tzOffsetMinutes: number): Promise<StatsResult> {
  const offset = Math.max(-14 * 60, Math.min(14 * 60, Math.round(tzOffsetMinutes))) * 60 * 1000;
  /** The local calendar date of an instant, as YYYY-MM-DD. */
  const localDay = (date: Date) => new Date(date.getTime() - offset).toISOString().slice(0, 10);

  const today = localDay(new Date());
  const days = Array.from({ length: STATS_DAYS }, (_, i) => {
    const date = new Date(Date.parse(today) - (STATS_DAYS - 1 - i) * DAY_MS).toISOString().slice(0, 10);
    return { date, started: 0, learned: 0, reviews: 0, reviewsRight: 0, mastered: 0 };
  });
  const byDate = new Map(days.map((day) => [day.date, day]));
  // Start of the first shown local day, as an instant.
  const since = new Date(Date.parse(days[0].date) + offset);

  const recall = { userId, direction: "RECALL" as const };
  const [words, notStarted, learning, inReview, mastered, events, reviews] = await Promise.all([
    prisma.entry.count({ where: { userId } }),
    prisma.card.count({ where: { ...recall, phase: "LEARNING", introducedAt: null } }),
    prisma.card.count({ where: { ...recall, phase: "LEARNING", introducedAt: { not: null } } }),
    prisma.card.count({ where: { ...recall, phase: "SCHEDULED" } }),
    prisma.card.count({ where: { ...recall, phase: "MASTERED" } }),
    prisma.card.findMany({
      where: {
        ...recall,
        OR: [{ introducedAt: { gte: since } }, { graduatedAt: { gte: since } }, { masteredAt: { gte: since } }],
      },
      select: { introducedAt: true, graduatedAt: true, masteredAt: true },
    }),
    prisma.reviewLog.findMany({
      where: { card: { userId }, reviewedAt: { gte: since } },
      select: { reviewedAt: true, rating: true },
    }),
  ]);

  for (const card of events) {
    if (card.introducedAt && card.introducedAt >= since) {
      const day = byDate.get(localDay(card.introducedAt));
      if (day) day.started += 1;
    }
    if (card.graduatedAt && card.graduatedAt >= since) {
      const day = byDate.get(localDay(card.graduatedAt));
      if (day) day.learned += 1;
    }
    if (card.masteredAt && card.masteredAt >= since) {
      const day = byDate.get(localDay(card.masteredAt));
      if (day) day.mastered += 1;
    }
  }
  for (const log of reviews) {
    const day = byDate.get(localDay(log.reviewedAt));
    if (!day) continue;
    day.reviews += 1;
    // AGAIN is the only "did not remember" rating (submit.ts).
    if (log.rating !== "AGAIN") day.reviewsRight += 1;
  }

  return { totals: { words, notStarted, learning, inReview, mastered }, days: days.reverse() };
}
