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
}

export class DuplicateWordError extends Error {}
export class InvalidWordError extends Error {}

const LIMITS = { lemma: 60, translation: 200, definition: 500, example: 500, category: 60 };

function clean(value: string | undefined, max: number): string {
  return (value ?? "").normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max);
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
          categories: { create: { categoryId: cat.id, assignedByAi: false, confirmed: true } },
          senses: {
            create: {
              order: 0,
              translation,
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
