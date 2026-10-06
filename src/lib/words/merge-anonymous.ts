/**
 * Moving a "try without an account" user's data into their real account.
 *
 * Called from Better Auth's anonymous plugin (onLinkAccount) when such a
 * user signs up or signs in. The plugin deletes the anonymous user right
 * after, and every table cascades from User — so anything not moved here
 * is lost.
 *
 * Merging into an account that already has words: categories with the same
 * name are joined, and a word the account already has is dropped from the
 * anonymous side (its review history there was a trial anyway).
 */

import type { PrismaClient } from "@prisma/client";

/**
 * Move words, categories, source materials, cards and AI usage from the
 * anonymous user to the real one, merging categories by name and dropping words
 * the account already has.
 */
export async function moveAnonymousData(
  prisma: PrismaClient,
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  if (fromUserId === toUserId) return;

  await prisma.$transaction(
    async (tx) => {
      // ---- words the target already has: drop the anonymous copy
      const [fromEntries, toEntries] = await Promise.all([
        tx.entry.findMany({
          where: { userId: fromUserId },
          select: { id: true, language: true, lemma: true },
        }),
        tx.entry.findMany({
          where: { userId: toUserId },
          select: { language: true, lemma: true },
        }),
      ]);
      const known = new Set(toEntries.map((e) => `${e.language}|${e.lemma}`));
      const duplicateIds = fromEntries
        .filter((e) => known.has(`${e.language}|${e.lemma}`))
        .map((e) => e.id);
      if (duplicateIds.length) {
        await tx.entry.deleteMany({ where: { id: { in: duplicateIds } } });
      }

      // ---- categories: join by name, otherwise hand over
      const [fromCats, toCats] = await Promise.all([
        tx.category.findMany({ where: { userId: fromUserId } }),
        tx.category.findMany({ where: { userId: toUserId } }),
      ]);
      const byName = new Map(toCats.map((c) => [`${c.language}|${c.name}`, c]));
      for (const cat of fromCats) {
        const twin = byName.get(`${cat.language}|${cat.name}`);
        if (!twin) {
          await tx.category.update({ where: { id: cat.id }, data: { userId: toUserId } });
          continue;
        }
        const links = await tx.entryCategory.findMany({ where: { categoryId: cat.id } });
        if (links.length) {
          await tx.entryCategory.createMany({
            data: links.map((link) => ({ ...link, categoryId: twin.id })),
            skipDuplicates: true,
          });
        }
        await tx.category.delete({ where: { id: cat.id } });
      }

      // ---- everything else changes owner wholesale
      await tx.entry.updateMany({ where: { userId: fromUserId }, data: { userId: toUserId } });
      await tx.card.updateMany({ where: { userId: fromUserId }, data: { userId: toUserId } });
      await tx.sourceMaterial.updateMany({
        where: { userId: fromUserId },
        data: { userId: toUserId },
      });
      await tx.aiUsage.updateMany({ where: { userId: fromUserId }, data: { userId: toUserId } });
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}
