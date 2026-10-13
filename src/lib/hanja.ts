/**
 * Hanja behind Sino-Korean words: which syllable of a word comes from which
 * Chinese character, what that character means, and other words built on it.
 *
 * Library module (server: reads the database). Used by review/queue.ts (the
 * tappable syllables on word cards), the /hanja page and GET /api/hanja.
 *
 * Where the data comes from:
 *   - which hanja a word is made of: KRDict's origin field, stored as
 *     Entry.originalForm ("公園" for 공원, "歡迎하다" for 환영하다);
 *   - what a character means and how it is read: the HanjaChar table, loaded
 *     from Unicode's Unihan database (scripts/load-hanja.mts).
 * Native Korean words have no originalForm, so none of their syllables are
 * tappable — only words that really come from hanja.
 */

import type { PrismaClient } from "@prisma/client";
import { realTranslation } from "./dictionary/krdict";

/** A CJK ideograph (basic block, extension A, compatibility ideographs). */
const HANJA = /[㐀-䶿一-鿿豈-﫿]/u;
const HANGUL = /[가-힣]/;

export interface SyllableHanja {
  /** One syllable of the word as written. */
  syllable: string;
  /** The character it comes from; null for a native or unalignable syllable. */
  char: string | null;
}

/**
 * The word's syllables, each with the hanja it comes from. KRDict's origin
 * can list variants ("期待/企待하다": the first is kept), mix in native
 * endings ("歡迎하다") and loanwords in Latin letters ("高速bus"): hanja and
 * Hangul take one syllable each; around a Latin run the parts before and
 * after are aligned from the word's start and end. Null when nothing aligns.
 */
export function alignHanja(lemma: string, originalForm: string | null): SyllableHanja[] | null {
  if (!originalForm || !HANJA.test(originalForm)) return null;
  // Variants: "專門/顓門" → "專門", "連絡/聯絡하다" → "連絡하다".
  const origin = originalForm.normalize("NFC").replace(/\/[㐀-䶿一-鿿豈-﫿]+/gu, "");
  const syllables = [...lemma.normalize("NFC")].filter((char) => HANGUL.test(char));
  if (syllables.length === 0) return null;

  // Split the origin around runs of anything that is neither hanja nor Hangul.
  const parts = origin.split(/[^㐀-䶿一-鿿豈-﫿가-힣\s^\-·]+/u);
  const clean = (part: string) => [...part].filter((char) => HANJA.test(char) || HANGUL.test(char));
  const result: SyllableHanja[] = syllables.map((syllable) => ({ syllable, char: null }));
  const head = clean(parts[0]);
  const tail = parts.length > 1 ? clean(parts[parts.length - 1]) : [];
  if (parts.length === 1 && head.length !== syllables.length) return null;

  const place = (chars: string[], start: number) =>
    chars.forEach((char, i) => {
      const at = start + i;
      if (at < 0 || at >= syllables.length) return;
      // A Hangul character in the origin must be the same syllable — else the
      // alignment is off and that syllable stays plain.
      if (HANJA.test(char)) result[at].char = char;
    });
  place(head, 0);
  if (tail.length) place(tail, syllables.length - tail.length);
  return result.some((item) => item.char) ? result : null;
}

export interface HanjaInfo {
  char: string;
  /** Korean readings ("소"; "락,낙,악,요" for 樂). */
  hangul: string[];
  /** English meaning from Unihan, or null. */
  definition: string | null;
}

/**
 * Unihan's meaning without its dictionary bookkeeping: "moon; month; Kangxi
 * radical 74" → "moon; month". Null when nothing is left.
 */
function cleanDefinition(definition: string | null): string | null {
  const clean = definition
    ?.replace(/[;,]?\s*Kangxi radical \d+/gi, "")
    .replace(/[;,\s]+$/, "")
    .trim();
  return clean || null;
}

/** Readings and meanings for these characters, by character. */
export async function hanjaInfo(prisma: PrismaClient, chars: string[]): Promise<Map<string, HanjaInfo>> {
  const unique = [...new Set(chars)];
  if (unique.length === 0) return new Map();
  const rows = await prisma.hanjaChar.findMany({ where: { char: { in: unique } } });
  return new Map(
    rows.map((row) => [row.char, { char: row.char, hangul: row.hangul.split(","), definition: cleanDefinition(row.definition) }]),
  );
}

export interface HanjaWord {
  lemma: string;
  originalForm: string;
  translation: string | null;
  level: string | null;
}

/**
 * Words from the dictionary built on this character — "more words" beyond
 * the user's own: beginner words first, then by length. The user's own
 * lemmas are left out.
 */
export async function dictionaryWordsWith(
  prisma: PrismaClient,
  char: string,
  exclude: string[],
  limit = 8,
): Promise<HanjaWord[]> {
  const rows = await prisma.krdictEntry.findMany({
    where: { origin: { contains: char }, lemma: { notIn: exclude } },
    select: { lemma: true, origin: true, level: true, senses: true },
    take: 200,
  });
  const levelRank = (level: string | null) => (level === "초급" ? 0 : level === "중급" ? 1 : level === "고급" ? 2 : 3);
  const seen = new Set<string>();
  return rows
    .sort((a, b) => levelRank(a.level) - levelRank(b.level) || a.lemma.length - b.lemma.length)
    .filter((row) => !seen.has(row.lemma) && seen.add(row.lemma))
    .slice(0, limit)
    .map((row) => ({
      lemma: row.lemma,
      originalForm: row.origin ?? "",
      translation: realTranslation((row.senses as { translation?: string }[])[0]?.translation) ?? null,
      level: row.level && row.level !== "없음" ? row.level : null,
    }));
}
