/**
 * The two directions of one word (sense): RECALL (English → Korean, always
 * asked) and RECOGNITION (Korean → English, asked only with
 * User.askRecognition). Each is its own card with its own progress.
 *
 * Library module. Problem it solves: turning "Also ask the other way" on
 * made every already-learned word come up as a new word again — its
 * RECOGNITION card had never left LEARNING, so it got the intro and the whole
 * drill. Recognising a word you can already produce is the easier task, so
 * once RECALL has graduated, RECOGNITION goes straight to spaced review
 * (due when the RECALL card is) — checked there, not drilled again.
 *
 * Called by submit.ts when a RECALL card graduates (that one word) and by
 * PATCH /api/settings when askRecognition is switched on (every word).
 * Never the other way round: knowing Korean → English does not mean you can
 * produce the word.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Move RECOGNITION cards still in LEARNING to review wherever the same
 * sense's RECALL card is already SCHEDULED. One sense, or all of the user's.
 * Returns how many cards moved. No ReviewLog: nothing was answered.
 */
export async function promoteRecognitionOfLearned(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: string,
  senseId?: string,
): Promise<number> {
  // One UPDATE … FROM: the due date comes from the sibling row, and a user
  // switching the setting on may have a thousand such cards.
  return prisma.$executeRaw`
    UPDATE "Card" AS r
    SET "phase" = 'SCHEDULED',
        "introducedAt" = COALESCE(r."introducedAt", now()),
        "graduatedAt" = now(),
        "snoozedUntil" = NULL,
        "due" = c."due"
    FROM "Card" AS c
    WHERE r."userId" = ${userId}
      AND r."direction" = 'RECOGNITION'
      AND r."phase" = 'LEARNING'
      AND c."senseId" = r."senseId"
      AND c."userId" = r."userId"
      AND c."direction" = 'RECALL'
      AND c."phase" = 'SCHEDULED'
      AND (${senseId ?? null}::text IS NULL OR r."senseId" = ${senseId ?? null})
  `;
}
