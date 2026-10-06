/**
 * Building the wrong options for a multiple-choice question.
 *
 * This is the part that decides whether the exercise is worth anything.
 * Random distractors can be eliminated on general sense without knowing the
 * word, so the question tests nothing. Good distractors are plausible: same
 * category, related meaning, or words the user has actually confused before.
 *
 * Priority order, best first:
 *   1. CONFUSABLE — the user has flagged these two as getting mixed up
 *   2. SYNONYM / related — forces an actual distinction
 *   3. same category — same topic, so the general sense is no help
 *   4. same part of speech — weak, but better than nothing
 *   5. anything else in the deck — last resort
 */

export interface DistractorCandidate {
  senseId: string;
  entryId: string;
  text: string;
  categoryIds: string[];
  partOfSpeech: string | null;
  /** Relation to the target entry, if any. */
  relation: "CONFUSABLE" | "SYNONYM" | "ANTONYM" | null;
}

export interface DistractorTarget {
  senseId: string;
  entryId: string;
  text: string;
  categoryIds: string[];
  partOfSpeech: string | null;
}

const TIER_CONFUSABLE = 0;
const TIER_RELATED = 1;
const TIER_CATEGORY = 2;
const TIER_POS = 3;
const TIER_FALLBACK = 4;

/**
 * How good a wrong option this word is for the target — lower is better: a
 * confusable word, then a synonym/antonym, the same category, the same part of
 * speech, anything else.
 */
function tierOf(target: DistractorTarget, candidate: DistractorCandidate): number {
  if (candidate.relation === "CONFUSABLE") return TIER_CONFUSABLE;
  if (candidate.relation === "SYNONYM" || candidate.relation === "ANTONYM") {
    return TIER_RELATED;
  }
  if (candidate.categoryIds.some((id) => target.categoryIds.includes(id))) {
    return TIER_CATEGORY;
  }
  if (
    candidate.partOfSpeech !== null &&
    candidate.partOfSpeech === target.partOfSpeech
  ) {
    return TIER_POS;
  }
  return TIER_FALLBACK;
}

/**
 * Random order (Fisher–Yates), so the right option is not always in the same
 * place.
 */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface BuildOptions {
  count?: number;
}

/**
 * Pick distractors, best tier first, shuffling within a tier so the same
 * three options do not come up every time.
 *
 * Candidates whose text matches the answer are dropped: two identical
 * options make the question unanswerable, and near-synonyms with the same
 * translation genuinely do occur in a learner's deck.
 */
export function buildDistractors(
  target: DistractorTarget,
  pool: DistractorCandidate[],
  options: BuildOptions = {},
): DistractorCandidate[] {
  const { count = 3 } = options;

  const seen = new Set<string>([target.text.normalize("NFC").trim()]);
  const usable = pool.filter((candidate) => {
    if (candidate.senseId === target.senseId) return false;
    if (candidate.entryId === target.entryId) return false;
    const key = candidate.text.normalize("NFC").trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const byTier = new Map<number, DistractorCandidate[]>();
  for (const candidate of usable) {
    const tier = tierOf(target, candidate);
    const bucket = byTier.get(tier) ?? [];
    bucket.push(candidate);
    byTier.set(tier, bucket);
  }

  const picked: DistractorCandidate[] = [];
  for (const tier of [
    TIER_CONFUSABLE,
    TIER_RELATED,
    TIER_CATEGORY,
    TIER_POS,
    TIER_FALLBACK,
  ]) {
    if (picked.length >= count) break;
    const bucket = shuffle(byTier.get(tier) ?? []);
    picked.push(...bucket.slice(0, count - picked.length));
  }

  return picked;
}

/**
 * Lay out the final answer set. Position is randomised so the right answer
 * is not learnable from where it sits.
 */
export function buildChoices(
  correct: string,
  distractors: DistractorCandidate[],
): { text: string; isCorrect: boolean }[] {
  return shuffle([
    { text: correct, isCorrect: true },
    ...distractors.map((d) => ({ text: d.text, isCorrect: false })),
  ]);
}
