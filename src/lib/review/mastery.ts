/**
 * When a word counts as learned for good (Phase MASTERED) and leaves review.
 *
 * Library module with no imports, so the server (submit.ts grades answers),
 * the info page (/how-it-works) and Settings all read the same numbers.
 *
 * The rule (owner's call, 2026-10-14): MASTERY_STREAK right answers in a row
 * in review, the last of them at least `masteredAfterDays` (User setting,
 * default DEFAULT_MASTERED_AFTER_DAYS) after the review before it. A long
 * last gap is the point: remembering a word after two months says more than
 * three right answers a few days apart. 56 days comes from Bahrick et al.
 * (1993): foreign words reviewed 56 days apart were kept far better than
 * with short gaps. Anki's "mature" (interval ≥ 21 days) is a looser bar.
 *
 * A right answer is anything FSRS rates above AGAIN (a typo "almost" counts;
 * a right answer with the hint does not — it is rated AGAIN).
 */

/** Right review answers in a row a word needs to be mastered. */
export const MASTERY_STREAK = 3;

/** Default minimum gap (days) before the last of those answers. */
export const DEFAULT_MASTERED_AFTER_DAYS = 56;
export const MIN_MASTERED_AFTER_DAYS = 14;
export const MAX_MASTERED_AFTER_DAYS = 365;

/** Choices offered in Settings. */
export const MASTERED_AFTER_OPTIONS = [21, 30, 56, 90, 180] as const;

/** The user's setting kept within the allowed range. */
export function clampMasteredAfterDays(value: number | null | undefined): number {
  const n = Math.round(value ?? DEFAULT_MASTERED_AFTER_DAYS);
  if (!Number.isFinite(n)) return DEFAULT_MASTERED_AFTER_DAYS;
  return Math.min(MAX_MASTERED_AFTER_DAYS, Math.max(MIN_MASTERED_AFTER_DAYS, n));
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Days since the previous review of this card: the last review, or — for the
 * first review after learning — when it graduated.
 */
export function gapDays(lastReview: Date | null, graduatedAt: Date | null, now: Date): number {
  const since = lastReview ?? graduatedAt;
  return since ? (now.getTime() - since.getTime()) / DAY_MS : 0;
}

/** After a review answer: the new streak and whether the word is now mastered. */
export function afterReview(
  streak: number,
  correct: boolean,
  gap: number,
  masteredAfterDays: number,
): { reviewStreak: number; mastered: boolean } {
  const reviewStreak = correct ? streak + 1 : 0;
  return {
    reviewStreak,
    mastered: reviewStreak >= MASTERY_STREAK && gap >= clampMasteredAfterDays(masteredAfterDays),
  };
}
