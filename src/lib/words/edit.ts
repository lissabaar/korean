/**
 * Editing what is already saved: categories and words.
 *
 * Invariant kept here: every word has at least one category. A word that
 * would lose its last one lands in "uncategorised", which is an ordinary
 * category with its own Learn / Review switches.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

export const UNCATEGORISED = "uncategorised";

export class EditError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type Tx = Prisma.TransactionClient;
const TX = { maxWait: 10_000, timeout: 30_000 };

/** A category name as stored: lowercase, single spaces, at most 60 characters. */
function cleanName(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 60);
}

/** The id of the user's "uncategorised" category, created if missing. */
async function uncategorisedId(tx: Tx, userId: string): Promise<string> {
  const category = await tx.category.upsert({
    where: { userId_language_name: { userId, language: "KO", name: UNCATEGORISED } },
    create: { userId, language: "KO", name: UNCATEGORISED },
    update: {},
  });
  return category.id;
}

/** Give every word left without a category the "uncategorised" one. */
async function rehomeLooseWords(tx: Tx, userId: string): Promise<void> {
  const loose = await tx.entry.findMany({
    where: { userId, categories: { none: {} } },
    select: { id: true },
  });
  if (loose.length === 0) return;
  const categoryId = await uncategorisedId(tx, userId);
  await tx.entryCategory.createMany({
    data: loose.map((entry) => ({ entryId: entry.id, categoryId, confirmed: true })),
    skipDuplicates: true,
  });
}

// ---------------------------------------------------------------- categories

/** Rename; renaming onto an existing name merges the two. */
export async function renameCategory(
  prisma: PrismaClient,
  userId: string,
  id: string,
  rawName: string,
): Promise<{ id: string; merged: boolean }> {
  const name = cleanName(rawName);
  if (!name) throw new EditError("Give the category a name.");

  return prisma.$transaction(async (tx) => {
    const category = await tx.category.findFirst({ where: { id, userId } });
    if (!category) throw new EditError("No such category.", 404);
    if (category.name === name) return { id, merged: false };

    const twin = await tx.category.findFirst({
      where: { userId, language: category.language, name },
    });
    if (!twin) {
      await tx.category.update({ where: { id }, data: { name } });
      return { id, merged: false };
    }

    const links = await tx.entryCategory.findMany({ where: { categoryId: id } });
    await tx.entryCategory.createMany({
      data: links.map((link) => ({ ...link, categoryId: twin.id })),
      skipDuplicates: true,
    });
    await tx.category.delete({ where: { id } });
    return { id: twin.id, merged: true };
  }, TX);
}

/** Delete a category; its words keep their other categories or go to uncategorised. */
export async function deleteCategory(prisma: PrismaClient, userId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const category = await tx.category.findFirst({
      where: { id, userId },
      select: { name: true, _count: { select: { entries: true } } },
    });
    if (!category) throw new EditError("No such category.", 404);
    if (category.name === UNCATEGORISED && category._count.entries > 0) {
      throw new EditError("Move these words to other categories first.", 409);
    }
    await tx.category.delete({ where: { id } });
    await rehomeLooseWords(tx, userId);
  }, TX);
}

// ---------------------------------------------------------------- words

export interface WordDetails {
  id: string;
  lemma: string;
  translation: string;
  /** The user's own meaning (any language). */
  userMeaning: string;
  definition: string;
  example: string;
  categories: string[];
}

/** One word with its first sense, example and category names, for the editor. */
export async function getWord(prisma: PrismaClient, userId: string, id: string): Promise<WordDetails> {
  const entry = await prisma.entry.findFirst({
    where: { id, userId },
    include: {
      senses: { orderBy: { order: "asc" }, take: 1, include: { examples: { take: 1, orderBy: { id: "asc" } } } },
      categories: { include: { category: { select: { name: true } } } },
    },
  });
  if (!entry) throw new EditError("No such word.", 404);
  const sense = entry.senses[0];
  return {
    id: entry.id,
    lemma: entry.lemma,
    translation: sense?.translation ?? "",
    userMeaning: sense?.userMeaning ?? "",
    definition: sense?.definitionTarget ?? "",
    example: sense?.examples[0]?.text ?? "",
    categories: entry.categories.map((link) => link.category.name),
  };
}

/**
 * Save edits to a word. Changing the spelling checks for a duplicate; an empty
 * category list puts the word in "uncategorised".
 */
export async function updateWord(
  prisma: PrismaClient,
  userId: string,
  id: string,
  input: Partial<Omit<WordDetails, "id">>,
): Promise<void> {
  const text = (value: string | undefined, max: number) =>
    value === undefined ? undefined : value.normalize("NFC").replace(/\s+/g, " ").trim().slice(0, max);

  const lemma = text(input.lemma, 60);
  if (lemma !== undefined && !/[가-힣]/.test(lemma)) throw new EditError("Write the word in Korean.");
  const translation = text(input.translation, 200);
  const userMeaning = text(input.userMeaning, 300);

  await prisma.$transaction(async (tx) => {
    const entry = await tx.entry.findFirst({
      where: { id, userId },
      include: { senses: { orderBy: { order: "asc" }, take: 1, include: { examples: { take: 1, orderBy: { id: "asc" } } } } },
    });
    if (!entry) throw new EditError("No such word.", 404);

    if (lemma !== undefined && lemma !== entry.lemma) {
      const clash = await tx.entry.findFirst({ where: { userId, language: entry.language, lemma, NOT: { id } } });
      if (clash) throw new EditError(`“${lemma}” is already in your words.`, 409);
      await tx.entry.update({ where: { id }, data: { lemma } });
    }

    const sense = entry.senses[0];
    if (sense) {
      const definition = text(input.definition, 500);
      await tx.sense.update({
        where: { id: sense.id },
        data: {
          ...(translation !== undefined && { translation: translation || null }),
          ...(userMeaning !== undefined && { userMeaning: userMeaning || null }),
          ...(definition !== undefined && { definitionTarget: definition || null }),
        },
      });

      const example = text(input.example, 500);
      const current = sense.examples[0];
      if (example !== undefined) {
        if (!example && current) await tx.example.delete({ where: { id: current.id } });
        else if (example && current) await tx.example.update({ where: { id: current.id }, data: { text: example, source: "USER" } });
        else if (example) await tx.example.create({ data: { senseId: sense.id, text: example, source: "USER" } });
      }
    }

    if (input.categories) {
      const names = [...new Set(input.categories.map(cleanName).filter(Boolean))];
      const ids: string[] = [];
      for (const name of names.length ? names : [UNCATEGORISED]) {
        const category = await tx.category.upsert({
          where: { userId_language_name: { userId, language: entry.language, name } },
          create: { userId, language: entry.language, name },
          update: {},
        });
        ids.push(category.id);
      }
      await tx.entryCategory.deleteMany({ where: { entryId: id, categoryId: { notIn: ids } } });
      await tx.entryCategory.createMany({
        data: ids.map((categoryId) => ({ entryId: id, categoryId, assignedByAi: false, confirmed: true })),
        skipDuplicates: true,
      });
    }
  }, TX);
}

/** Delete a word; its senses, examples and cards go with it (cascade). */
export async function deleteWord(prisma: PrismaClient, userId: string, id: string): Promise<void> {
  const { count } = await prisma.entry.deleteMany({ where: { id, userId } });
  if (count === 0) throw new EditError("No such word.", 404);
}

/** One-off repair for data saved before the invariant existed. */
export async function repairLooseWords(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.$transaction((tx) => rehomeLooseWords(tx, userId), TX);
}
