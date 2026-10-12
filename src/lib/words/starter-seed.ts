/**
 * Adds the ready-made categories (starter-categories.ts) to an account:
 * every word looked up in the local KRDict table, saved like an imported
 * word (dictionary data, examples, both study cards), put into its starter
 * category. Categories are created locked, so "Re-sort with AI" leaves the
 * words where they are.
 *
 * Library module. Called by POST /api/starter-categories, which
 * <StarterSeed/> in the app layout calls for an account with no words yet (a
 * new or anonymous user); the owner's existing account was seeded once with
 * the same function from a script.
 *
 * Never removes or overwrites anything:
 *   - a category with the same name is reused (the owner's empty "colors",
 *     "action verbs" ... get filled);
 *   - a word the user already has (same dictionary entry) is only linked to
 *     the starter category — no second copy, its progress untouched;
 *   - such a word leaves "uncategorised" (it has a category now).
 * So running it again is safe. Everything is written in one transaction
 * with a handful of bulk inserts (~350 words): saving word by word took
 * seconds per word against the database in São Paulo.
 */

import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { DictEntry } from "../dictionary/krdict";
import { localLookupMany } from "../dictionary/local";
import { rankHomographs } from "../ingest/analyze";
import { UNCATEGORISED } from "./edit";
import { STARTER_CATEGORIES, type StarterCategory, type StarterWord } from "./starter-categories";

/**
 * The dictionary entry for one starter word, its meant sense first — or null
 * when KRDict does not have it (then it is saved with the gloss as an AI
 * meaning, like an imported phrase). A pinned code wins; otherwise the
 * category's part of speech is preferred, and the gloss ranks the rest.
 */
export function resolveStarterWord(
  entries: DictEntry[],
  word: StarterWord,
  category: StarterCategory,
): DictEntry | null {
  const pinned = word.code ? entries.filter((entry) => entry.targetCode === word.code) : [];
  const preferred = category.partOfSpeech
    ? entries.filter((entry) => entry.partOfSpeech === category.partOfSpeech)
    : [];
  const pool = pinned.length ? pinned : preferred.length ? preferred : entries;
  return rankHomographs(pool, word.gloss, "")[0] ?? null;
}

/**
 * KRDict's English for a starter word, unless it is only a romanisation of
 * the Korean ("gae" for 개, "nyeon" for 년 — what it gives for counters):
 * a single plain word sharing nothing with the gloss. Then the gloss (written
 * for the starter list) is the meaning.
 */
function starterTranslation(translation: string | undefined, gloss: string): string {
  if (!translation) return gloss;
  const glossWords = new Set(gloss.toLowerCase().match(/[a-z]+/g) ?? []);
  const romanised = /^[a-z]+$/.test(translation) && !glossWords.has(translation) && /^(?:[^aeiou]*[aeiou]+[^aeiou]*){1,3}$/.test(translation) && translation.length <= 6;
  return romanised ? gloss : translation;
}

export interface SeedResult {
  /** New words saved. */
  added: number;
  /** Words the user already had, now also in a starter category. */
  linked: number;
}

/** Whether the account has no words at all — then it gets the starter categories. */
export async function needsStarterCategories(prisma: PrismaClient, userId: string): Promise<boolean> {
  return (await prisma.entry.findFirst({ where: { userId }, select: { id: true } })) === null;
}

