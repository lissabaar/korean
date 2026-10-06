/**
 * Filling in the English meaning for saved words that have only the user's
 * own (typed in Russian, imported from a list, or saved while the
 * dictionary was not answering).
 *
 * Dictionary first: a word that already has its KRDict entry gets the
 * entry's English meaning, free. The rest go to the model in batches — it
 * reads the Korean word together with the user's own meaning — and its
 * reading is then checked against the dictionary: if the dictionary knows
 * the word, its data is used; only otherwise is the model's English kept
 * (source AI). The user's own meaning is never touched.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { AiQuotaError, assertCanUseAi, recordAiUsage } from "../ai-budget";
import { cachedLookup } from "../dictionary/cached";
import { DictionaryUnavailableError, TRANS_LANG, type DictionaryKeys } from "../dictionary/krdict";
import { rankHomographs } from "../ingest/analyze";
import { EXTRACTION_MODEL } from "../ingest/extract";

const MAX_PER_RUN = 60;
const AI_BATCH = 30;

const MeaningSchema = z.object({
  items: z.array(
    z.object({
      lemma: z.string(),
      english: z.string(),
      gloss: z.string(),
    }),
  ),
});

export interface MeaningFillResult {
  fromDictionary: number;
  fromAi: number;
  remaining: number;
  aiBlocked?: "anonymous" | "user" | "daily";
}

export async function fillEnglishMeanings(
  prisma: PrismaClient,
  anthropic: Anthropic,
  keys: DictionaryKeys,
  userId: string,
): Promise<MeaningFillResult> {
  const where = { order: 0, translation: null, entry: { userId } };
  const senses = await prisma.sense.findMany({
    where,
    select: {
      id: true,
      userMeaning: true,
      definitionTarget: true,
      entry: { select: { id: true, lemma: true, krdictTargetCode: true } },
    },
    take: MAX_PER_RUN,
  });

  let fromDictionary = 0;
  let fromAi = 0;
  const needAi: typeof senses = [];

  // ---- 1. words that already know their dictionary entry
  for (const sense of senses) {
    const code = sense.entry.krdictTargetCode;
    if (!code || !/^\d+$/.test(code)) {
      needAi.push(sense);
      continue;
    }
    try {
      const entries = await cachedLookup(prisma, sense.entry.lemma, keys, { transLang: TRANS_LANG.EN });
      const match = entries.find((entry) => entry.targetCode === code);
      const translation = match?.senses[0]?.translation;
      if (!translation) {
        needAi.push(sense);
        continue;
      }
      await prisma.sense.update({
        where: { id: sense.id },
        data: {
          translation,
          definitionTarget: sense.definitionTarget ?? match.senses[0]?.definition ?? null,
          definitionKnown: match.senses[0]?.translatedDefinition ?? undefined,
        },
      });
      fromDictionary += 1;
    } catch (error) {
      if (!(error instanceof DictionaryUnavailableError)) throw error;
      // Left for the next run — no point spending AI on what the dictionary has.
    }
  }

  // ---- 2. the model reads word + user's meaning; the dictionary checks it
  let aiBlocked: MeaningFillResult["aiBlocked"];
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
      max_tokens: 4000,
      system:
        "You give the English meaning of Korean vocabulary for a learning app. Each line is a Korean word or phrase, often followed by the learner's own meaning in another language. For each, return: lemma (copied exactly), english — a short, card-sized English meaning of 1 to 6 words, in the sense the learner meant (if their meaning is clearly wrong for the word, give the correct one), and gloss — the same meaning in one or two plain English words.",
      messages: [
        {
          role: "user",
          content: batch
            .map((s) => (s.userMeaning ? `${s.entry.lemma} — ${s.userMeaning}` : s.entry.lemma))
            .join("\n"),
        },
      ],
      output_config: { format: zodOutputFormat(MeaningSchema) },
    });
    await recordAiUsage(prisma, userId, unlimited, response.model, response.usage);
    if (response.stop_reason === "refusal" || !response.parsed_output) continue;

    const byLemma = new Map(
      response.parsed_output.items.map((item) => [item.lemma.normalize("NFC").trim(), item]),
    );
    for (const sense of batch) {
      const item = byLemma.get(sense.entry.lemma);
      if (!item?.english.trim()) continue;

      // Does the dictionary know the word in this meaning? Then its data wins.
      let dictionary = null;
      try {
        const entries = await cachedLookup(prisma, sense.entry.lemma, keys, { transLang: TRANS_LANG.EN });
        dictionary = rankHomographs(entries, item.gloss, item.english)[0] ?? null;
      } catch (error) {
        if (!(error instanceof DictionaryUnavailableError)) throw error;
      }

      if (dictionary?.senses[0]?.translation) {
        await prisma.$transaction([
          prisma.sense.update({
            where: { id: sense.id },
            data: {
              translation: dictionary.senses[0].translation,
              definitionTarget: sense.definitionTarget ?? dictionary.senses[0].definition ?? null,
              definitionKnown: dictionary.senses[0].translatedDefinition ?? undefined,
              definitionSource: "KRDICT",
            },
          }),
          prisma.entry.update({
            where: { id: sense.entry.id },
            data: {
              krdictTargetCode: dictionary.targetCode ?? null,
              level: dictionary.level ?? undefined,
              partOfSpeech: dictionary.partOfSpeech ?? undefined,
              originalForm: dictionary.originalForm ?? undefined,
              source: "KRDICT",
            },
          }),
        ]);
        fromDictionary += 1;
      } else {
        await prisma.sense.update({
          where: { id: sense.id },
          data: { translation: item.english.trim().slice(0, 200) },
        });
        fromAi += 1;
      }
    }
  }

  const remaining = await prisma.sense.count({ where });
  return { fromDictionary, fromAi, remaining, aiBlocked };
}
