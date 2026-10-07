/**
 * Which meanings (senses) of a word the user studies.
 *
 * One card tests one thing: every studied sense has its own cards (English →
 * Korean and back) with their own progress. By default a word has one
 * studied sense — the one picked when it was added. The word editor lists
 * every sense the dictionary has for the word and lets the user tick more
 * ("learn both 'let go' and 'put; place'") or untick one.
 *
 * Senses saved with the word are listed from the database. Words checked in
 * the background (words/verify.ts) were saved with one sense only, so the
 * rest of the dictionary's senses come from the shared dictionary cache and
 * are created as Sense rows when first ticked.
 */

import type { PrismaClient } from "@prisma/client";
import { cachedLookup } from "../dictionary/cached";
import type { DictEntry, DictionaryKeys } from "../dictionary/krdict";
import { EditError } from "./edit";

export interface SenseOption {
  /** "s:<senseId>" for a saved sense, "d:<index>" for a dictionary-only one. */
  key: string;
  translation: string | null;
  definition: string | null;
  /** Has cards, i.e. is being studied. */
  studied: boolean;
}

/** The word's dictionary entry from the shared cache/KRDict; null when unavailable. */
async function dictionaryEntry(
  prisma: PrismaClient,
  keys: DictionaryKeys,
  lemma: string,
  targetCode: string | null,
): Promise<DictEntry | null> {
  if (!targetCode) return null;
  try {
    const entries = await cachedLookup(prisma, lemma, keys);
    return entries.find((entry) => entry.targetCode === targetCode) ?? null;
  } catch {
    // Dictionary not answering: the saved senses are still listed.
    return null;
  }
}

/** Same sense? The Korean definition identifies it; the translation is the fallback. */
const sameSense = (
  saved: { definitionTarget: string | null; translation: string | null },
  dict: DictEntry["senses"][number],
) =>
  saved.definitionTarget
    ? saved.definitionTarget === dict.definition
    : Boolean(saved.translation) && saved.translation === (dict.translation ?? null);

async function loadWord(prisma: PrismaClient, userId: string, entryId: string) {
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, userId },
    select: {
      id: true,
      lemma: true,
      krdictTargetCode: true,
      senses: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          translation: true,
          definitionTarget: true,
          _count: { select: { cards: true } },
        },
      },
    },
  });
  if (!entry) throw new EditError("No such word.", 404);
  return entry;
}

/** Every sense of the word — saved ones first, then the dictionary's others. */
export async function listSenses(
  prisma: PrismaClient,
  keys: DictionaryKeys,
  userId: string,
  entryId: string,
): Promise<SenseOption[]> {
  const entry = await loadWord(prisma, userId, entryId);
  const options: SenseOption[] = entry.senses.map((sense) => ({
    key: `s:${sense.id}`,
    translation: sense.translation,
    definition: sense.definitionTarget,
    studied: sense._count.cards > 0,
  }));
  const dict = await dictionaryEntry(prisma, keys, entry.lemma, entry.krdictTargetCode);
  dict?.senses.forEach((sense, index) => {
    if (entry.senses.some((saved) => sameSense(saved, sense))) return;
    options.push({
      key: `d:${index}`,
      translation: sense.translation ?? null,
      definition: sense.definition || null,
      studied: false,
    });
  });
  return options;
}

/**
 * Study exactly these senses: cards are created for newly ticked ones
 * (dictionary-only senses become Sense rows first) and deleted — with their
 * progress — for unticked ones. At least one sense must stay. Returns the
 * ids of the studied senses.
 */
export async function setStudiedSenses(
  prisma: PrismaClient,
  keys: DictionaryKeys,
  userId: string,
  entryId: string,
  wanted: string[],
): Promise<string[]> {
  if (wanted.length === 0) throw new EditError("Keep at least one meaning to learn.", 400);
  const entry = await loadWord(prisma, userId, entryId);
  const needDictionary = wanted.some((key) => key.startsWith("d:"));
  const dict = needDictionary
    ? await dictionaryEntry(prisma, keys, entry.lemma, entry.krdictTargetCode)
    : null;
  if (needDictionary && !dict) {
    throw new EditError("The dictionary is not answering — try again in a minute.", 503);
  }

  return prisma.$transaction(
    async (tx) => {
      let nextOrder = Math.max(-1, ...entry.senses.map((s) => s.order)) + 1;
      const studied: string[] = [];
      for (const key of new Set(wanted)) {
        if (key.startsWith("s:")) {
          const id = key.slice(2);
          if (entry.senses.some((s) => s.id === id)) studied.push(id);
        } else if (key.startsWith("d:")) {
          const sense = dict?.senses[Number(key.slice(2))];
          if (!sense) continue;
          const created = await tx.sense.create({
            data: {
              entryId: entry.id,
              order: nextOrder++,
              translation: sense.translation ?? null,
              definitionTarget: sense.definition || null,
              definitionKnown: sense.translatedDefinition ?? null,
              definitionSource: "KRDICT",
              examples: { create: sense.examples.slice(0, 3).map((text) => ({ text, source: "KRDICT" as const })) },
            },
            select: { id: true },
          });
          studied.push(created.id);
        }
      }
      if (studied.length === 0) throw new EditError("Keep at least one meaning to learn.", 400);

      // Unticked: their cards go (with the progress — the UI warns).
      await tx.card.deleteMany({
        where: { userId, sense: { entryId: entry.id }, senseId: { notIn: studied } },
      });
      // Ticked: both directions, like a newly added word. Existing cards stay.
      await tx.card.createMany({
        data: studied.flatMap((senseId) => [
          { userId, senseId, direction: "RECOGNITION" as const },
          { userId, senseId, direction: "RECALL" as const },
        ]),
        skipDuplicates: true,
      });
      return studied;
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}
