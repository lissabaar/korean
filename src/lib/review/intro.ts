/**
 * Meeting a new word. Before the first drill the word is shown whole —
 * meaning, definition, example — and the user starts learning it, skips it
 * for a few days, or says they already know it. All act on the sense, so both
 * directions of a word go together.
 */

import type { PrismaClient } from "@prisma/client";
import { buildSession, type ReviewItem } from "./queue";

/** How long "Skip" keeps a word out of new-word sessions. */
export const SKIP_DAYS = 3;

/**
 * "I know it": the word skips the drill and goes straight to spaced review,
 * first asked after this many days — a quick check that it really is known
 * (a miss there brings it back sooner, as with any review).
 */
export const KNOWN_FIRST_REVIEW_DAYS = 3;

export type IntroAction = "start" | "skip" | "known";

export class IntroCardNotFoundError extends Error {}

/**
 * "start": mark the word's cards as met. "skip": snooze them for SKIP_DAYS.
 * "known": move them to review (SCHEDULED, first due in
 * KNOWN_FIRST_REVIEW_DAYS) — no drill, and no ReviewLog either (nothing was
 * answered). Skip and known return replacement cards for the session.
 */
export async function introduceWord(
  prisma: PrismaClient,
  userId: string,
  input: {
    cardId: string;
    action: IntroAction;
    sessionSenseIds?: string[];
    /** When it happened — an offline action synced later keeps its time. */
    at?: Date;
    /** No replacement cards (the offline sync has no session to fill). */
    noReplacement?: boolean;
  },
): Promise<{ replacement: ReviewItem[] }> {
  const card = await prisma.card.findFirst({
    where: { id: input.cardId, userId, phase: "LEARNING" },
    select: { senseId: true },
  });
  if (!card) throw new IntroCardNotFoundError(`No learning card ${input.cardId}`);

  const now = input.at ?? new Date();
  if (input.action === "start") {
    await prisma.card.updateMany({
      where: { userId, senseId: card.senseId, introducedAt: null },
      data: { introducedAt: now },
    });
    return { replacement: [] };
  }

  // Counted first: "known" moves them out of LEARNING.
  const removed = await prisma.card.count({
    where: { userId, senseId: card.senseId, phase: "LEARNING" },
  });
  const day = 24 * 60 * 60 * 1000;
  if (input.action === "known") {
    await prisma.card.updateMany({
      where: { userId, senseId: card.senseId, phase: "LEARNING" },
      data: {
        phase: "SCHEDULED",
        introducedAt: now,
        graduatedAt: now,
        snoozedUntil: null,
        due: new Date(now.getTime() + KNOWN_FIRST_REVIEW_DAYS * day),
      },
    });
  } else {
    await prisma.card.updateMany({
      where: { userId, senseId: card.senseId, phase: "LEARNING" },
      data: { snoozedUntil: new Date(now.getTime() + SKIP_DAYS * day) },
    });
  }
  if (input.noReplacement) return { replacement: [] };
  // Keep the session the size it was: bring in the next new word instead.
  const replacement = await buildSession(prisma, userId, "learn", {
    excludeSenseIds: [...new Set([...(input.sessionSenseIds ?? []), card.senseId])],
    newLimit: Math.max(1, removed),
  });
  return { replacement };
}
