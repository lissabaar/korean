/**
 * Analysis stage: text in, candidate words out. Writes nothing.
 *
 * Split from persistence so the user can see what the model and dictionary
 * produced and fix it before anything reaches the deck. Correcting a wrong
 * category in a preview is trivial; finding it three weeks later among two
 * hundred entries is not.
 */

import type Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";
import { cachedLookupMany } from "../dictionary/cached";
import {
  type DictEntry,
  type DictionaryKeys,
  TRANS_LANG,
  type TransLang,
} from "../dictionary/krdict";
import { recordAiUsage } from "../ai-budget";
import { extractWords, type ExtractSource } from "./extract";
import { resolveCategories } from "./categories";

/**
 * new         — the dictionary knows it; its data is used
 * ai          — the dictionary answered and does not know it (a phrase, a
 *               compound, a rare word): the model's meaning is used, marked AI
 * unreachable — no dictionary answered at all; the AI meaning is on offer,
 *               but trying again is usually better
 * duplicate   — already in the user's words
 */
export type CandidateStatus = "new" | "duplicate" | "ai" | "unreachable";

export interface WordCandidate {
  /** Stable within one analysis, used as a React key and in the commit call. */
  id: string;
  lemma: string;
  surface: string;
  sentence: string;
  contextNote: string;
  /** The model's short English reading — used to rank homographs, also on a recheck. */
  gloss: string;
  register: string | null;

  primaryCategory: string;
  secondaryCategories: string[];

  status: CandidateStatus;

  /** Null when no dictionary recognised the lemma. */
  dictionary: DictEntry | null;
  /**
   * Every entry the dictionary has for this spelling, best match first.
   * More than one means homographs (공원: 公園 park, 工員 worker); the
   * preview lets the user switch if the automatic pick is wrong.
   */
  homographs: DictEntry[];
  /** Single word or a phrase/sentence learned whole. */
  kind: "word" | "phrase";
  /** The model's English meaning — used only when there is no dictionary entry. */
  aiMeaning: string;
  /** The meaning the user wrote in the input; it wins unless they choose otherwise. */
  userMeaning: string;
  /**
   * Where the user's input and the dictionary disagree:
   *   meaning  — their meaning matches none of the dictionary entry's senses
   *   spelling — their spelling was wrong; the lemma is the corrected form
   */
  conflict: "meaning" | "spelling" | null;
  /** Set by the user on a meaning conflict: replace their meaning with the dictionary's. */
  useDictionaryMeaning: boolean;

  /** Pre-ticked for everything the user is likely to want. */
  selected: boolean;

  /** Set once the user changes a category, so it is not stored as AI-assigned. */
  edited?: boolean;
}

export interface AnalysisResult {
  /** The analysed text; empty for an image. */
  text: string;
  /**
   * The category the learner asked for in their note or request ("put
   * these in drama"); empty when none. Every candidate is already in it,
   * and the category gets locked when the words are saved.
   */
  requestedCategory: string;
  candidates: WordCandidate[];
  stats: {
    total: number;
    verified: number;
    duplicates: number;
    /** Kept with an AI meaning: the dictionary does not have them. */
    aiOnly: number;
    unreachable: number;
  };
}

const EXPLANATION_LANG: Record<string, TransLang> = {
  EN: TRANS_LANG.EN,
  RU: TRANS_LANG.RU,
};

export interface AnalyzeOptions {
  userId: string;
  source: ExtractSource;
  /** Whether this user's AI spend counts towards the shared daily budget. */
  unlimitedAi: boolean;
  /** Also keep phrases and sentences, not just words. */
  phrases?: boolean;
  maxWords?: number;
  signal?: AbortSignal;
}

/**
 * The whole analysis of one part: the model extracts lemmas → usage is recorded
 * → every lemma is looked up in the dictionary (through the cache) → each
 * becomes a WordCandidate with a status (new, duplicate, ai, unreachable) and a
 * pre-selected homograph. Saves nothing.
 */
