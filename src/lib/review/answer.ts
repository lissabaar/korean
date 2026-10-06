/**
 * Answer checking for typed responses.
 *
 * The non-obvious part is Hangul normalisation. 먹다 can be stored as three
 * precomposed syllable blocks (NFC) or as a sequence of individual jamo
 * (NFD) — ㅁ+ㅓ+ㄱ+ㄷ+ㅏ. The two look identical on screen and compare as
 * different strings. macOS input methods routinely produce NFD, so a naive
 * `typed === expected` rejects correct answers on one platform and accepts
 * them on another. Everything is forced to NFC before comparison.
 */

export type AnswerVerdict = "correct" | "almost" | "wrong";

export interface GradedAnswer {
  verdict: AnswerVerdict;
  /** Which of the accepted answers was matched, if any. */
  matched?: string;
  /** Set when the answer was accepted despite not being exact. */
  hint?: string;
}

/** Collapse a typed string to its comparable form. */
export function normalise(input: string): string {
  return input
    .normalize("NFC")
    // Punctuation is not part of knowing a phrase: "감사합니다." = "감사합니다"
    .replace(/[.,!?~…·'"“”‘’()\[\]-]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

/**
 * Levenshtein distance, capped: we only ever care whether the answer is
 * within one or two edits, so the full matrix is wasteful but the input is
 * a single word and clarity wins over micro-optimisation here.
 */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[rows - 1][cols - 1];
}

export interface GradeOptions {
  /**
   * Treat near-misses as "almost" rather than wrong. Typos in a language
   * you are still learning are not the same as not knowing the word, and
   * punishing them makes people stop using the app.
   */
  allowNearMiss?: boolean;
  /**
   * Alternative accepted forms — other senses' translations, a dictionary
   * form alongside a conjugated one, a synonym the user has confirmed.
   */
  alternatives?: string[];
}

export function gradeTypedAnswer(
  typed: string,
  expected: string,
  options: GradeOptions = {},
): GradedAnswer {
  const { allowNearMiss = true, alternatives = [] } = options;

  const given = normalise(typed);
  if (!given) return { verdict: "wrong" };

  const candidates = [expected, ...alternatives].map(normalise).filter(Boolean);

  for (const candidate of candidates) {
    // Spacing (띄어쓰기) is famously hard and not what is being tested.
    if (given === candidate || given.replace(/ /g, "") === candidate.replace(/ /g, "")) {
      return { verdict: "correct", matched: candidate };
    }
  }

  if (!allowNearMiss) return { verdict: "wrong" };

  // One edit for short words, two for longer ones, then about one per seven
  // characters for phrases. Korean words are short, so a fixed threshold
  // would be far too forgiving on 2-syllable words and far too strict on
  // whole sentences.
  for (const candidate of candidates) {
    const budget = candidate.length <= 3 ? 1 : Math.max(2, Math.round(candidate.length / 7));
    if (editDistance(given, candidate) <= budget) {
      return {
        verdict: "almost",
        matched: candidate,
        hint: "Close — check the spelling.",
      };
    }
  }

  return { verdict: "wrong" };
}

/**
 * Whether the browser is likely to be able to type the target language at
 * all. Korean needs a system IME; without one the typing exercise is
 * impossible and the UI should say so instead of silently failing.
 */
export function canTypeHangul(): boolean {
  if (typeof navigator === "undefined") return true;
  return true; // Cannot be detected reliably; the UI offers an on-screen fallback.
}
