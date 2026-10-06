/**
 * KRDict returns its level and part-of-speech labels in Korean. Shown on
 * cards in English; anything unknown is shown as given.
 */

const LEVELS: Record<string, string> = {
  초급: "beginner",
  중급: "intermediate",
  고급: "advanced",
};

const PARTS_OF_SPEECH: Record<string, string> = {
  명사: "noun",
  대명사: "pronoun",
  수사: "numeral",
  동사: "verb",
  형용사: "adjective",
  관형사: "determiner",
  부사: "adverb",
  감탄사: "interjection",
  조사: "particle",
  "의존 명사": "bound noun",
  "보조 동사": "auxiliary verb",
  "보조 형용사": "auxiliary adjective",
  어미: "ending",
  접사: "affix",
  "품사 없음": "",
};

export function levelLabel(level: string | null | undefined): string | null {
  if (!level || level === "없음") return null;
  return LEVELS[level] ?? level;
}

export function posLabel(pos: string | null | undefined): string | null {
  if (!pos) return null;
  const label = PARTS_OF_SPEECH[pos];
  return label === undefined ? pos : label || null;
}
