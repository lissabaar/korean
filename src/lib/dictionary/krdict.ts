/**
 * Dictionary client for the Korean national dictionaries.
 *
 * Three sources, tried in order:
 *   KRDICT   (한국어기초사전) — learner's dictionary. Graded by level, has
 *                              translations in 11 languages. First choice.
 *   STDICT   (표준국어대사전) — the normative dictionary. Deeper definitions,
 *                              monolingual. Used when KRDict has no entry.
 *   OPENDICT (우리말샘)       — crowd-extended. Catches slang and new words.
 *
 * All three are free, keyed by email, and allow 50,000 requests per day.
 * All three answer in XML.
 *
 * NOTE: the exact element names below are written from the published API
 * docs and must be checked against a live response once a key is issued —
 * the schemas differ slightly between the three services. Parsing is
 * deliberately defensive so an unexpected shape yields a partial entry
 * rather than a crash.
 */

import { XMLParser } from "fast-xml-parser";

/**
 * Parsed XML has no static shape — every field may be missing, a string, or
 * an object. Field access is guarded by `text()` and `asArray()` instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XmlNode = Record<string, any>;

const KRDICT_URL = "https://krdict.korean.go.kr/api/search";
const KRDICT_VIEW_URL = "https://krdict.korean.go.kr/api/view";
const STDICT_URL = "https://stdict.korean.go.kr/api/search.do";

/** trans_lang codes as defined by the KRDict API. */
export const TRANS_LANG = {
  ALL: 0,
  EN: 1,
  JA: 2,
  FR: 3,
  ES: 4,
  AR: 5,
  MN: 6,
  VI: 7,
  TH: 8,
  ID: 9,
  RU: 10,
  ZH: 11,
} as const;

export type TransLang = (typeof TRANS_LANG)[keyof typeof TRANS_LANG];

export type DictSource = "KRDICT" | "STDICT" | "OPENDICT";

export interface DictSense {
  definition: string;
  translation?: string;
  translatedDefinition?: string;
  examples: string[];
}

export interface DictEntry {
  lemma: string;
  source: DictSource;
  targetCode?: string;
  /** Sino-Korean origin as given by the dictionary, e.g. 學生. */
  originalForm?: string;
  partOfSpeech?: string;
  /** Learner level: 초급 / 중급 / 고급. KRDict only. */
  level?: string;
  senses: DictSense[];
}

export class DictionaryError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "DictionaryError";
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
  // Without this a single <sense> parses as an object and several as an
  // array, so every consumer needs a type check. Forcing the common
  // repeated nodes to arrays keeps the mapping code uniform.
  isArray: (name) =>
    ["item", "sense", "example", "translation", "sense_info", "example_info"].includes(name),
});

