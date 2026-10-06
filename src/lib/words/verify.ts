/**
 * Background check of words saved while the dictionary was not answering
 * (Entry.needsCheck). Runs after an import and whenever the app is opened —
 * the user never has to tick or review anything for it.
 *
 *   dictionary knows the word → its entry replaces the AI placeholder data
 *                                (the user's own meaning is kept)
 *   dictionary says "no such"  → the AI meaning stays; the check is done
 *   dictionary still silent    → left for the next run
 *
 * No AI involved, so it costs no credits.
 */

import type { PrismaClient } from "@prisma/client";
import { cachedLookupMany } from "../dictionary/cached";
import { TRANS_LANG, type DictionaryKeys } from "../dictionary/krdict";
import { rankHomographs } from "../ingest/analyze";

const PER_RUN = 40;

export interface VerifyResult {
  confirmed: number;
  notInDictionary: number;
  remaining: number;
}

/**
 * Check up to 40 needsCheck words against the dictionary: found → dictionary
 * data replaces the placeholder; not in the dictionary → kept with the AI
 * meaning; still no answer → left for next time.
 */
export async function verifyPending(
  prisma: PrismaClient,
  keys: DictionaryKeys,
  userId: string,
): Promise<VerifyResult> {
  const pending = await prisma.entry.findMany({
    where: { userId, needsCheck: true },
    select: {
      id: true,
      lemma: true,
      senses: {
        where: { order: 0 },
        take: 1,
        select: { id: true, translation: true, userMeaning: true, definitionTarget: true },
      },
    },
    take: PER_RUN,
  });

  let confirmed = 0;
  let notInDictionary = 0;
  if (pending.length) {
    const found = await cachedLookupMany(
      prisma,
      pending.map((entry) => entry.lemma),
      keys,
      { transLang: TRANS_LANG.EN },
    );

    for (const entry of pending) {
      const entries = found.get(entry.lemma);
      if (entries === null || entries === undefined) continue; // still silent
      const sense = entry.senses[0];

      if (entries.length === 0) {
        await prisma.entry.update({ where: { id: entry.id }, data: { needsCheck: false } });
        notInDictionary += 1;
        continue;
      }

      // The AI English meaning saved with the word picks the homograph.
      const best = rankHomographs(entries, sense?.translation ?? "", sense?.userMeaning ?? "")[0];
      const first = best.senses[0];
      await prisma.$transaction([
        prisma.entry.update({
          where: { id: entry.id },
          data: {
            needsCheck: false,
            source: "KRDICT",
            krdictTargetCode: best.targetCode ?? null,
            level: best.level ?? null,
            partOfSpeech: best.partOfSpeech ?? null,
            originalForm: best.originalForm ?? null,
          },
        }),
        ...(sense && first
          ? [
              prisma.sense.update({
                where: { id: sense.id },
                data: {
                  translation: first.translation ?? sense.translation,
                  definitionTarget: sense.definitionTarget ?? first.definition ?? null,
                  definitionKnown: first.translatedDefinition ?? undefined,
                  definitionSource: "KRDICT",
                },
              }),
            ]
          : []),
      ]);
      confirmed += 1;
    }
  }

  const remaining = await prisma.entry.count({ where: { userId, needsCheck: true } });
  return { confirmed, notInDictionary, remaining };
}