/** Add the starter categories and their words to this account (see the file comment). */
export async function seedStarterCategories(prisma: PrismaClient, userId: string): Promise<SeedResult> {
  const lemmas = [...new Set(STARTER_CATEGORIES.flatMap((category) => category.words.map((word) => word.lemma)))];
  const dictionary = await localLookupMany(prisma, lemmas);
  // Without the local dictionary the words would all become AI entries.
  if (!dictionary) throw new Error("The local dictionary (KrdictEntry) is not loaded.");

  // One word per dictionary entry, with every starter category it belongs to.
  const words = new Map<string, { word: StarterWord; entry: DictEntry | null; categories: string[] }>();
  for (const category of STARTER_CATEGORIES) {
    for (const word of category.words) {
      const entry = resolveStarterWord(dictionary.get(word.lemma) ?? [], word, category);
      const key = entry?.targetCode ?? `ai:${word.lemma}`;
      const known = words.get(key);
      if (known) known.categories.push(category.name);
      else words.set(key, { word, entry, categories: [category.name] });
    }
  }

  return prisma.$transaction(
    async (tx) => {
      // Categories: reuse by name, create the rest; all locked, with the
      // icon unless the user already chose one.
      const names = STARTER_CATEGORIES.map((category) => category.name);
      await tx.category.createMany({
        data: STARTER_CATEGORIES.map((category) => ({
          userId,
          language: "KO" as const,
          name: category.name,
          icon: category.icon,
          locked: true,
        })),
        skipDuplicates: true,
      });
      await tx.category.updateMany({ where: { userId, language: "KO", name: { in: names } }, data: { locked: true } });
      for (const category of STARTER_CATEGORIES) {
        await tx.category.updateMany({
          where: { userId, language: "KO", name: category.name, icon: null },
          data: { icon: category.icon },
        });
      }
      const categoryRows = await tx.category.findMany({
        where: { userId, language: "KO", name: { in: names } },
        select: { id: true, name: true },
      });
      const categoryId = new Map(categoryRows.map((category) => [category.name, category.id]));

      // Words the user already has: matched by dictionary entry (or, for a
      // word the dictionary lacks, by spelling among entries without one).
      const existing = await tx.entry.findMany({
        where: { userId, language: "KO", lemma: { in: lemmas } },
        select: { id: true, lemma: true, krdictTargetCode: true, originalForm: true },
      });
      // Same dictionary entry; or the same spelling and hanja (the database's
      // unique key — e.g. a word saved without its dictionary code); or, for
      // a word the dictionary lacks, the same spelling with no code.
      const findExisting = (lemma: string, entry: DictEntry | null) =>
        existing.find((row) =>
          entry?.targetCode
            ? row.krdictTargetCode === entry.targetCode ||
              (Boolean(entry.originalForm) && row.lemma === entry.lemma && row.originalForm === entry.originalForm)
            : row.lemma === lemma && !row.krdictTargetCode,
        );

      const material = await tx.sourceMaterial.create({
        data: { userId, kind: "GENERATED", title: "Starter categories", language: "KO", processedAt: new Date() },
      });

      const entries: Prisma.EntryCreateManyInput[] = [];
      const senses: Prisma.SenseCreateManyInput[] = [];
      const examples: Prisma.ExampleCreateManyInput[] = [];
      const cards: Prisma.CardCreateManyInput[] = [];
      const links: Prisma.EntryCategoryCreateManyInput[] = [];
      let linked = 0;

      for (const { word, entry, categories } of words.values()) {
        const ids = categories.map((name) => categoryId.get(name)).filter((id): id is string => Boolean(id));
        const known = findExisting(word.lemma, entry);
        if (known) {
          // Already in the deck: only the category link, progress untouched.
          for (const id of ids) links.push({ entryId: known.id, categoryId: id, assignedByAi: false, confirmed: true });
          linked += 1;
          continue;
        }
        // Only the meant sense is stored (keeps every account small); the
        // word editor lists the dictionary's other senses when needed.
        const sense = entry?.senses[0];
        const entryId = randomUUID();
        const senseId = randomUUID();
        entries.push({
          id: entryId,
          userId,
          materialId: material.id,
          language: "KO",
          lemma: entry?.lemma ?? word.lemma,
          originalForm: entry?.originalForm ?? null,
          partOfSpeech: entry?.partOfSpeech ?? null,
          level: entry?.level ?? null,
          krdictTargetCode: entry?.targetCode ?? null,
          // Not in the dictionary (set phrases): the gloss is an assistant-
          // written meaning, stored as AI like an imported phrase.
          source: entry ? "KRDICT" : "AI",
        });
        senses.push({
          id: senseId,
          entryId,
          order: 0,
          definitionTarget: sense?.definition || null,
          definitionKnown: sense?.translatedDefinition ?? null,
          translation: sense ? starterTranslation(sense.translation, word.gloss) : word.gloss,
          definitionSource: entry ? "KRDICT" : "AI",
        });
        for (const text of sense?.examples.slice(0, 3) ?? []) examples.push({ senseId, text, source: "KRDICT" });
        cards.push({ userId, senseId, direction: "RECOGNITION" }, { userId, senseId, direction: "RECALL" });
        for (const id of ids) links.push({ entryId, categoryId: id, assignedByAi: false, confirmed: true });
      }

      await tx.entry.createMany({ data: entries });
      await tx.sense.createMany({ data: senses });
      await tx.example.createMany({ data: examples });
      await tx.card.createMany({ data: cards });
      await tx.entryCategory.createMany({ data: links, skipDuplicates: true });

      // A word with a real category is not "uncategorised" any more.
      await tx.entryCategory.deleteMany({
        where: { entryId: { in: links.map((link) => link.entryId) }, category: { userId, name: UNCATEGORISED } },
      });

      return { added: entries.length, linked };
    },
    { maxWait: 10_000, timeout: 120_000 },
  );
}
