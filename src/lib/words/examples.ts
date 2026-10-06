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
import { fetchExamples, type DictionaryKeys } from "../dictionary/krdict";
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
          found = await fetchExamples(code, keys.krdict, { max: 2 });
        } catch {
          // Unreachable dictionary: leave the word for the next run rather
          // than spending AI on something the dictionary probably has.
          continue;
        }
      }
      if (found.length) {
        await prisma.example.createMany({
          data: found.map((text) => ({ senseId: sense.id, text, source: "KRDICT" as const })),
        });
        fromDictionary += 1;
      } else {
        needAi.push(sense);
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  // ---- model, for what the dictionary could not cover
  let fromAi = 0;
  let aiBlocked: FillResult["aiBlocked"];
  for (let i = 0; i < needAi.length; i += AI_BATCH) {
    const batch = needAi.slice(i, i + AI_BATCH);
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
    await recordAiUsage(prisma, userId, unlimited, EXTRACTION_MODEL, response.usage);

    const byLemma = new Map(
      (response.parsed_output?.examples ?? []).map((e) => [e.lemma.normalize("NFC").trim(), e]),
    );
    for (const sense of batch) {
      const generated = byLemma.get(sense.entry.lemma);
      if (!generated?.example.trim()) continue;
      await prisma.example.create({
        data: {
          senseId: sense.id,
          text: generated.example.normalize("NFC").trim().slice(0, 500),
          translation: generated.translation.trim().slice(0, 500) || null,
          source: "AI",
        },
      });
      fromAi += 1;
    }
  }

  const remaining = await prisma.sense.count({
    where: { order: 0, examples: { none: {} }, entry: { userId } },
  });
  return { fromDictionary, fromAi, remaining, aiBlocked };
}