export async function analyzeText(
  prisma: PrismaClient,
  anthropic: Anthropic,
  keys: DictionaryKeys,
  options: AnalyzeOptions,
): Promise<AnalysisResult> {
  const { userId, source, unlimitedAi, phrases = false, maxWords = 40, signal } = options;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { explanationLang: true },
  });

  // Only categories the user made or uses by choice: ones the model created
  // itself in the past (every link AI-assigned) are not offered again.
  const existingCategories = await prisma.category.findMany({
    where: {
      userId,
      language: "KO",
      OR: [{ entries: { none: {} } }, { entries: { some: { assignedByAi: false } } }],
    },
    select: { name: true },
  });
  const allowedOwn = new Set(existingCategories.map((category) => category.name));

  const extraction = await extractWords(source, anthropic, {
    maxWords,
    phrases,
    existingCategories: existingCategories.map((category) => category.name),
    signal,
  });
  // Recorded straight away: the money is spent even if the dictionary
  // step below fails.
  await recordAiUsage(prisma, userId, unlimitedAi, extraction.model, extraction.usage);
  const extracted = extraction.words;

  const transLang = EXPLANATION_LANG[user.explanationLang] ?? TRANS_LANG.EN;
  const dictionary = await cachedLookupMany(
    prisma,
    extracted.map((word) => word.lemma),
    keys,
    { transLang, signal },
  );

  const existing = await prisma.entry.findMany({
    where: { userId, language: "KO", lemma: { in: extracted.map((w) => w.lemma) } },
    select: { lemma: true, krdictTargetCode: true },
  });
  // A known word is the same lemma *and* the same dictionary entry, so a
  // second homograph (공원 park after 공원 worker) still counts as new.
  const isKnown = (lemma: string, targetCode: string | undefined) =>
    existing.some(
      (entry) =>
        entry.lemma === lemma &&
        (!entry.krdictTargetCode || !targetCode || entry.krdictTargetCode === targetCode),
    );

  const candidates: WordCandidate[] = extracted.map((word, index) => {
    const found = dictionary.get(word.lemma);
    const homographs = rankHomographs(found ?? [], word.gloss, word.contextNote, word.userMeaning);
    const dictEntry = homographs[0] ?? null;
    // A category the learner asked for wins over the model's per-word pick.
    const { primary, secondary } = extraction.requestedCategory
      ? { primary: extraction.requestedCategory, secondary: [] }
      : allowedOwn.has(word.category)
        ? { primary: word.category, secondary: [] }
        : resolveCategories([word.category], { maxSecondary: 0 });

    const status: CandidateStatus = isKnown(word.lemma, dictEntry?.targetCode)
      ? "duplicate"
      : found === null
        ? "unreachable"
        : dictEntry === null
          ? "ai"
          : "new";

    return {
      id: `${index}-${word.lemma}`,
      lemma: word.lemma,
      surface: word.surface,
      sentence: word.sentence,
      contextNote: word.contextNote,
      gloss: word.gloss,
      register: word.register ?? null,
      primaryCategory: primary,
      secondaryCategories: secondary,
      status,
      dictionary: dictEntry,
      homographs,
      kind: word.kind,
      aiMeaning: word.meaning.trim(),
      userMeaning: word.userMeaning.trim(),
      // The model judges whether the user's meaning fits the word — word
      // overlap cannot, as it reads the user's meaning charitably.
      conflict:
        word.userMeaning.trim() && !word.userMeaningFits
          ? "meaning"
          : word.misspelled && word.surface !== word.lemma
            ? "spelling"
            : null,
      useDictionaryMeaning: false,
      // Duplicates stay off: already being learned.
      selected:
        status === "new" ||
        (status === "ai" && Boolean(word.meaning.trim() || word.userMeaning.trim())) ||
        // Unreachable: kept rather than lost — with the user's meaning or
        // the AI one; "Check again" can still bring in dictionary data.
        (status === "unreachable" && Boolean(word.userMeaning.trim() || word.meaning.trim())),
    };
  });

  return {
    text: source.kind === "text" ? source.text : "",
    requestedCategory: extraction.requestedCategory,
    candidates,
    stats: {
      total: candidates.length,
      verified: candidates.filter((c) => c.status === "new").length,
      duplicates: candidates.filter((c) => c.status === "duplicate").length,
      aiOnly: candidates.filter((c) => c.status === "ai").length,
      unreachable: candidates.filter((c) => c.status === "unreachable").length,
    },
  };
}

const STOPWORDS = new Set([
  "a", "an", "the", "to", "of", "in", "on", "for", "and", "or", "be", "is", "it", "this", "that", "here", "used", "meaning", "word", "as", "with", "by",
  // Russian: learners often write their meaning in Russian, and the local
  // dictionary has Russian translations to compare it with.
  "на", "из", "по", "для", "от", "до", "что", "как", "это", "быть", "не", "или", "кто", "чем",
]);

/**
 * Lowercase English words without filler words — used to compare the model's
 * gloss with dictionary translations.
 */
