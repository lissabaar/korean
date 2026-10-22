/**
 * Grade an answer in the browser, without the server — for offline sessions.
 *
 * Browser library. Called by Review.tsx when an answer cannot reach the
 * server. Uses the very functions the server uses (answer.ts for typed
 * answers, session.ts for the learning streak), on the data the offline pack
 * carries, so the phone moves a card exactly as the server will when the
 * queued answer is synced (lib/offline/sync.ts re-grades it from the card).
 *
 * What it cannot know offline: the FSRS schedule and mastery of a review
 * card — those are decided on sync. A reviewed card simply leaves the
 * offline pack until then.
 */

import { gradeTypedAnswer, normalise } from "../review/answer";
import type { ReviewItem } from "../review/queue";
import { advanceLearning } from "../review/session";
import type { AnswerResult } from "../review/submit";

/** The answer a card expects: the Korean word (cards ask English → Korean). */
function expectedOf(item: ReviewItem): string {
  return item.direction === "RECALL" ? item.back.lemma : (item.back.translation ?? item.back.userMeaning ?? "");
}

/** Grade like submit.ts does, from the pack's copy of the card. */
export function gradeOffline(
  item: ReviewItem,
  body: { answer?: string; knewIt?: boolean },
  usedHintIn: boolean,
  acceptTypos: boolean,
): AnswerResult {
  const expected = expectedOf(item);
  const selfGraded = body.knewIt !== undefined && item.selfGraded;

  let verdict: AnswerResult["verdict"];
  let note: string | undefined;
  if (selfGraded) {
    verdict = body.knewIt ? "correct" : "wrong";
  } else if (item.exercise === "CHOICE") {
    verdict = normalise(body.answer ?? "") === normalise(expected) ? "correct" : "wrong";
  } else {
    const graded = gradeTypedAnswer(body.answer ?? "", expected, { allowNearMiss: acceptTypos });
    verdict = graded.verdict;
    note = graded.hint;
  }
  const correct = verdict !== "wrong";
  const usedHint = item.exercise === "TYPING" && !selfGraded && usedHintIn;
  const hintNotCounted = correct && usedHint;

  if (item.phase === "LEARNING") {
    const outcome = advanceLearning(
      { phase: "LEARNING", direction: item.direction, reps: 0, stability: 0, learningStreak: item.learningStreak, translationHiddenAt: null },
      correct,
      item.learningGoal,
      usedHint,
    );
    return {
      correct,
      verdict,
      expected,
      note,
      requeue: !outcome.graduated,
      graduated: outcome.graduated,
      learningStreak: outcome.learningStreak,
      hintNotCounted,
    };
  }
  // A hinted right answer is shown as right but not counted (hintNotCounted),
  // exactly as the server answers; on sync it is rated AGAIN.
  return { correct, verdict, expected, note, requeue: false, graduated: false, learningStreak: item.learningStreak, hintNotCounted };
}
