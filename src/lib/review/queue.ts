/**
 * Building a review session: which cards to show, and what each one asks.
 *
 * Reads only. Grading and scheduling live in `submit.ts`; this module just
 * turns card rows into questions the client can render. The exercise type
 * comes from `pickExercise()` — never chosen here, never random.
 */

import type { PrismaClient } from "@prisma/client";
import { buildChoices, buildDistractors, type DistractorCandidate } from "./distractors";
import {
  clampLearningGoal,
  pickExercise,
  showsTranslation,
  type ExerciseType,
  type Phase,
} from "./session";

/**
 * New words introduced per session. Learning is a drill that repeats each
 * card until it graduates, so ten new words is already ~40 answers.
 */
export const NEW_PER_SESSION = 10;

export function clampNewPerSession(value: number | null | undefined): number {
  const n = Math.round(value ?? NEW_PER_SESSION);
  return Math.min(50, Math.max(5, Number.isFinite(n) ? n : NEW_PER_SESSION));
}

/** Cap on scheduled reviews per session, so a backlog cannot become a wall. */
export const REVIEWS_PER_SESSION = 50;

/** REGISTER cards are not created yet; only these two directions are asked. */
type AskedDirection = "RECOGNITION" | "RECALL";

/**
 * Which cards the user is studying right now. Two filters on top of the
 * plain "not suspended":
 *
 *   direction — RECALL (meaning → Korean) always; RECOGNITION only when the
 *               user turned it on, since recall is the skill that lags.
 *   category  — a word takes part in learning if any of its categories has
 *               learnActive, in review if any has reviewActive. A word with
 *               no category at all always takes part, so deleting a
 *               category can never make words silently disappear.
 */
async function studyScope(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      askRecognition: true,
      showKoreanDefinition: true,
      learningGoal: true,
      myMeaningFirst: true,
      newPerSession: true,
      hideTranslationAfterStability: true,
    },
  });
  const directions: AskedDirection[] = user.askRecognition
    ? ["RECALL", "RECOGNITION"]
    : ["RECALL"];
  const base = { userId, suspended: false, direction: { in: directions } };

  const learn = {
    ...base,
    phase: "LEARNING" as const,
    // Skipped from the intro card: out of new-word sessions until then.
    OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: new Date() } }],
    sense: {
      entry: {
        OR: [
          { categories: { some: { category: { learnActive: true } } } },
          { categories: { none: {} } },
        ],
      },
    },
  };
  const review = {
    ...base,
    phase: "SCHEDULED" as const,
    sense: {
      entry: {
        OR: [
          { categories: { some: { category: { reviewActive: true } } } },
          { categories: { none: {} } },
        ],
      },
    },
  };
  return { user, learn, review };
}

interface SenseText {
  translation: string | null;
  userMeaning: string | null;
  definitionKnown: string | null;
  definitionTarget: string | null;
}

/** The meaning shown for a sense: translation first, then definitions. */
/**
 * The meaning a card leads with: the English one (dictionary, else AI) by
 * default, the user's own when they prefer it. Falls back to whatever exists.
 */
export function meaningText(sense: SenseText, myMeaningFirst = false): string {
  const own = sense.userMeaning?.trim() || null;
  return (
    (myMeaningFirst ? own : null) ??
    sense.translation ??
    sense.definitionKnown ??
    own ??
    sense.definitionTarget ??
    ""
  );
}

/** The other meaning, shown smaller under the main one — null if there is none. */
export function secondMeaning(sense: SenseText, myMeaningFirst = false): string | null {
  const main = meaningText(sense, myMeaningFirst);
  const own = sense.userMeaning?.trim() || null;
  const other = myMeaningFirst ? sense.translation : own;
  return other && other !== main ? other : null;
}

/**
 * Accepted typed answers for "what does this word mean". KRDict gives
 * translations like "weather; climate" or "to eat", so each part counts,
 * with and without a leading "to".
 */
export function acceptedMeanings(translations: (string | null)[]): string[] {
  const out = new Set<string>();
  for (const translation of translations) {
    if (!translation) continue;
    for (const part of translation.split(/[;,]/)) {
      const clean = part.trim();
      if (!clean) continue;
      out.add(clean);
      if (/^to\s+/i.test(clean)) out.add(clean.replace(/^to\s+/i, ""));
    }
  }
  return [...out];
}

/**
 * Whether a typed answer can be graded automatically. Recognition needs an
 * English translation to compare against; without one the user grades
 * themselves.
 */
