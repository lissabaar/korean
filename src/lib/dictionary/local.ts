/**
 * The local copy of KRDict: the KrdictEntry table, loaded from the official
 * download by scripts/load-krdict.mts.
 *
 * Every lookup reads this first — no network, no rate limit, no "dictionary
 * not answering". The KRDict API is only used when the table has not been
 * loaded (a fresh database), or for languages other than English.
 *
 * Returns the same DictEntry shape as the API client (krdict.ts), so the rest
 * of the app does not know which one answered.
 */

import type { PrismaClient } from "@prisma/client";
import type { DictEntry, DictSense } from "./krdict";

/** Whether the table has data; checked once per server process. */
let loaded: Promise<boolean> | null = null;

function isLoaded(prisma: PrismaClient): Promise<boolean> {
  loaded ??= prisma.krdictEntry
    .findFirst({ select: { targetCode: true } })
    .then((row) => row !== null)
    .catch(() => false);
  return loaded;
}

interface Row {
  targetCode: string;
  lemma: string;
  homonym: number | null;
  partOfSpeech: string | null;
  level: string | null;
  origin: string | null;
  senses: unknown;
}

/** A table row as the app's DictEntry. "없음" (no level) becomes no level. */
function toEntry(row: Row): DictEntry {
  return {
    lemma: row.lemma,
    source: "KRDICT",
    targetCode: row.targetCode,
    originalForm: row.origin ?? undefined,
    partOfSpeech: row.partOfSpeech ?? undefined,
    level: row.level && row.level !== "없음" ? row.level : undefined,
    senses: (row.senses as DictSense[]).map((sense) => ({ ...sense, examples: sense.examples ?? [] })),
  };
}

/**
 * Every entry for this exact spelling, homographs in dictionary order — or
 * undefined when the local dictionary is not loaded (then the caller asks the
 * API). An empty array means the word is not in KRDict.
 */
export async function localLookup(prisma: PrismaClient, word: string): Promise<DictEntry[] | undefined> {
  return (await localLookupMany(prisma, [word]))?.get(word.normalize("NFC").trim());
}

/** Homographs in the dictionary's order: by homograph number, then code. */
const dictionaryOrder = (a: Row, b: Row) =>
  (a.homonym ?? 0) - (b.homonym ?? 0) || parseFloat(a.targetCode) - parseFloat(b.targetCode);

/**
 * Many words in one query (a whole import part): word → its entries ([] when
 * KRDict does not have it). Undefined when the local dictionary is not loaded.
 */
export async function localLookupMany(
  prisma: PrismaClient,
  words: string[],
): Promise<Map<string, DictEntry[]> | undefined> {
  if (!(await isLoaded(prisma))) return undefined;
  const clean = [...new Set(words.map((word) => word.normalize("NFC").trim()))];
  const rows = await prisma.krdictEntry.findMany({ where: { lemma: { in: clean } } });
  const result = new Map<string, DictEntry[]>(clean.map((word) => [word, []]));
  for (const row of rows.sort(dictionaryOrder)) result.get(row.lemma)?.push(toEntry(row));
  return result;
}

/** One entry by its KRDict code; undefined when the local dictionary is not loaded. */
export async function localEntry(prisma: PrismaClient, targetCode: string): Promise<DictEntry | null | undefined> {
  if (!(await isLoaded(prisma))) return undefined;
  const row = await prisma.krdictEntry.findUnique({ where: { targetCode } });
  return row ? toEntry(row) : null;
}
