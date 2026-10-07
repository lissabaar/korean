/**
 * Commit stage: approved candidates in, entries and cards out.
 *
 * Categories arriving here were reviewed by the user, so they are taken as
 * given and `assignedByAi` is false for anything they touched.
 */

import type { PrismaClient } from "@prisma/client";
import type { DictEntry } from "../dictionary/krdict";

export interface ApprovedWord {
  lemma: string;
  /** The sentence the word was found in; becomes its first example. */
  sentence?: string;
  contextNote: string;
  register: string | null;
  primaryCategory: string;
  secondaryCategories: string[];
  /** False once the user has edited the categories. */
  categoriesFromAi: boolean;
  /**
   * The user put every word of this import into one category on purpose
   * (asked for it in the text, or chose "All into one category"): that
   * category gets locked, so "Re-sort with AI" leaves these words alone.
   */
  lockCategory?: boolean;
  /** The dictionary did not answer for it: verify in the background later. */
  needsCheck?: boolean;
  /** The dictionary's entry; absent when the dictionary does not have it. */
  dictionary?: DictEntry | null;
  /** The model's English meaning, used when there is no dictionary entry. */
  aiMeaning?: string;
  /** The meaning the user wrote; it becomes the card's translation... */
  userMeaning?: string;
  /** ...unless the user chose the dictionary's meaning instead. */
  useDictionaryMeaning?: boolean;
}

/**
 * Whether the "sentence" the model returned is one. For a bare word list it
 * sometimes returns the word itself or one form of it (부드러워, 뽑았) —
 * that is no example, so a sentence needs at least two words.
 */
function isSentence(text: string | undefined): boolean {
  return /\S\s+\S/.test(text?.trim() ?? "");
}

/** The user's own meaning, unless they chose to drop it for the dictionary's. */
function ownMeaning(word: ApprovedWord): string | null {
  const meaning = word.userMeaning?.trim().slice(0, 300);
  return meaning && !word.useDictionaryMeaning ? meaning : null;
}

/**
 * The entry to store: the dictionary's when it has one, otherwise a minimal
 * one built from the model's meaning and marked source AI (phrases,
 * compounds, words the dictionary lacks). Null if there is neither.
 */
export function resolveEntry(word: ApprovedWord): DictEntry | null {
  // The dictionary's entry as it is — the user's own meaning is stored next
  // to it (Sense.userMeaning), never over it.
  if (word.dictionary?.senses?.length) return word.dictionary;
  const english = word.aiMeaning?.trim().slice(0, 300) ?? "";
  const lemma = word.lemma?.normalize("NFC").trim().slice(0, 120);
  if (!lemma || !(english || ownMeaning(word))) return null;
  return {
    lemma,
    source: "AI",
    // English from the model when it gave one; otherwise none yet — "Fill in
    // English meanings" adds it later.
    senses: [{ definition: "", translation: english || undefined, examples: [] }],
  };
}

export interface CommitResult {
  materialId: string;
  created: number;
  /** Already in the deck (same word, same dictionary entry); left untouched. */
  alreadySaved: string[];
  /** Failed to save; the error is in the server log. */
  skipped: string[];
}

const REGISTERS = new Set([
  "NEUTRAL",
  "FORMAL",
  "POLITE",
  "CASUAL",
  "HONORIFIC",
  "HUMBLE",
  "WRITTEN",
  "SLANG",
]);

/**
 * Keep the register (formal, polite, casual, ...) only if it is one the schema
 * knows.
 */
function normaliseRegister(value: string | null): string | null {
  if (!value) return null;
  const upper = value.toUpperCase().trim();
  return REGISTERS.has(upper) ? upper : null;
}

/**
 * Save a batch of approved words for a user: one Material row for the source
 * text, then each word through persistOne(). Returns what was created, already
 * saved, or skipped.
 */
