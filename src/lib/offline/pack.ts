/**
 * The offline pack: what a phone keeps to study without a connection —
 * reviews due in the next OFFLINE_DAYS and a supply of new words, each as a
 * ready ReviewItem (exercise, options, both sides of the card).
 *
 * Library module (server: reads the database). Called by
 * GET /api/offline/pack. Built with the same buildSession() as online
 * sessions, only looking further ahead, so an offline card is exactly the
 * card the app would have shown.
 */

import type { PrismaClient } from "@prisma/client";
import { buildSession } from "../review/queue";
import type { OfflinePack } from "./types";

/** How far ahead reviews are packed — a month covers a long trip. */
export const OFFLINE_DAYS = 30;
/**
 * Caps: every word not started yet goes in (owner: "all of them", ~1 KB a
 * card, kept in IndexedDB); the caps only guard against a runaway pack.
 */
const MAX_REVIEWS = 3000;
const NEW_WORDS = 5000;

/** Everything the phone needs for offline sessions, for this user. */
export async function buildOfflinePack(prisma: PrismaClient, userId: string): Promise<OfflinePack> {
  const until = new Date(Date.now() + OFFLINE_DAYS * 24 * 60 * 60 * 1000);
  const [user, review, learn] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { newPerSession: true, acceptTypos: true, autoPlayAudio: true, myMeaningFirst: true, cardTextSize: true },
    }),
    buildSession(prisma, userId, "review", { dueUntil: until, reviewLimit: MAX_REVIEWS }),
    buildSession(prisma, userId, "learn", { newLimit: NEW_WORDS }),
  ]);
  return {
    userId,
    createdAt: new Date().toISOString(),
    review,
    learn,
    newPerSession: user.newPerSession,
    acceptTypos: user.acceptTypos,
    autoPlay: user.autoPlayAudio,
    myMeaningFirst: user.myMeaningFirst,
    textSize: user.cardTextSize,
  };
}
