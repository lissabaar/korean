/**
 * A ready-made deck offered to anyone whose word list is empty, so the app
 * can be tried without AI, without an account and without typing.
 *
 * DRAFT CONTENT — a placeholder to exercise the mechanism. Replace it with
 * the real starter deck (checked against the dictionary) before relying on
 * it. Stored with source AI because these entries were written by the
 * assistant, not taken from KRDict.
 */

import type { PrismaClient } from "@prisma/client";
import { createManualWord, DuplicateWordError, type ManualWordInput } from "./manual";

export const STARTER_DECK: ManualWordInput[] = [
  { lemma: "물", translation: "water", category: "food and drink" },
  { lemma: "밥", translation: "rice; meal", category: "food and drink" },
  { lemma: "먹다", translation: "to eat", category: "food and drink" },
  { lemma: "사람", translation: "person", category: "people and family" },
  { lemma: "친구", translation: "friend", category: "people and family" },
  { lemma: "집", translation: "house; home", category: "home and household" },
  { lemma: "학교", translation: "school", category: "work and study" },
  { lemma: "가다", translation: "to go", category: "actions and movement" },
  { lemma: "오늘", translation: "today", category: "time and dates" },
  { lemma: "좋다", translation: "to be good", category: "qualities and descriptions" },
];

/** Adds every starter word the user does not have yet. Returns how many. */
export async function addStarterDeck(prisma: PrismaClient, userId: string): Promise<number> {
  let added = 0;
  for (const word of STARTER_DECK) {
    try {
      await createManualWord(prisma, userId, word, "AI");
      added += 1;
    } catch (error) {
      if (!(error instanceof DuplicateWordError)) throw error;
    }
  }
  return added;
}
