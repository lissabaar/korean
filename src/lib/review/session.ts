/**
 * Session logic: deciding what to ask, how to ask it, and what to do with
 * the answer.
 *
 * Two modes, deliberately different in kind:
 *
 *   LEARNING   — introducing a word. Runs inside one session, repeats until
 *                the card graduates. FSRS is not involved at all.
 *   SCHEDULED  — ordinary review. FSRS owns the schedule from here on.
 *
 * Keeping them apart is what lets the exercise get harder without the
 * scheduler mistaking the extra difficulty for forgetting.
 */

import {
  createEmptyCard,
  fsrs,
  Rating as FsrsRating,
  type Card as FsrsCard,
  type Grade,
} from "ts-fsrs";

/**
 * Correct answers in a row before a new word graduates. A per-user setting
 * (User.learningGoal, 2–10); this is the default and the fallback.
 */
export const DEFAULT_LEARNING_GOAL = 5;
export const MAX_LEARNING_GOAL = 10;

export function clampLearningGoal(value: number | null | undefined): number {
  const n = Math.round(value ?? DEFAULT_LEARNING_GOAL);
  return Math.min(MAX_LEARNING_GOAL, Math.max(2, Number.isFinite(n) ? n : DEFAULT_LEARNING_GOAL));
}

/**
 * Number of scheduled reviews answered by multiple choice before switching
 * to typing permanently.
 *
 * Kept small on purpose. The switch makes the card harder, so it has to
 * happen while FSRS still has short intervals and little invested in its
 * estimate. Moving it later would disturb an established schedule.
 */
export const CHOICE_REVIEWS_BEFORE_TYPING = 2;

export type Phase = "LEARNING" | "SCHEDULED";
export type ExerciseType = "CHOICE" | "TYPING";
export type Direction = "RECOGNITION" | "RECALL" | "REGISTER";

export interface CardLike {
  phase: Phase;
  direction: Direction;
  reps: number;
  stability: number;
  learningStreak: number;
  translationHiddenAt: Date | null;
}

/**
 * Which exercise to show. A pure function of card state (plus the user's
 * stable learning goal) — never random, because every rating FSRS receives
 * must mean the same thing.
 *
 * Learning: pick from options until the last step, which is typed —
 * recognising a word among four is not yet being able to produce it.
 */
export function pickExercise(
  card: CardLike,
  learningGoal: number = DEFAULT_LEARNING_GOAL,
): ExerciseType {
  if (card.phase === "LEARNING") {
    return card.learningStreak >= clampLearningGoal(learningGoal) - 1 ? "TYPING" : "CHOICE";
  }
  if (card.direction === "REGISTER") return "CHOICE"; // finite set of options
  return card.reps < CHOICE_REVIEWS_BEFORE_TYPING ? "CHOICE" : "TYPING";
}

/**
 * Whether the plain translation is still shown on the back of the card.
 * Driven by stability rather than by a counter: the point is to drop the
 * crutch once the word is genuinely settled, not after N repetitions.
 */
export function showsTranslation(
  card: CardLike,
  hideAfterStability: number | null,
): boolean {
  if (hideAfterStability === null) return true;
  return card.stability < hideAfterStability;
}

// ---------------------------------------------------------------- learning

export interface LearningOutcome {
  learningStreak: number;
  graduated: boolean;
}

/**
 * Advance the learning drill. Correct answers build a streak; a wrong
 * answer resets it. Once the streak is met the card graduates and is handed
 * to FSRS with a clean slate.
 */
export function advanceLearning(
  card: CardLike,
  wasCorrect: boolean,
  learningGoal: number = DEFAULT_LEARNING_GOAL,
): LearningOutcome {
  const streak = wasCorrect ? card.learningStreak + 1 : 0;
  return {
    learningStreak: streak,
    graduated: streak >= clampLearningGoal(learningGoal),
  };
}

// ---------------------------------------------------------------- review

export type Rating = "AGAIN" | "HARD" | "GOOD" | "EASY";

const RATING_MAP: Record<Rating, Grade> = {
  AGAIN: FsrsRating.Again,
  HARD: FsrsRating.Hard,
  GOOD: FsrsRating.Good,
  EASY: FsrsRating.Easy,
};

/** Same order as ts-fsrs's numeric `State` enum, so the index is the value. */
export const CARD_STATES = ["NEW", "LEARNING", "REVIEW", "RELEARNING"] as const;
export type CardState = (typeof CARD_STATES)[number];

export interface ScheduledResult {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: CardState;
  lastReview: Date;
  /**
   * What FSRS logs about this review: the card as it was *before* the
   * rating. Stored in ReviewLog, which FSRS later trains its parameters on.
   */
  log: {
    state: CardState;
    due: Date;
    stability: number;
    difficulty: number;
    elapsedDays: number;
    scheduledDays: number;
  };
}

/** The scheduler fields as stored on a Card row. */
export interface SchedulerState {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: CardState;
  lastReview: Date | null;
}

function toFsrsCard(state: SchedulerState): FsrsCard {
  return {
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: CARD_STATES.indexOf(state.state),
    last_review: state.lastReview ?? undefined,
  };
}

/**
 * Hand a rating to FSRS and get the next schedule back.
 *
 * `desiredRetention` is the user's target recall probability. Lower means
 * longer gaps and more forgetting; higher means more reviews. 0.9 is the
 * usual default and there is rarely a reason to move it.
 */
export function scheduleNext(
  state: SchedulerState | null,
  rating: Rating,
  now: Date,
  desiredRetention = 0.9,
): ScheduledResult {
  const scheduler = fsrs({ request_retention: desiredRetention });
  const card = state ? toFsrsCard(state) : createEmptyCard(now);

  const { card: next, log } = scheduler.next(card, now, RATING_MAP[rating]);

  return {
    due: next.due,
    stability: next.stability,
    difficulty: next.difficulty,
    elapsedDays: next.elapsed_days,
    scheduledDays: next.scheduled_days,
    learningSteps: next.learning_steps,
    reps: next.reps,
    lapses: next.lapses,
    state: CARD_STATES[next.state],
    lastReview: now,
    log: {
      state: CARD_STATES[log.state],
      due: log.due,
      stability: log.stability,
      difficulty: log.difficulty,
      elapsedDays: log.elapsed_days,
      scheduledDays: log.scheduled_days,
    },
  };
}

/**
 * Turn a typed answer into a rating.
 *
 * A near-miss is graded HARD rather than AGAIN: the word was recalled, the
 * spelling slipped. Grading it AGAIN would wipe out the interval over a
 * typo and teach the user to distrust the app.
 */
export function ratingFromTyped(
  verdict: "correct" | "almost" | "wrong",
  usedHint: boolean,
): Rating {
  if (verdict === "wrong") return "AGAIN";
  if (verdict === "almost") return "HARD";
  return usedHint ? "HARD" : "GOOD";
}

/**
 * Multiple choice carries no "how hard was that" signal — the user either
 * clicked the right box or did not. Mapping a correct click to GOOD (never
 * EASY) keeps it from inflating intervals on what is the easier exercise.
 */
export function ratingFromChoice(wasCorrect: boolean): Rating {
  return wasCorrect ? "GOOD" : "AGAIN";
}
