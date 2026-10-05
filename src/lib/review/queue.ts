/**
 * Building a review session: which cards to show, and what each one asks.
 *
 * Reads only. Grading and scheduling live in `submit.ts`; this module just
 * turns card rows into questions the client can render. The exercise type
 * comes from `pickExercise()` — never chosen here, never random.
 */

import type { PrismaClient } from "@prisma/client";
import { buildChoices, buildDistractors, type DistractorCandidate } from "./distractors";
import { pickExercise, showsTranslation, type ExerciseType, type Phase } from "./session";

/**
 * New words introduced per session. Learning is a drill that repeats each
 * card until it graduates, so ten new words is already ~40 answers.
 */
export const NEW_PER_SESSION = 10;

/** Cap on scheduled reviews per session, so a backlog cannot become a wall. */
export const REVIEWS_PER_SESSION = 50;

/** REGISTER cards are not created yet; only these two directions are asked. */
const ASKED_DIRECTIONS = ["RECOGNITION", "RECALL"] as const;
type AskedDirection = (typeof ASKED_DIRECTIONS)[number];

interface SenseText {
  translation: string | null;
  definitionKnown: string | null;
  definitionTarget: string | null;
}

/** The meaning shown for a sense: translation first, then definitions. */
export function meaningText(sense: SenseText): string {
  return sense.translation ?? sense.definitionKnown ?? sense.definitionTarget ?? "";
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
  phase: Phase;
  direction: AskedDirection;
  exercise: ExerciseType;
  learningStreak: number;

  /** Options for CHOICE. Null means the deck is too small: self-graded. */
  choices: string[] | null;
  /** TYPING without an English translation to check against: self-graded. */
  selfGraded: boolean;

  /** What the card shows before answering. */
  front: {
    lemma: string | null;
    meaning: string | null;
    definitionTarget: string | null;
  };

  /** What the card shows after answering. */
  back: {
    lemma: string;
    originalForm: string | null;
    level: string | null;
    partOfSpeech: string | null;
    translation: string | null;
    definitionTarget: string | null;
    definitionKnown: string | null;
    example: string | null;
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
      examples: { take: 1 },
      entry: { include: { categories: { select: { categoryId: true } } } },
    },
  },
} as const;

export async function getDeckStats(prisma: PrismaClient, userId: string): Promise<DeckStats> {
  const now = new Date();
  const base = { userId, suspended: false, direction: { in: [...ASKED_DIRECTIONS] } };

  const [due, learning, words, next] = await Promise.all([
    prisma.card.count({ where: { ...base, phase: "SCHEDULED", due: { lte: now } } }),
    prisma.card.count({ where: { ...base, phase: "LEARNING" } }),
    prisma.entry.count({ where: { userId } }),
    prisma.card.findFirst({
      where: { ...base, phase: "SCHEDULED", due: { gt: now } },
      orderBy: { due: "asc" },
      select: { due: true },
    }),
  ]);

  return { due, learning, words, nextDue: next?.due ?? null };
}

export async function buildSession(
  prisma: PrismaClient,
  userId: string,
): Promise<ReviewItem[]> {
  const now = new Date();
  const base = { userId, suspended: false, direction: { in: [...ASKED_DIRECTIONS] } };

  const [user, scheduled, learning] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { hideTranslationAfterStability: true },
    }),
    prisma.card.findMany({
      where: { ...base, phase: "SCHEDULED", due: { lte: now } },
      include: cardInclude,
      orderBy: { due: "asc" },
      take: REVIEWS_PER_SESSION,
    }),
    prisma.card.findMany({
      where: { ...base, phase: "LEARNING" },
      include: cardInclude,
      // Oldest words first, and both directions of a word together.
      orderBy: [{ sense: { entry: { createdAt: "asc" } } }, { direction: "asc" }],
      take: NEW_PER_SESSION,
    }),
  ]);

  const cards = [...scheduled, ...learning];
  if (cards.length === 0) return [];

  const pool = await loadDistractorPool(prisma, userId);

  return cards.map((card) => {
    const { sense } = card;
    const { entry } = sense;
    const direction = card.direction as AskedDirection;
    const exercise = pickExercise(card);
    const translationShown = showsTranslation(card, user.hideTranslationAfterStability);

    const meaning = meaningText(sense);
    const correct = direction === "RECOGNITION" ? meaning : entry.lemma;

    let choices: string[] | null = null;
    if (exercise === "CHOICE") {
      const relations = pool.relations.get(entry.id);
      const candidates: DistractorCandidate[] = pool.senses.map((other) => ({
        senseId: other.id,
        entryId: other.entry.id,
        text: direction === "RECOGNITION" ? meaningText(other) : other.entry.lemma,
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

    const typedAnswer = direction === "RECOGNITION" ? acceptedMeanings([sense.translation])[0] : entry.lemma;

    return {
      cardId: card.id,
      phase: card.phase,
      direction,
      exercise,
      learningStreak: card.learningStreak,
      choices,
      selfGraded:
        (exercise === "CHOICE" && choices === null) ||
        (exercise === "TYPING" && !canAutoGrade(direction, sense.translation)),
      front:
        direction === "RECOGNITION"
          ? { lemma: entry.lemma, meaning: null, definitionTarget: null }
          : {
              lemma: null,
              // Once the word is settled, recall is cued by the Korean
              // definition alone — the translation is the crutch to drop.
              meaning: translationShown ? meaning : null,
              definitionTarget: sense.definitionTarget,
            },
      back: {
        lemma: entry.lemma,
        originalForm: entry.originalForm,
        level: entry.level,
        partOfSpeech: entry.partOfSpeech,
        translation: translationShown ? sense.translation : null,
        definitionTarget: sense.definitionTarget,
        definitionKnown: translationShown ? sense.definitionKnown : null,
        example: sense.examples[0]?.text ?? null,
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