/** Pull a value out of a parsed node regardless of nesting quirks. */
function text(node: unknown): string | undefined {
  if (node === undefined || node === null) return undefined;
  if (typeof node === "string") return node.trim() || undefined;
  if (typeof node === "number") return String(node);
  if (typeof node === "object" && "#text" in (node as Record<string, unknown>)) {
    return text((node as Record<string, unknown>)["#text"]);
  }
  return undefined;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

interface FetchOptions {
  signal?: AbortSignal;
}

async function fetchXml(url: string, options: FetchOptions = {}): Promise<unknown> {
  const response = await fetch(url, {
    signal: options.signal,
    // Dictionary content changes rarely; letting Next cache it keeps us far
    // below the daily quota even with repeated lookups of common words.
    next: { revalidate: 60 * 60 * 24 * 30 },
  });

  if (!response.ok) {
    throw new DictionaryError(`Dictionary request failed: ${response.status}`);
  }

  const body = await response.text();
  const parsed = parser.parse(body);

  // Errors come back as a document with <error_code>, not as an HTTP status.
  const error = (parsed as XmlNode)?.error;
  if (error) {
    const code = text(error.error_code);
    const message = text(error.message) ?? "Dictionary error";
    if (code === "010" || code === "022") {
      throw new DictionaryError("Daily dictionary quota exhausted", code);
    }
    throw new DictionaryError(message, code);
  }

  return parsed;
}

function mapKrdictItem(item: XmlNode): DictEntry {
  const senses: DictSense[] = asArray(item.sense).map((sense: XmlNode) => {
    const translations = asArray(sense.translation);
    const first = translations[0] ?? {};
    return {
      definition: text(sense.definition) ?? "",
      translation: text(first.trans_word),
      translatedDefinition: text(first.trans_dfn),
      examples: asArray(sense.example)
        .map((example: XmlNode) => text(example.example) ?? text(example))
        .filter((value): value is string => Boolean(value)),
    };
  });

  return {
    lemma: text(item.word) ?? "",
    source: "KRDICT",
    targetCode: text(item.target_code),
    originalForm: text(item.origin),
    partOfSpeech: text(item.pos),
    level: text(item.word_grade),
    senses: senses.filter((sense) => sense.definition),
  };
}

export interface LookupOptions {
  /** Language the translations come back in. */
  transLang?: TransLang;
  signal?: AbortSignal;
}

export async function lookupKrdict(
  word: string,
  apiKey: string,
  options: LookupOptions = {},
): Promise<DictEntry[]> {
  const { transLang = TRANS_LANG.EN } = options;

  const url = new URL(KRDICT_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", word);
  url.searchParams.set("translated", "y");
  url.searchParams.set("trans_lang", String(transLang));
  url.searchParams.set("advanced", "y");
  // Exact match only. Substring matching floods the result with compounds
  // that happen to contain the word, and the caller already knows the lemma.
  url.searchParams.set("method", "exact");

  const parsed = (await fetchXml(url.toString(), options)) as XmlNode;
  const items = asArray(parsed?.channel?.item);

  return items.map(mapKrdictItem).filter((entry) => entry.lemma);
}

export async function lookupStdict(
  word: string,
  apiKey: string,
  options: LookupOptions = {},
): Promise<DictEntry[]> {
  const url = new URL(STDICT_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", word);
  url.searchParams.set("req_type", "xml");

  const parsed = (await fetchXml(url.toString(), options)) as XmlNode;
  const items = asArray(parsed?.channel?.item);

  return items.map((item: XmlNode) => ({
    lemma: text(item.word) ?? "",
    source: "STDICT" as const,
    targetCode: text(item.target_code),
    originalForm: text(item.origin),
    partOfSpeech: text(item.pos),
    senses: asArray(item.sense).map((sense: XmlNode) => ({
      definition: text(sense.definition) ?? "",
      examples: [],
    })),
  }));
}

/**
 * Example sentences for one KRDict entry, from the view API — the search
 * API returns none. Full sentences (문장) first, then phrases (구);
 * dialogues (대화) are skipped as they do not read well on a card.
 *
 * Verified against a live response: item > word_info > sense_info[] >
 * example_info[] > { type, example }.
 */
export async function fetchExamples(
  targetCode: string,
  apiKey: string,
  options: { senseIndex?: number; max?: number; signal?: AbortSignal } = {},
): Promise<string[]> {
  const { senseIndex = 0, max = 3 } = options;
  const url = new URL(KRDICT_VIEW_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("method", "target_code");
  url.searchParams.set("q", targetCode);

  const parsed = (await fetchXml(url.toString(), options)) as XmlNode;
  const item = asArray(parsed?.channel?.item)[0] as XmlNode | undefined;
  const sense = asArray(item?.word_info?.sense_info)[senseIndex] as XmlNode | undefined;
  const examples = asArray(sense?.example_info) as XmlNode[];

  const byType = (type: string) =>
    examples
      .filter((example) => text(example.type) === type)
      // "example" is parsed as an array everywhere (the search API repeats it).
      .map((example) => text(asArray(example.example)[0]))
      .filter((value): value is string => Boolean(value));

  return [...byType("문장"), ...byType("구")].slice(0, max);
}

export interface DictionaryKeys {
  krdict: string;
  stdict?: string;
  opendict?: string;
}

/** Every source failed to answer — distinct from "answered: no such word". */
export class DictionaryUnavailableError extends Error {}

/** Network hiccups are common on these services; one retry clears most. */
async function withRetry<T>(call: () => Promise<T>, retries = 1): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (error) {
      // An API-level error (bad key, quota) will not fix itself on retry.
      if (error instanceof DictionaryError || attempt >= retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}

/**
 * Look a word up across all configured sources, stopping at the first hit.
 *
 * A miss here is meaningful: if none of the national dictionaries knows the
 * lemma, the lemma is almost certainly wrong — which is how bad
 * morphological analysis gets caught before it reaches a card. That is only
 * true when a dictionary actually answered, so a source that could not be
 * reached never counts as a miss: if none answered, this throws
 * DictionaryUnavailableError instead of returning an empty list.
 */
export async function lookup(
  word: string,
  keys: DictionaryKeys,
  options: LookupOptions = {},
): Promise<DictEntry[]> {
  const attempts: Array<() => Promise<DictEntry[]>> = [
    () => lookupKrdict(word, keys.krdict, options),
  ];

  if (keys.stdict) {
    attempts.push(() => lookupStdict(word, keys.stdict!, options));
  }

  let lastError: unknown;
  let anyAnswered = false;
  for (const attempt of attempts) {
    try {
      const entries = await withRetry(attempt);
      anyAnswered = true;
      if (entries.length > 0) return entries;
    } catch (error) {
      // A quota error will hit every source, so stop rather than burn
      // the remaining calls.
      if (error instanceof DictionaryError && error.code === "010") throw error;
      lastError = error;
    }
  }

  if (!anyAnswered) {
    console.warn(`Dictionary lookup failed for "${word}":`, lastError);
    throw new DictionaryUnavailableError(`No dictionary answered for "${word}"`, {
      cause: lastError,
    });
  }
  return [];
}

/**
 * Look up many words with bounded concurrency.
 *
 * The daily quota is generous but the services are not fast, and firing
 * sixty parallel requests at a government API is a good way to get a key
 * suspended.
 *
 * Maps each word to its entries, or to null when no dictionary could be
 * reached for it.
 */
export async function lookupMany(
  words: string[],
  keys: DictionaryKeys,
  options: LookupOptions & { concurrency?: number } = {},
): Promise<Map<string, DictEntry[] | null>> {
  const { concurrency = 4 } = options;
  const results = new Map<string, DictEntry[] | null>();
  const queue = [...new Set(words)];

  async function worker(): Promise<void> {
    for (;;) {
      const word = queue.shift();
      if (word === undefined) return;
      try {
        results.set(word, await lookup(word, keys, options));
      } catch (error) {
        if (!(error instanceof DictionaryUnavailableError)) throw error;
        results.set(word, null);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, worker),
  );

  return results;
}
