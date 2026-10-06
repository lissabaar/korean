/**
 * English translations for example sentences that have none.
 *
 * KRDict's examples come in Korean only, and so does the sentence from the
 * user's own text. The card shows one example per word (the first saved),
 * so only that one is translated. Dictionary sentences are translated once
 * for everyone (`ExampleTranslation`); the user's own sentences are
 * translated for them alone and never enter the shared table.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { assertCanUseAi, AiQuotaError, recordAiUsage } from "../ai-budget";
import { EXTRACTION_MODEL } from "../ingest/extract";

/** Sentences per model call, and calls per run (one HTTP request). */
const BATCH = 40;
const BATCHES_PER_RUN = 2;

const TranslationSchema = z.object({
  translations: z.array(z.object({ n: z.number(), english: z.string() })),
});

export interface TranslateResult {
  /** Same shape as the other fill endpoints, so Settings can run it the same way. */
  fromDictionary: number;
  fromAi: number;
  remaining: number;
  aiBlocked?: "anonymous" | "user" | "daily";
}

interface Shown {
  id: string;
  text: string;
  source: string;
}

/** The example each word's card shows, where it has no translation yet. */
async function untranslated(prisma: PrismaClient, userId: string): Promise<Shown[]> {
  const senses = await prisma.sense.findMany({
    where: { order: 0, entry: { userId }, examples: { some: { translation: null } } },
    select: {
      // Same pick as the card: cuid ids grow with creation order.
      examples: { take: 1, orderBy: { id: "asc" }, select: { id: true, text: true, translation: true, source: true } },
    },
  });
  return senses
    .map((sense) => sense.examples[0])
    .filter((example) => example && !example.translation && example.text.trim());
}

/** Dictionary text may be cached for everyone; the user's own text may not. */
const shareable = (example: Shown) => example.source !== "USER";

export async function translateExamples(
  prisma: PrismaClient,
  anthropic: Anthropic,
  userId: string,
): Promise<TranslateResult> {
  const pending = await untranslated(prisma, userId);

  // ---- shared cache first: free
  let fromDictionary = 0;
  const shared = pending.filter(shareable);
  const cached = shared.length
    ? await prisma.exampleTranslation.findMany({ where: { text: { in: shared.map((e) => e.text) } } })
    : [];
  const byText = new Map(cached.map((row) => [row.text, row.translation]));
  const needAi: Shown[] = [];
  for (const example of pending) {
    const known = shareable(example) ? byText.get(example.text) : undefined;
    if (!known) {
      needAi.push(example);
      continue;
    }
    await prisma.example.update({ where: { id: example.id }, data: { translation: known } });
    fromDictionary += 1;
  }

  // ---- model
  let fromAi = 0;
  let aiBlocked: TranslateResult["aiBlocked"];
  for (let b = 0; b < BATCHES_PER_RUN && b * BATCH < needAi.length; b++) {
    const batch = needAi.slice(b * BATCH, (b + 1) * BATCH);
    let unlimited: boolean;
    try {
      unlimited = (await assertCanUseAi(prisma, userId)).unlimited;
    } catch (error) {
      if (error instanceof AiQuotaError) {
        aiBlocked = error.scope;
        break;
      }
      throw error;
    }

    const response = await anthropic.messages.parse({
      model: EXTRACTION_MODEL,
      max_tokens: 6000,
      system:
        "Translate each numbered Korean sentence into natural, plain English for a learner of Korean. Keep the meaning and tone; do not explain or add notes. Return every number given.",
      messages: [{ role: "user", content: batch.map((e, i) => `${i + 1}. ${e.text}`).join("\n") }],
      output_config: { format: zodOutputFormat(TranslationSchema) },
    });
    await recordAiUsage(prisma, userId, unlimited, response.model, response.usage);
    if (response.stop_reason === "refusal") continue;

    for (const { n, english } of response.parsed_output?.translations ?? []) {
      const example = batch[n - 1];
      const translation = english.trim().slice(0, 500);
      if (!example || !translation) continue;
      await prisma.example.update({ where: { id: example.id }, data: { translation } });
      if (shareable(example)) {
        await prisma.exampleTranslation
          .upsert({ where: { text: example.text }, create: { text: example.text, translation }, update: {} })
          .catch(() => {}); // the cache is a bonus; never fail the run over it
      }
      fromAi += 1;
    }
  }

  const remaining = (await untranslated(prisma, userId)).length;
  return { fromDictionary, fromAi, remaining, aiBlocked };
}

/** For the Settings page: how many shown examples still lack a translation. */
export async function countUntranslatedExamples(prisma: PrismaClient, userId: string): Promise<number> {
  return (await untranslated(prisma, userId)).length;
}
