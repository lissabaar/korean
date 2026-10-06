/**
 * Words typed in by hand — no model, no dictionary.
 *
 * The exception to "dictionaries decide": what the user writes down is their
 * own fact, stored with source USER so it can always be told apart from
 * dictionary data (and later enriched from the dictionary if wanted).
 */

import type { PrismaClient, Source } from "@prisma/client";

export interface ManualWordInput {
  /** The Korean word. */
  lemma: string;
  /** Its meaning in English — shown on the front of every review. */
  translation: string;
  /** Optional Korean definition. */
  definition?: string;
  /** Optional example sentence. */
  example?: string;
  /** Category name; created if new. Defaults to "uncategorised". */
  category?: string;
  /**
   * Set when the user filled the form from a dictionary lookup: the entry's
   * dictionary facts, kept so the word can be refetched and shows its level.
   */
  dictionary?: {
    targetCode?: string | null;
    level?: string | null;
    partOfSpeech?: string | null;
    originalForm?: string | null;
    /** The dictionary's English meaning for the picked entry. */
    translation?: string | null;
  };
}

export class DuplicateWordError extends Error {}
export class InvalidWordError extends Error {}

const LIMITS = { lemma: 60, translation: 200, definition: 500, example: 500, category: 60 };

function clean(value: string | undefined, max: number): string {
  return (value ?? "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * What the user typed is their own meaning. The card's English meaning is
 * the dictionary's (when they picked an entry), else what they typed if it
 * is not Cyrillic; otherwise it stays empty until "Fill in English meanings".
 */
function meanings(typed: string, dictionary: string | null | undefined) {
  const fromDictionary = typeof dictionary === "string" ? clean(dictionary, LIMITS.translation) : "";
  const english = fromDictionary || (/[а-яё]/i.test(typed) ? "" : typed);
  return {
    translation: english || null,
    userMeaning: typed && typed !== english ? typed : null,
  };
}

export async function createManualWord(
  prisma: PrismaClient,
  userId: string,
  input: ManualWordInput,
  source: Source = "USER",
): Promise<{ entryId: string }> {
  const lemma = clean(input.lemma, LIMITS.lemma);
  const translation = clean(input.translation, LIMITS.translation);
  const definition = clean(input.definition, LIMITS.definition);
  const example = clean(input.example, LIMITS.example);
  const category = clean(input.category, LIMITS.category).toLowerCase() || "uncategorised";

  if (!/[가-힣]/.test(lemma)) throw new InvalidWordError("Write the word in Korean.");
  if (!translation) throw new InvalidWordError("Add what the word means.");

  const existing = await prisma.entry.findFirst({
    where: { userId, language: "KO", lemma },
    select: { id: true },
  });
  if (existing) throw new DuplicateWordError(`“${lemma}” is already in your words.`);

  return prisma.$transaction(
    async (tx) => {
      const cat = await tx.category.upsert({
        where: { userId_language_name: { userId, language: "KO", name: category } },
        create: { userId, language: "KO", name: category },
        update: {},
      });

      const entry = await tx.entry.create({
        data: {
          userId,
          language: "KO",
          lemma,
          source,
          ...(input.dictionary && {
            krdictTargetCode: clean(String(input.dictionary.targetCode ?? ""), 40) || null,
            level: clean(String(input.dictionary.level ?? ""), 20) || null,
            partOfSpeech: clean(String(input.dictionary.partOfSpeech ?? ""), 20) || null,
            originalForm: clean(String(input.dictionary.originalForm ?? ""), 40) || null,
          }),
          categories: { create: { categoryId: cat.id, assignedByAi: false, confirmed: true } },
          senses: {
            create: {
              order: 0,
              ...meanings(translation, input.dictionary?.translation),
              definitionTarget: definition || null,
              definitionSource: source,
              examples: example ? { create: { text: example, source } } : undefined,
            },
          },
        },
        include: { senses: true },
      });

      await tx.card.createMany({
        data: [
          { userId, senseId: entry.senses[0].id, direction: "RECALL" },
          { userId, senseId: entry.senses[0].id, direction: "RECOGNITION" },
        ],
      });
      return { entryId: entry.id };
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
}