export async function commitWords(
  prisma: PrismaClient,
  options: {
    userId: string;
    /** Where the words came from: pasted text and files are TEXT. */
    kind?: "TEXT" | "IMAGE" | "GENERATED";
    text: string;
    title?: string;
    words: ApprovedWord[];
  },
): Promise<CommitResult> {
  const { userId, kind = "TEXT", text, title, words } = options;

  const material = await prisma.sourceMaterial.create({
    data: {
      userId,
      kind,
      title,
      rawText: text || null,
      language: "KO",
      processedAt: new Date(),
    },
  });

  const skipped: string[] = [];
  const alreadySaved: string[] = [];
  let created = 0;

  for (const word of words) {
    try {
      if (await persistOne(prisma, userId, material.id, word)) created += 1;
      else alreadySaved.push(word.lemma);
    } catch (error) {
      // One bad word must not cost the user the other thirty-nine.
      console.error(`Failed to save "${word.lemma}":`, error);
      skipped.push(word.lemma);
    }
  }

  return { materialId: material.id, created, alreadySaved, skipped };
}

/**
 * Save one word: entry, senses, examples, categories and both study cards, in
 * one transaction. Returns false when the user already has this word.
 */
async function persistOne(
  prisma: PrismaClient,
  userId: string,
  materialId: string,
  word: ApprovedWord,
): Promise<boolean> {
  const dict = resolveEntry(word);
  if (!dict) throw new Error(`"${word.lemma}" has neither dictionary data nor a meaning`);

  // The unique index on (userId, language, lemma, originalForm) does not
  // stop duplicates of native words: originalForm is null for them and
  // Postgres treats nulls as distinct. So check by dictionary entry here —
  // the same word can arrive from two files in one import.
  const existing = await prisma.entry.findFirst({
    where: {
      userId,
      language: "KO",
      lemma: dict.lemma,
      ...(dict.targetCode
        ? { krdictTargetCode: dict.targetCode }
        : { originalForm: dict.originalForm ?? null }),
    },
    select: { id: true },
  });
  if (existing) return false;

  await prisma.$transaction(async (tx) => {
    const names = [word.primaryCategory, ...word.secondaryCategories];
    const categoryIds: string[] = [];

    for (const name of names) {
      const lock = Boolean(word.lockCategory) && name === word.primaryCategory;
      const category = await tx.category.upsert({
        where: { userId_language_name: { userId, language: "KO", name } },
        create: { userId, language: "KO", name, ...(lock && { locked: true }) },
        update: lock ? { locked: true } : {},
      });
      categoryIds.push(category.id);
    }

    const entry = await tx.entry.create({
      data: {
        userId,
        materialId,
        language: "KO",
        lemma: dict.lemma,
        originalForm: dict.originalForm ?? null,
        partOfSpeech: dict.partOfSpeech ?? null,
        level: dict.level ?? null,
        register: normaliseRegister(word.register) as never,
        krdictTargetCode: dict.targetCode ?? null,
        source: dict.source as never,
        needsCheck: Boolean(word.needsCheck) && !word.dictionary?.senses?.length,
        categories: {
          create: categoryIds.map((categoryId) => ({
            categoryId,
            assignedByAi: word.categoriesFromAi,
            confirmed: !word.categoriesFromAi,
          })),
        },
        senses: {
          create: dict.senses.map((sense, index) => ({
            order: index,
            definitionTarget: sense.definition || null,
            definitionKnown: sense.translatedDefinition ?? null,
            translation: sense.translation ?? null,
            userMeaning: index === 0 ? ownMeaning(word) : null,
            contextNote: index === 0 ? word.contextNote : null,
            definitionSource: dict.source as never,
            examples: {
              create: [
                // The learner's own sentence first: it is the context they met
                // the word in. Dictionary examples follow.
                ...(index === 0 && isSentence(word.sentence)
                  ? [{ text: word.sentence!.trim().slice(0, 500), source: "USER" as const }]
                  : []),
                ...sense.examples.slice(0, 3).map((example) => ({
                  text: example,
                  source: dict.source as never,
                })),
              ],
            },
          })),
        },
      },
      include: { senses: true },
    });

    const primary = entry.senses[0];
    if (primary) {
      await tx.card.createMany({
        data: [
          { userId, senseId: primary.id, direction: "RECOGNITION" },
          { userId, senseId: primary.id, direction: "RECALL" },
        ],
      });
    }
  }, {
    // Several sequential round trips: generous enough for a database in
    // another region (the default 5 s was hit with Neon in São Paulo).
    maxWait: 10_000,
    timeout: 30_000,
  });
  return true;
}