function words(text: string | undefined | null): string[] {
  return (text ?? "")
    .toLowerCase()
    // Latin and Cyrillic words (ё folded into е, as dictionaries vary).
    .replace(/ё/g, "е")
    .split(/[^a-zа-я]+/)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/** Points for words of `text` found among the evidence: strong 3, weak 1. */
function overlap(text: string | undefined, strong: Set<string>, weak: Set<string>): number {
  let points = 0;
  for (const word of new Set(words(text))) {
    if (strong.has(word)) points += 3;
    else if (weak.has(word)) points += 1;
  }
  return points;
}

/**
 * How well one dictionary sense matches what is known about the meaning
 * meant (strong: the model's gloss and the user's own meaning; weak: the
 * context note). The sense's translation is what counts; its English
 * definition only decides when no translation matches at all — definitions
 * are long and match common words by chance.
 */
function senseScore(sense: DictEntry["senses"][number], strong: Set<string>, weak: Set<string>) {
  return {
    translation: overlap(`${sense.translation ?? ""} ${sense.translationRu ?? ""}`, strong, weak),
    definition: overlap(sense.translatedDefinition, strong, weak),
  };
}

/**
 * Which sense of an entry is meant: the first sense with the best-matching
 * translation; if no translation matches, the first with the best-matching
 * definition; with no evidence at all, the first sense (the dictionary's
 * main one). Ties keep the dictionary's order. Exported for the repair of
 * words saved before senses were picked.
 */
export function bestSenseIndex(entry: DictEntry, strong: Set<string>, weak: Set<string>): number {
  const scores = entry.senses.map((sense) => senseScore(sense, strong, weak));
  const pick = (key: "translation" | "definition") => {
    const max = Math.max(0, ...scores.map((score) => score[key]));
    return max > 0 ? scores.findIndex((score) => score[key] === max) : -1;
  };
  const byTranslation = pick("translation");
  if (byTranslation >= 0) return byTranslation;
  const byDefinition = pick("definition");
  return byDefinition >= 0 ? byDefinition : 0;
}

/**
 * Order homographs by how well their senses match the meaning meant, and
 * within each entry move the matching sense to the front — the first sense
 * is the one that gets cards (놓다 has 27 senses: "let go" first, "put;
 * place" ninth; a list saying "놓다 — класть" means the ninth).
 *
 * The evidence: the model's gloss (based on the user's meaning when they
 * wrote one, else on the context), the user's own meaning, and the context
 * note. The model never supplies the meaning itself — it only says which of
 * the dictionary's own senses was meant. With no evidence the dictionary's
 * order stands (its main sense first). Ties keep the dictionary's order.
 */
export function rankHomographs(
  entries: DictEntry[],
  gloss: string,
  contextNote: string,
  userMeaning = "",
): DictEntry[] {
  const strong = new Set([...words(gloss), ...words(userMeaning)]);
  const weak = new Set(words(contextNote));

  return entries
    .map((entry, index) => {
      const best = bestSenseIndex(entry, strong, weak);
      // Homographs are ranked by their best sense: translation matches first.
      const score = entry.senses.length ? senseScore(entry.senses[best], strong, weak) : null;
      const points = score ? score.translation * 100 + score.definition : 0;
      const senses = best === 0 ? entry.senses : [entry.senses[best], ...entry.senses.filter((_, i) => i !== best)];
      return { entry: { ...entry, senses }, index, points };
    })
    .sort((a, b) => b.points - a.points || a.index - b.index)
    .map(({ entry }) => entry);
}

export interface RecheckItem {
  id: string;
  lemma: string;
  gloss: string;
  contextNote: string;
}

export interface RecheckResult {
  id: string;
  status: CandidateStatus;
  dictionary: DictEntry | null;
  homographs: DictEntry[];
}

/**
 * Ask the dictionary again about words it did not answer for the first
 * time — no model call, so it costs no AI credits. Words it still cannot
 * reach come back as "unreachable".
 */
export async function recheckDictionary(
  prisma: PrismaClient,
  keys: DictionaryKeys,
  userId: string,
  items: RecheckItem[],
): Promise<RecheckResult[]> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { explanationLang: true },
  });
  const transLang = EXPLANATION_LANG[user.explanationLang] ?? TRANS_LANG.EN;
  const found = await cachedLookupMany(prisma, items.map((item) => item.lemma), keys, { transLang });
  const existing = await prisma.entry.findMany({
    where: { userId, language: "KO", lemma: { in: items.map((item) => item.lemma) } },
    select: { lemma: true, krdictTargetCode: true },
  });

  return items.map((item) => {
    const entries = found.get(item.lemma);
    if (entries === null || entries === undefined) {
      return { id: item.id, status: "unreachable", dictionary: null, homographs: [] };
    }
    const homographs = rankHomographs(entries, item.gloss, item.contextNote);
    const dictionary = homographs[0] ?? null;
    const known = existing.some(
      (entry) =>
        entry.lemma === item.lemma &&
        (!entry.krdictTargetCode || !dictionary?.targetCode || entry.krdictTargetCode === dictionary.targetCode),
    );
    return {
      id: item.id,
      status: known ? "duplicate" : dictionary ? "new" : "ai",
      dictionary,
      homographs,
    };
  });
}
