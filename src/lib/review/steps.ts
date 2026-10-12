/**
 * The shape of the learning drill for a new word, in one place.
 *
 * Library module with no imports, so both the server (session.ts: which
 * exercise to show, when a word graduates) and the browser (Review.tsx: the
 * counter, the requeued card's exercise, the feedback line) read the same
 * numbers.
 *
 * The user's learning goal (User.learningGoal, 2–10) is how many right
 * answers picked from options and typed it takes — the last of them typed.
 * EXTRA_TYPED_STEPS more typed answers come on top: one typed answer was
 * not enough for a word to stick before it left for spaced review.
 */

/** Typed answers added after the goal's own last (typed) step. */
export const EXTRA_TYPED_STEPS = 2;

/**
 * Picks from options left after a wrong typed answer: the streak drops to
 * this many steps before typing, not to zero — starting all eight steps over
 * for one wrong letter was too much (owner's call). A wrong pick (before the
 * typing steps) still starts over.
 */
export const PICKS_AFTER_TYPING_MISS = 3;

/** The learning streak after a wrong answer at `streak`. */
export function streakAfterMiss(streak: number, goal: number): number {
  const typedFrom = typedFromStreak(goal);
  return streak >= typedFrom ? Math.max(0, typedFrom - PICKS_AFTER_TYPING_MISS) : 0;
}

/** Right answers in a row a new word needs to graduate. `goal` is already clamped. */
export function stepsToLearn(goal: number): number {
  return goal + EXTRA_TYPED_STEPS;
}

/**
 * From this streak on the exercise is typed: everything before is picked
 * from options, the last 1 + EXTRA_TYPED_STEPS answers are typed.
 */
export function typedFromStreak(goal: number): number {
  return goal - 1;
}
