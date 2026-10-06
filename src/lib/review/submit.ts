/**
 * Recording an answer: grade it, then move the card on.
 *
 * Grading happens here, on the server, from the card row — the client only
 * says what was picked or typed. The exercise type is recomputed with
 * `pickExercise()` rather than taken from the request, so the rating FSRS
 * receives always means what the card's state says it means.
 *
 *   LEARNING   — streak drill. Updates the streak, graduates the card.
 *                Writes no ReviewLog: drill answers are not FSRS data.
 *   SCHEDULED  — FSRS review. Reschedules and appends to ReviewLog.
 */

import type { PrismaClient } from "@prisma/client";
import { gradeTypedAnswer, normalise, type AnswerVerdict } from "./answer";
import { acceptedMeanings, canAutoGrade, meaningText } from "./queue";
import {
  advanceLearning,
  pickExercise,
  ratingFromChoice,
  ratingFromTyped,
  scheduleNext,
  showsTranslation,
  type Rating,
} from "./session";

/**
 * A graduated card's first FSRS review is the next day, never the same
 * session: the drill just proved short-term recall, which says nothing
 * about whether the word will still be there tomorrow.
 */
const FIRST_REVIEW_DELAY_MS = 24 * 60 * 60 * 1000;

export interface AnswerInput {
  cardId: string;
  /** The picked option (CHOICE) or the typed text (TYPING). */
  answer?: string;
  /**
   * For self-graded cards: did the user know it. Only honoured where the
   * card cannot be graded automatically — a deck too small for options,
   * or a word with no translation to type against.
   */
  knewIt?: boolean;
  /** Whether the typing hint was revealed before answering. */
  usedHint?: boolean;
}

export interface AnswerResult {
  correct: boolean;
  verdict: AnswerVerdict;
  /** The answer that was expected, for the feedback line. */
  expected: string;
  /** Set when grading accepted a near-miss. */
  note?: string;
  /** Learning cards that have not graduated come back later in the session. */
  requeue: boolean;
  graduated: boolean;
  learningStreak: number;
  /** Set for scheduled cards: when FSRS wants to see the card next. */
  nextDue?: Date;
}

export class CardNotFoundError extends Error {}

export async function submitAnswer(
  prisma: PrismaClient,
  userId: string,
  input: AnswerInput,
): Promise<AnswerResult> {
  const card = await prisma.card.findFirst({
    where: { id: input.cardId, userId },
    include: {
      sense: {
        include: {
          entry: {
            include: {
              senses: { select: { translation: true, userMeaning: true }, orderBy: { order: "asc" } },
            },
          },
        },
      },
      user: {
        select: {
          desiredRetention: true,
          hideTranslationAfterStability: true,
          learningGoal: true,
          myMeaningFirst: true,
        },
      },
    },
  });
  if (!card || (card.direction !== "RECOGNITION" && card.direction !== "RECALL")) {
    throw new CardNotFoundError(`No card ${input.cardId}`);
  }

  const { sense } = card;
  const { entry } = sense;
  const exercise = pickExercise(card, card.user.learningGoal);
  const now = new Date();

  // ---------------------------------------------------------------- grade

  const expected =
    card.direction === "RECOGNITION"
      ? exercise === "TYPING"
        ? (acceptedMeanings([meaningText(sense, card.user.myMeaningFirst), sense.translation, sense.userMeaning])[0] ??
          meaningText(sense, card.user.myMeaningFirst))
        : meaningText(sense, card.user.myMeaningFirst)
      : entry.lemma;

  let verdict: AnswerVerdict;
  let note: string | undefined;

  const selfGraded =
    input.knewIt !== undefined &&
    (exercise === "CHOICE" || !canAutoGrade(card.direction, sense.translation ?? sense.userMeaning));

  if (selfGraded) {
    verdict = input.knewIt ? "correct" : "wrong";
  } else if (exercise === "CHOICE") {
    verdict = normalise(input.answer ?? "") === normalise(expected) ? "correct" : "wrong";
  } else {
    // Any sense's translation counts: the word was recalled, even if the
    // user reached for a different meaning than this card's.
    const alternatives =
      card.direction === "RECOGNITION"
        ? acceptedMeanings(entry.senses.flatMap((s) => [s.translation, s.userMeaning]))
        : [];
    const graded = gradeTypedAnswer(input.answer ?? "", expected, { alternatives });
    verdict = graded.verdict;
    note = graded.hint;
  }

  const correct = verdict !== "wrong";

  // ---------------------------------------------------------------- learning

  if (card.phase === "LEARNING") {
    const outcome = advanceLearning(card, correct, card.user.learningGoal);
    await prisma.card.update({
      where: { id: card.id },
      data: outcome.graduated
        ? {
            phase: "SCHEDULED",
            learningStreak: outcome.learningStreak,
            graduatedAt: now,
            due: new Date(now.getTime() + FIRST_REVIEW_DELAY_MS),
            introducedAt: card.introducedAt ?? now,
          }
        : { learningStreak: outcome.learningStreak, introducedAt: card.introducedAt ?? now },
    });

    return {
      correct,
      verdict,
      expected,
      note,
      requeue: !outcome.graduated,
      graduated: outcome.graduated,
      learningStreak: outcome.learningStreak,
    };
  }

  // ---------------------------------------------------------------- review

  const rating: Rating =
    exercise === "CHOICE" || selfGraded
      ? ratingFromChoice(correct)
      : ratingFromTyped(verdict, input.usedHint ?? false);

  const translationShown = showsTranslation(card, card.user.hideTranslationAfterStability);
  const next = scheduleNext(card, rating, now, card.user.desiredRetention);

  await prisma.$transaction([
    prisma.card.update({
      where: { id: card.id },
      data: {
        due: next.due,
        stability: next.stability,
        difficulty: next.difficulty,
        elapsedDays: next.elapsedDays,
        scheduledDays: next.scheduledDays,
        learningSteps: next.learningSteps,
        reps: next.reps,
        lapses: next.lapses,
        state: next.state,
        lastReview: next.lastReview,
        translationHiddenAt:
          !translationShown && !card.translationHiddenAt ? now : card.translationHiddenAt,
      },
    }),
    prisma.reviewLog.create({
      data: {
        cardId: card.id,
        rating,
        state: next.log.state,
        due: next.log.due,
        stability: next.log.stability,
        difficulty: next.log.difficulty,
        elapsedDays: next.log.elapsedDays,
        scheduledDays: next.log.scheduledDays,
        reviewedAt: now,
        translationShown,
        exercise,
      },
    }),
  ]);

  return {
    correct,
    verdict,
    expected,
    note,
    requeue: false,
    graduated: false,
    learningStreak: card.learningStreak,
    nextDue: next.due,
  };
}
