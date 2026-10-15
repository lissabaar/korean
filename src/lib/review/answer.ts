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

const HANGUL_SYLLABLE = /[가-힣]/;

/** Hangul syllables split into their letters (jamo), the unit a typo is made in. */
function toJamo(text: string): string {
  return text.normalize("NFD");
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

/**
 * Compare a typed answer with the expected one after normalising (NFC, case,
 * spaces, punctuation): correct, almost (a small typo, accepted with a note), or
 * wrong. `alternatives` are other accepted answers.
 */
export function gradeTypedAnswer(
  typed: string,
  expected: string,
  options: GradeOptions = {},
): GradedAnswer {
  // Off unless asked for: a typo forgiven by default is a mistake let through.
  const { allowNearMiss = false, alternatives = [] } = options;

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

  // A typo is exactly one wrong letter in its place — nothing more (owner's
  // rule): two wrong letters are a mistake (유정하다 for 요청하다: ㅠ/ㅛ and
  // ㅈ/ㅊ), and so is a missing or extra letter (요청하 for 요청하다). Korean
  // is compared letter by letter (jamo: 동전 = ㄷㅗㅇㅈㅓㄴ), so 동젼 for 동전
  // is a slip but 동근 is not (ㄱ for ㅈ and ㅡ for ㅓ). Spacing is ignored.
  for (const candidate of candidates) {
    const korean = HANGUL_SYLLABLE.test(candidate);
    const a = [...(korean ? toJamo(given) : given).replace(/ /g, "")];
    const b = [...(korean ? toJamo(candidate) : candidate).replace(/ /g, "")];
    const substitutions = a.length === b.length ? a.filter((char, i) => char !== b[i]).length : Infinity;
    if (substitutions === 1) {
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
