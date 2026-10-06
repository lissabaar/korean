/**
 * Dictionary access through a shared cache, and the per-plan daily limit on
 * typed-in lookups.
 *
 * KRDict allows 50 000 requests a day per key — for the whole service. The
 * cache is shared by every user (dictionary data is not personal), so the
 * same word costs one request no matter how many people look it up.
 *
 *   found words     kept 90 days (dictionaries change slowly)
 *   "no such word"  kept 7 days
 *   unreachable     never kept — that says nothing about the word
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
const FOUND_TTL = 90 * DAY;
const EMPTY_TTL = 7 * DAY;

async function readCache<T>(prisma: PrismaClient, key: string): Promise<T | undefined> {
  const row = await prisma.dictionaryCache.findUnique({ where: { key } });
  if (!row) return undefined;
  const value = row.value as unknown as T;
  const empty = Array.isArray(value) && value.length === 0;
  const age = Date.now() - row.fetchedAt.getTime();
  return age < (empty ? EMPTY_TTL : FOUND_TTL) ? value : undefined;
}

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
  options: LookupOptions & { concurrency?: number } = {},
): Promise<Map<string, DictEntry[] | null>> {
  // KRDict throttles bursts: with 3 import parts in parallel, 6 lookups each
  // (18 at once) made it stop answering for minutes. 2 per part stays under.
  const { concurrency = 2, ...lookupOptions } = options;
  const results = new Map<string, DictEntry[] | null>();
  const queue = [...new Set(words)];

  // Circuit breaker: after this many failures in a row the dictionary is
  // treated as down for the rest of the batch — the remaining words are
  // marked unreachable at once (cache hits still served) instead of each
  // waiting for its own timeout. "Check again" picks them up later.
  const BREAK_AFTER = 6;
  let failuresInARow = 0;

  async function worker(): Promise<void> {
    for (let word = queue.shift(); word !== undefined; word = queue.shift()) {
      if (failuresInARow >= BREAK_AFTER) {
        const hit = await readCache<DictEntry[]>(prisma, `search:${lookupOptions.transLang ?? 1}:${word}`);
        results.set(word, hit ?? null);
        continue;
      }
      try {
        results.set(word, await cachedLookup(prisma, word, keys, lookupOptions));
        failuresInARow = 0;
      } catch (error) {
        if (!(error instanceof DictionaryUnavailableError)) throw error;
        failuresInARow += 1;
        results.set(word, null);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return results;
}

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

function today(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

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
