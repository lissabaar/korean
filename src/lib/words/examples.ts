/**
 * Filling in example sentences for saved words that have none.
 *
 * Dictionary first: KRDict's view API has real, edited examples and costs
 * nothing. Only words it cannot help with (typed in by hand, or with no
 * examples in the dictionary) get one from the model — marked source AI and
 * stored with an English translation, and metered like any other AI call.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { assertCanUseAi, AiQuotaError, recordAiUsage } from "../ai-budget";
import { cachedExamples } from "../dictionary/cached";
import type { DictionaryKeys } from "../dictionary/krdict";
import { EXTRACTION_MODEL } from "../ingest/extract";

/** One request per run is plenty for a personal deck; run again for more. */
const MAX_WORDS_PER_RUN = 60;
const AI_BATCH = 30;

const ExampleSchema = z.object({
  examples: z.array(
    z.object({
      lemma: z.string(),
      example: z.string(),
      translation: z.string(),
    }),
  ),
});

export interface FillResult {
  fromDictionary: number;
  fromAi: number;
  /** Still without an example (dictionary had none and AI was unavailable). */
  remaining: number;
  /** Why AI was not used, when it was not. */
  aiBlocked?: "anonymous" | "user" | "daily";
}

export async function fillMissingExamples(
  prisma: PrismaClient,
  anthropic: Anthropic,
  keys: DictionaryKeys,
  userId: string,
): Promise<FillResult> {
  // Two runs at once (two tabs, a double tap) must not give a word two
  // examples: every write checks again right before it happens.
  const stillWithout = async (senseId: string) =>
    (await prisma.example.count({ where: { senseId } })) === 0;

  const senses = await prisma.sense.findMany({
    where: { order: 0, examples: { none: {} }, entry: { userId } },
    select: {
      id: true,
      translation: true,
      entry: { select: { lemma: true, krdictTargetCode: true, level: true } },
    },
    take: MAX_WORDS_PER_RUN,
  });

  // ---- dictionary, three at a time
  let fromDictionary = 0;
  const needAi: typeof senses = [];
  const queue = [...senses];
  async function worker() {
    for (let sense = queue.shift(); sense; sense = queue.shift()) {
      const code = sense.entry.krdictTargetCode;
      let found: string[] = [];
      if (code && /^\d+$/.test(code)) {
        try {
          found = (await cachedExamples(prisma, code, keys)).slice(0, 2);
        } catch {
          // Dictionary not answering: the AI writes one instead of leaving
          // the word without an example (it used to wait for a later run,
          // which on a bad day meant "0 examples added").
          found = [];
        }
      }
      if (found.length) {
        if (await stillWithout(sense.id)) {
          await prisma.example.createMany({
            data: found.map((text) => ({ senseId: sense.id, text, source: "KRDICT" as const })),
          });
          fromDictionary += 1;
        }
      } else {
        needAi.push(sense);
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  // ---- shared cache of AI-written examples: another learner's word in the
  // same meaning already has one, so no model call is needed for it
  let fromAi = 0;
  // Keyed by the dictionary entry, never by the card's translation: that can
  // be the user's own text, and user text stays out of shared tables. Words
  // without a dictionary entry do not use the shared cache at all.
  const meaningOf = (sense: (typeof senses)[number]) =>
    sense.entry.krdictTargetCode && /^\d+$/.test(sense.entry.krdictTargetCode)
      ? `krdict:${sense.entry.krdictTargetCode}`
      : null;
  const cached = needAi.length
    ? await prisma.generatedExample.findMany({
        where: {
          OR: needAi
            .filter((sense) => meaningOf(sense))
            .map((sense) => ({ lemma: sense.entry.lemma, meaning: meaningOf(sense)! })),
        },
      })
    : [];
  const cacheKey = (lemma: string, meaning: string) => `${lemma}|${meaning}`;
  const byKey = new Map(cached.map((row) => [cacheKey(row.lemma, row.meaning), row]));
  const uncached: typeof needAi = [];
  for (const sense of needAi) {
    const key = meaningOf(sense);
    const row = key ? byKey.get(cacheKey(sense.entry.lemma, key)) : undefined;
    if (!row) {
      uncached.push(sense);
      continue;
    }
    if (await stillWithout(sense.id)) {
      await prisma.example.create({
        data: { senseId: sense.id, text: row.text, translation: row.translation, source: "AI" },
      });
      fromAi += 1;
    }
  }

  // ---- model, for what neither the dictionary nor the cache covered
  let aiBlocked: FillResult["aiBlocked"];
  for (let i = 0; i < uncached.length; i += AI_BATCH) {
    const batch = uncached.slice(i, i + AI_BATCH);
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
      max_tokens: 8000,
      system:
        "You write example sentences for a Korean vocabulary app. For each word, write one short, natural, everyday sentence (polite 해요체) that clearly shows its meaning, at a level a learner of that word can read. Give an English translation of the sentence. Use the word exactly in the meaning given.",
      messages: [
        {
          role: "user",
          content: batch
            .map((s) => `${s.entry.lemma} — ${s.translation ?? "?"}${s.entry.level ? ` (${s.entry.level})` : ""}`)
            .join("\n"),
        },
      ],
      output_config: { format: zodOutputFormat(ExampleSchema) },
    });
    await recordAiUsage(prisma, userId, unlimited, response.model, response.usage);
    if (response.stop_reason === "refusal") continue;

    const byLemma = new Map(
      (response.parsed_output?.examples ?? []).map((e) => [e.lemma.normalize("NFC").trim(), e]),
    );
    for (const sense of batch) {
      const generated = byLemma.get(sense.entry.lemma);
      if (!generated?.example.trim()) continue;
      const text = generated.example.normalize("NFC").trim().slice(0, 500);
      const translation = generated.translation.trim().slice(0, 500) || null;
      if (!(await stillWithout(sense.id))) continue;
      await prisma.example.create({
        data: { senseId: sense.id, text, translation, source: "AI" },
      });
      const key = meaningOf(sense);
      if (key) {
        await prisma.generatedExample
          .upsert({
            where: { lemma_meaning: { lemma: sense.entry.lemma, meaning: key } },
            create: { lemma: sense.entry.lemma, meaning: key, text, translation },
            update: {},
          })
          .catch(() => {}); // the cache is a bonus; never fail the fill over it
      }
      fromAi += 1;
    }
  }

  const remaining = await prisma.sense.count({
    where: { order: 0, examples: { none: {} }, entry: { userId } },
  });
  return { fromDictionary, fromAi, remaining, aiBlocked };
}
