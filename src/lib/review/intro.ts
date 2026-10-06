/**
 * Meeting a new word. Before the first drill the word is shown whole —
 * meaning, definition, example — and the user either starts learning it or
 * skips it for a few days. Both act on the sense, so both directions of a
 * word are introduced (or skipped) together.
 */

import type { PrismaClient } from "@prisma/client";
import { buildSession, type ReviewItem } from "./queue";

/** How long "Skip" keeps a word out of new-word sessions. */
export const SKIP_DAYS = 3;

export type IntroAction = "start" | "skip";

export class IntroCardNotFoundError extends Error {}

/**
 * "start": mark the word's cards as met. "skip": snooze them for SKIP_DAYS and
 * return replacement cards for the session.
 */
export async function introduceWord(
  prisma: PrismaClient,
  userId: string,
  input: { cardId: string; action: IntroAction; sessionSenseIds?: string[] },
): Promise<{ replacement: ReviewItem[] }> {
  const card = await prisma.card.findFirst({
    where: { id: input.cardId, userId, phase: "LEARNING" },
    select: { senseId: true },
  });
  if (!card) throw new IntroCardNotFoundError(`No learning card ${input.cardId}`);

  const now = new Date();
  if (input.action === "start") {
    await prisma.card.updateMany({
      where: { userId, senseId: card.senseId, introducedAt: null },
      data: { introducedAt: now },
    });
    return { replacement: [] };
  }

  await prisma.card.updateMany({
    where: { userId, senseId: card.senseId, phase: "LEARNING" },
    data: { snoozedUntil: new Date(now.getTime() + SKIP_DAYS * 24 * 60 * 60 * 1000) },
  });
  // Keep the session the size it was: bring in the next new word instead.
  const removed = await prisma.card.count({
    where: { userId, senseId: card.senseId, phase: "LEARNING" },
  });
  const replacement = await buildSession(prisma, userId, "learn", {
    excludeSenseIds: [...new Set([...(input.sessionSenseIds ?? []), card.senseId])],
    newLimit: Math.max(1, removed),
  });
  return { replacement };
}
