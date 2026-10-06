/**
 * "Re-sort with AI": after the user reshapes their categories (renames,
 * merges, new ones), the model puts every word into the best of the
 * categories that exist now.
 *
 * Rules:
 *   - Only the user's current categories are targets — nothing is invented.
 *     "uncategorised" is allowed only when nothing else fits.
 *   - A word in any locked category is not touched at all.
 *   - Each moved word ends up in exactly one category (like an import).
 *   - Metered like every model call (ai-budget.ts). The cost is estimated
 *     up front (resortPlan) so the page can show it before anything runs.
 *
 * The work runs in batches, one batch per HTTP request (time limits on the
 * hosting): the page calls resortBatch() with the cursor it got back until
 * the cursor is null.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { assertCanUseAi, AiQuotaError, costMicros, getAiBalance, recordAiUsage } from "../ai-budget";
import { EXTRACTION_MODEL } from "../ingest/extract";
import { UNCATEGORISED } from "./edit";

/** Words per model call: small enough to answer fast, big enough to be cheap. */
const BATCH = 120;

/**
 * Token guesses for the estimate, measured on Korean word + English meaning
 * lines: ~15 tokens in and ~14 out per word, plus the prompt per call. A
 * margin is added on top so the real cost comes out at or below the estimate.
 */
const IN_PER_WORD = 15;
const OUT_PER_WORD = 14;
const PROMPT_TOKENS = 250;
const ESTIMATE_MARGIN = 1.3;

const ResortSchema = z.object({
  assignments: z.array(z.object({ n: z.number(), category: z.string() })),
});

/** A word may be moved: none of its categories is locked. */
const movable = (userId: string) => ({
  userId,
  categories: { none: { category: { locked: true } } },
});

export interface ResortPlan {
  /** Words that will be re-sorted. */
  words: number;
  /** Words left alone because a category of theirs is locked. */
  lockedWords: number;
  /** Categories the words can go to. */
  categories: string[];
  /** Expected cost in credits (1 credit = 1 cent). */
  estimatedCredits: number;
  /** Credits left; null = unlimited. */
  creditsLeft: number | null;
  /** Anonymous users cannot use AI at all. */
  anonymous: boolean;
}

/** What a re-sort would do and cost — read-only, shown before the user confirms. */
export async function resortPlan(prisma: PrismaClient, userId: string): Promise<ResortPlan> {
  const [words, total, categories, balance] = await Promise.all([
    prisma.entry.count({ where: movable(userId) }),
    prisma.entry.count({ where: { userId } }),
    targetCategories(prisma, userId),
    getAiBalance(prisma, userId),
  ]);
  const calls = Math.ceil(words / BATCH);
  const micros = costMicros(EXTRACTION_MODEL, {
    input_tokens: words * IN_PER_WORD + calls * (PROMPT_TOKENS + categories.length * 5),
    output_tokens: words * OUT_PER_WORD + calls * 20,
  });
  return {
    words,
    lockedWords: total - words,
    categories: categories.map((c) => c.name),
    estimatedCredits: Math.max(1, Math.ceil((micros * ESTIMATE_MARGIN) / 10_000)),
    creditsLeft: balance.unlimited ? null : balance.remaining,
    anonymous: balance.anonymous,
  };
}

/** The user's categories, "uncategorised" last (only a fallback). */
async function targetCategories(prisma: PrismaClient, userId: string) {
  const all = await prisma.category.findMany({
    where: { userId, language: "KO" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return [...all.filter((c) => c.name !== UNCATEGORISED), ...all.filter((c) => c.name === UNCATEGORISED)];
}

export interface ResortBatchResult {
  /** Words looked at in this batch. */
  processed: number;
  /** Of those, words that changed category. */
  moved: number;
  /** Pass back to continue; null when every word has been done. */
  nextCursor: string | null;
  /** Set when AI may not be used (no account, credits used up, daily cap). */
  aiBlocked?: AiQuotaError["scope"];
}

export class ResortError extends Error {}

/**
 * One batch: the next BATCH movable words after `cursor` (by id), one model
 * call, then each word is moved into the category the model picked.
 */
export async function resortBatch(
  prisma: PrismaClient,
  anthropic: Anthropic,
  userId: string,
  cursor: string | null,
): Promise<ResortBatchResult> {
  const targets = await targetCategories(prisma, userId);
  if (targets.filter((c) => c.name !== UNCATEGORISED).length === 0) {
    throw new ResortError("Create some categories first — there is nothing to sort into.");
  }

  const entries = await prisma.entry.findMany({
    where: { ...movable(userId), ...(cursor && { id: { gt: cursor } }) },
    orderBy: { id: "asc" },
    take: BATCH,
    select: {
      id: true,
      lemma: true,
      categories: { select: { categoryId: true } },
      senses: { where: { order: 0 }, take: 1, select: { translation: true, userMeaning: true } },
    },
  });
  if (entries.length === 0) return { processed: 0, moved: 0, nextCursor: null };

  let unlimited: boolean;
  try {
    unlimited = (await assertCanUseAi(prisma, userId)).unlimited;
  } catch (error) {
    if (error instanceof AiQuotaError) {
      return { processed: 0, moved: 0, nextCursor: cursor, aiBlocked: error.scope };
    }
    throw error;
  }

  const names = targets.map((c) => c.name);
  const response = await anthropic.messages.parse({
    model: EXTRACTION_MODEL,
    max_tokens: 8000,
    system: `You sort Korean vocabulary into a learner's categories. For every numbered word, pick the one category from the list that fits its meaning best, copied verbatim. Use "${UNCATEGORISED}" only when nothing else fits at all. Never invent a category. Return every number given.\n\nCategories:\n${names.join("\n")}`,
    messages: [
      {
        role: "user",
        content: entries
          .map((e, i) => {
            const meaning = e.senses[0]?.translation ?? e.senses[0]?.userMeaning ?? "";
            return `${i + 1}. ${e.lemma}${meaning ? ` — ${meaning}` : ""}`;
          })
          .join("\n"),
      },
    ],
    output_config: { format: zodOutputFormat(ResortSchema) },
  });
  // Spent whether or not the answer is usable.
  await recordAiUsage(prisma, userId, unlimited, response.model, response.usage);

  const byName = new Map(targets.map((c) => [c.name.toLowerCase(), c.id]));
  const moves: { entryId: string; categoryId: string }[] = [];
  for (const { n, category } of response.parsed_output?.assignments ?? []) {
    const entry = entries[n - 1];
    const categoryId = byName.get(category.toLowerCase().trim());
    if (!entry || !categoryId) continue;
    const already = entry.categories.length === 1 && entry.categories[0].categoryId === categoryId;
    if (!already) moves.push({ entryId: entry.id, categoryId });
  }

  if (moves.length) {
    await prisma.$transaction([
      prisma.entryCategory.deleteMany({ where: { entryId: { in: moves.map((m) => m.entryId) } } }),
      prisma.entryCategory.createMany({
        // assignedByAi stays false: the user chose this set of categories by
        // running the re-sort, and extraction only offers back categories
        // with user-made links (see analyze.ts) — true here would hide the
        // user's own categories from future imports.
        data: moves.map((m) => ({ ...m, assignedByAi: false, confirmed: false })),
      }),
    ]);
  }

  return {
    processed: entries.length,
    moved: moves.length,
    nextCursor: entries.length < BATCH ? null : entries[entries.length - 1].id,
  };
}