export function canAutoGrade(direction: AskedDirection, translation: string | null): boolean {
  return direction === "RECALL" || Boolean(translation);
}

export interface ReviewItem {
  cardId: string;
  /** Both directions of a word share it — the intro is shown once per sense. */
  senseId: string;
  /** A new word not seen yet: show it whole first ("Start learning" / "Skip"). */
  intro: boolean;
  phase: Phase;
  direction: AskedDirection;
  exercise: ExerciseType;
  learningStreak: number;
  /** Correct answers in a row this user needs to learn a word. */
  learningGoal: number;

  /** Options for CHOICE. Null means the deck is too small: self-graded. */
  choices: string[] | null;
  /** TYPING without an English translation to check against: self-graded. */
  selfGraded: boolean;

  /** What the card shows before answering. */
  front: {
    lemma: string | null;
    meaning: string | null;
    /** The second meaning (user's own or English), shown smaller. */
    altMeaning: string | null;
    definitionTarget: string | null;
  };

  /** What the card shows after answering. */
  back: {
    lemma: string;
    originalForm: string | null;
    level: string | null;
    partOfSpeech: string | null;
    translation: string | null;
    /** The user's own meaning, if they wrote one. */
    userMeaning: string | null;
    definitionTarget: string | null;
    definitionKnown: string | null;
    example: string | null;
    /** English translation of the example, when it has one (AI-written ones do). */
    exampleTranslation: string | null;
    contextNote: string | null;
  };
  /** First syllable of the expected answer, offered as a hint when typing. */
  hint: string | null;
}

export interface DeckStats {
  due: number;
  learning: number;
  words: number;
  nextDue: Date | null;
}

const cardInclude = {
  sense: {
    include: {
      // cuid ids grow with creation order, so this is the first one saved —
      // the learner's own sentence when there is one.
      examples: { take: 1, orderBy: { id: "asc" as const } },
      entry: { include: { categories: { select: { categoryId: true } } } },
    },
  },
} as const;

export async function getDeckStats(prisma: PrismaClient, userId: string): Promise<DeckStats> {
  const now = new Date();
  const { learn, review } = await studyScope(prisma, userId);

  const [due, learning, words, next] = await Promise.all([
    prisma.card.count({ where: { ...review, due: { lte: now } } }),
    prisma.card.count({ where: learn }),
    prisma.entry.count({ where: { userId } }),
    prisma.card.findFirst({
      where: { ...review, due: { gt: now } },
      orderBy: { due: "asc" },
      select: { due: true },
    }),
  ]);

  return { due, learning, words, nextDue: next?.due ?? null };
}

/** learn = new words only, review = scheduled reviews only, all = both. */
export type StudyMode = "learn" | "review" | "all";

export function parseStudyMode(value: string | null | undefined): StudyMode {
  return value === "learn" || value === "review" ? value : "all";
}

export interface SessionOptions {
  /** Senses already in the client's session (a replacement must not repeat them). */
  excludeSenseIds?: string[];
  /** Override the number of new-word cards. */
  newLimit?: number;
}

