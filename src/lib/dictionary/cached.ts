/**
 * Dictionary access through a shared cache, and the per-plan daily limit on
 * typed-in lookups.
 *
 * KRDict allows 50 000 requests a day per key — for the whole service. The
 * cache is shared by every user (dictionary data is not personal), so the
 * same word costs one request no matter how many people look it up.
 *
 *   found words     kept for good (a word's dictionary entry does not change
 *                   meaning; the owner asked for this)
 *   "no such word"  kept 7 days (dictionaries grow; a typo can look like it)
 *   unreachable     never kept — that says nothing about the word
 *
 * Batch lookups retry a word that got no answer (a few times, with pauses),
 * so a briefly overloaded KRDict does not push words into "check later" —
 * bounded by attempts per word, failures in a row and a time budget, so it
 * can never loop.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import {
  fetchExamples,
  lookup,
  DictionaryUnavailableError,
  type DictEntry,
  type DictionaryKeys,
  type LookupOptions,
} from "./krdict";

const DAY = 24 * 60 * 60 * 1000;
const EMPTY_TTL = 7 * DAY;

/**
 * A cached dictionary answer: a found one always, a "no such word" one for 7
 * days.
 */
async function readCache<T>(prisma: PrismaClient, key: string): Promise<T | undefined> {
  const row = await prisma.dictionaryCache.findUnique({ where: { key } });
  if (!row) return undefined;
  const value = row.value as unknown as T;
  const empty = Array.isArray(value) && value.length === 0;
  const age = Date.now() - row.fetchedAt.getTime();
  return !empty || age < EMPTY_TTL ? value : undefined;
}

/**
 * Store a dictionary answer. A failed write is only logged — it never breaks the
 * lookup.
 */
async function writeCache(prisma: PrismaClient, key: string, value: unknown): Promise<void> {
  const json = value as Prisma.InputJsonValue;
  await prisma.dictionaryCache
    .upsert({
      where: { key },
      create: { key, value: json },
      update: { value: json, fetchedAt: new Date() },
    })
    // A failed cache write must never fail the lookup itself.
    .catch((error) => console.warn("Dictionary cache write failed:", error));
}

/**
 * Look one word up: cache first, else KRDict (and store the answer). Throws
 * DictionaryUnavailableError when the dictionary does not answer — that is never
 * cached.
 */
export async function cachedLookup(
  prisma: PrismaClient,
  word: string,
  keys: DictionaryKeys,
  options: LookupOptions = {},
): Promise<DictEntry[]> {
  const key = `search:${options.transLang ?? 1}:${word}`;
  const hit = await readCache<DictEntry[]>(prisma, key);
  if (hit) return hit;
  const entries = await lookup(word, keys, options); // throws when unreachable
  await writeCache(prisma, key, entries);
  return entries;
}

/** Same contract as lookupMany: null for words no dictionary answered for. */
export async function cachedLookupMany(
  prisma: PrismaClient,
  words: string[],
  keys: DictionaryKeys,
  options: LookupOptions & { concurrency?: number; timeBudgetMs?: number } = {},
): Promise<Map<string, DictEntry[] | null>> {
  // KRDict throttles bursts: with 3 import parts in parallel, 6 lookups each
  // (18 at once) made it stop answering for minutes. 2 per part stays under.
  // The time budget leaves room in the 300 s function limit for the model
  // call that precedes the lookups.
  const { concurrency = 2, timeBudgetMs = 150_000, ...lookupOptions } = options;
  const results = new Map<string, DictEntry[] | null>();
  const queue = [...new Set(words)];
  const started = Date.now();

  // Three limits keep retrying bounded:
  //   MAX_ATTEMPTS  per word, with RETRY_WAIT_MS pauses in between
  //   BREAK_AFTER   words in a row that got no answer even after retrying —
  //                 then the dictionary counts as down for the rest of the
  //                 batch (cache hits still served, the rest marked
  //                 unreachable and checked later in the background)
  //   timeBudgetMs  for the whole batch: past it, no new requests
  const MAX_ATTEMPTS = 3;
  const RETRY_WAIT_MS = [1500, 4000];
  const BREAK_AFTER = 6;
  let failuresInARow = 0;
  const outOfTime = (extra = 0) => Date.now() - started + extra > timeBudgetMs;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /** One word: up to MAX_ATTEMPTS tries; null when the dictionary never answered. */
  async function lookUpWithRetries(word: string): Promise<DictEntry[] | null> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await cachedLookup(prisma, word, keys, lookupOptions);
      } catch (error) {
        if (!(error instanceof DictionaryUnavailableError)) throw error;
        const wait = RETRY_WAIT_MS[attempt - 1];
        const giveUp =
          attempt >= MAX_ATTEMPTS ||
          wait === undefined ||
          failuresInARow >= BREAK_AFTER ||
          outOfTime(wait) ||
          lookupOptions.signal?.aborted;
        if (giveUp) return null;
        await sleep(wait);
      }
    }
  }

  /**
   * One of the parallel workers: takes words from the shared queue until it is
   * empty.
   */
  async function worker(): Promise<void> {
    for (let word = queue.shift(); word !== undefined; word = queue.shift()) {
      if (failuresInARow >= BREAK_AFTER || outOfTime()) {
        const hit = await readCache<DictEntry[]>(prisma, `search:${lookupOptions.transLang ?? 1}:${word}`);
        results.set(word, hit ?? null);
        continue;
      }
      const found = await lookUpWithRetries(word);
      results.set(word, found);
      failuresInARow = found === null ? failuresInARow + 1 : 0;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return results;
}

/**
 * Example sentences for a KRDict entry (by target code), from the cache or the
 * view API.
 */
export async function cachedExamples(
  prisma: PrismaClient,
  targetCode: string,
  keys: DictionaryKeys,
): Promise<string[]> {
  const key = `examples:${targetCode}`;
  const hit = await readCache<string[]>(prisma, key);
  if (hit) return hit;
  const examples = await fetchExamples(targetCode, keys.krdict, { max: 3 });
  await writeCache(prisma, key, examples);
  return examples;
}

// ---------------------------------------------------------------- daily limit

export class LookupLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Daily dictionary limit of ${limit} lookups reached`);
  }
}

/** Midnight UTC of the current day — the key of the daily lookup counter. */
function today(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * How many typed-in dictionary lookups this user made today (imports do not
 * count).
 */
export async function lookupsToday(prisma: PrismaClient, userId: string): Promise<number> {
  const row = await prisma.dictionaryUsage.findUnique({
    where: { userId_day: { userId, day: today() } },
  });
  return row?.count ?? 0;
}

/**
 * Count one typed-in lookup against the user's plan, or throw when the day's
 * limit is reached. `limit` null = unlimited.
 */
export async function consumeLookup(
  prisma: PrismaClient,
  userId: string,
  limit: number | null,
): Promise<void> {
  if (limit === null) return;
  const day = today();
  const row = await prisma.dictionaryUsage.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, count: 1 },
    update: { count: { increment: 1 } },
  });
  if (row.count > limit) throw new LookupLimitError(limit);
}