export async function buildSession(
  prisma: PrismaClient,
  userId: string,
  mode: StudyMode = "all",
  options: SessionOptions = {},
): Promise<ReviewItem[]> {
  const now = new Date();
  const { user, learn, review } = await studyScope(prisma, userId);

  const [scheduled, learning] = await Promise.all([
    mode === "learn" ? [] : prisma.card.findMany({
      where: { ...review, due: { lte: now } },
      include: cardInclude,
      orderBy: { due: "asc" },
      take: REVIEWS_PER_SESSION,
    }),
    mode === "review" ? [] : prisma.card.findMany({
      where: options.excludeSenseIds?.length
        ? { AND: [learn, { senseId: { notIn: options.excludeSenseIds } }] }
        : learn,
      include: cardInclude,
      // Oldest words first, and both directions of a word together.
      orderBy: [{ sense: { entry: { createdAt: "asc" } } }, { direction: "asc" }],
      take: options.newLimit ?? clampNewPerSession(user.newPerSession),
    }),
  ]);

  const cards = [...scheduled, ...learning];
  if (cards.length === 0) return [];

  const pool = await loadDistractorPool(prisma, userId);

  return cards.map((card) => {
    const { sense } = card;
    const { entry } = sense;
    const direction = card.direction as AskedDirection;
    const exercise = pickExercise(card, user.learningGoal);
    const translationShown = showsTranslation(card, user.hideTranslationAfterStability);

    const meaning = meaningText(sense, user.myMeaningFirst);
    const correct = direction === "RECOGNITION" ? meaning : entry.lemma;

    let choices: string[] | null = null;
    if (exercise === "CHOICE") {
      const relations = pool.relations.get(entry.id);
      const candidates: DistractorCandidate[] = pool.senses.map((other) => ({
        senseId: other.id,
        entryId: other.entry.id,
        text: direction === "RECOGNITION" ? meaningText(other, user.myMeaningFirst) : other.entry.lemma,
        categoryIds: other.entry.categories.map((c) => c.categoryId),
        partOfSpeech: other.entry.partOfSpeech,
        relation: relations?.get(other.entry.id) ?? null,
      }));
      const distractors = buildDistractors(
        {
          senseId: sense.id,
          entryId: entry.id,
          text: correct,
          categoryIds: entry.categories.map((c) => c.categoryId),
          partOfSpeech: entry.partOfSpeech,
        },
        candidates.filter((candidate) => candidate.text),
      );
      choices = distractors.length > 0 ? buildChoices(correct, distractors).map((c) => c.text) : null;
    }

    const typedAnswer =
      direction === "RECOGNITION"
        ? acceptedMeanings([meaning, sense.translation, sense.userMeaning])[0]
        : entry.lemma;

    return {
      cardId: card.id,
      senseId: sense.id,
      intro: card.phase === "LEARNING" && !card.introducedAt,
      phase: card.phase,
      direction,
      exercise,
      learningStreak: card.learningStreak,
      learningGoal: clampLearningGoal(user.learningGoal),
      choices,
      selfGraded:
        (exercise === "CHOICE" && choices === null) ||
        (exercise === "TYPING" && !canAutoGrade(direction, sense.translation ?? sense.userMeaning)),
      front:
        direction === "RECOGNITION"
          ? { lemma: entry.lemma, meaning: null, altMeaning: null, definitionTarget: null }
          : {
              lemma: null,
              // Once the word is settled, recall is cued by the Korean
              // definition alone — the translation is the crutch to drop.
              meaning: translationShown ? meaning : null,
              altMeaning: translationShown ? secondMeaning(sense, user.myMeaningFirst) : null,
              // Otherwise the English meaning is the cue; the Korean
              // definition joins it only if the user asked for it (or there
              // is no English at all).
              definitionTarget:
                user.showKoreanDefinition || !translationShown || !sense.translation
                  ? sense.definitionTarget
                  : null,
            },
      back: {
        lemma: entry.lemma,
        originalForm: entry.originalForm,
        level: entry.level,
        partOfSpeech: entry.partOfSpeech,
        translation: translationShown ? sense.translation : null,
        userMeaning: sense.userMeaning,
        definitionTarget: sense.definitionTarget,
        definitionKnown: translationShown ? sense.definitionKnown : null,
        example: sense.examples[0]?.text ?? null,
        exampleTranslation: sense.examples[0]?.translation ?? null,
        contextNote: sense.contextNote,
      },
      hint: exercise === "TYPING" && typedAnswer ? [...typedAnswer][0] : null,
    };
  });
}

/**
 * Every first sense in the user's deck, plus relations between entries.
 * Loaded once per session; a learner's deck is hundreds of words, not
 * millions, so one query beats one per card.
 */
async function loadDistractorPool(prisma: PrismaClient, userId: string) {
  const [senses, relationRows] = await Promise.all([
    prisma.sense.findMany({
      where: { order: 0, entry: { userId } },
      select: {
        id: true,
        translation: true,
        userMeaning: true,
        definitionKnown: true,
        definitionTarget: true,
        entry: {
          select: {
            id: true,
            lemma: true,
            partOfSpeech: true,
            categories: { select: { categoryId: true } },
          },
        },
      },
    }),
    prisma.entryRelation.findMany({
      where: {
        from: { userId },
        type: { in: ["CONFUSABLE", "SYNONYM", "ANTONYM"] },
      },
      select: { fromId: true, toId: true, type: true },
    }),
  ]);

  type Relation = DistractorCandidate["relation"];
  const relations = new Map<string, Map<string, Relation>>();
  const link = (a: string, b: string, type: Relation) => {
    const map = relations.get(a) ?? new Map<string, Relation>();
    map.set(b, type);
    relations.set(a, map);
  };
  for (const row of relationRows) {
    const type = row.type as Relation;
    link(row.fromId, row.toId, type);
    link(row.toId, row.fromId, type);
  }

  return { senses, relations };
}
