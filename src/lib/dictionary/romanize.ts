/**
 * Telling a transliteration from a translation.
 *
 * For culture-specific words KRDict's English "translation" is just the word
 * in Latin letters (전세 → "jeonse", 김치찌개 → "kimchi jjigae"), which on a
 * card reads like a transcription, not a meaning. These helpers spot that
 * case so a real English explanation can lead instead.
 *
 * Revised Romanization by syllable, without the sound-change rules; the
 * comparison is loose (g/k, d/t, b/p, r/l, spaces and hyphens ignored),
 * which is enough to recognise the dictionary's own romanization.
 */

const INITIALS = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const MEDIALS = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
const FINALS = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"];

export function romanize(hangul: string): string {
  let out = "";
  for (const char of hangul.normalize("NFC")) {
    const code = char.charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) {
      out += char;
      continue;
    }
    out += INITIALS[Math.floor(code / 588)] + MEDIALS[Math.floor((code % 588) / 28)] + FINALS[code % 28];
  }
  return out;
}

function loose(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/k/g, "g")
    .replace(/t/g, "d")
    .replace(/p/g, "b")
    .replace(/l/g, "r")
    // 떡볶이 is "tteokbokki", syllable by syllable "tteokboki": doubled
    // letters at a syllable joint are not a difference.
    .replace(/(.)\1+/g, "$1");
}

/** True when `translation` is only the Korean word written in Latin letters. */
export function isTransliteration(lemma: string, translation: string | null | undefined): boolean {
  if (!translation || !/[가-힣]/.test(lemma)) return false;
  const parts = translation.split(/[;,]/).map((part) => part.trim()).filter(Boolean);
  const target = loose(romanize(lemma.replace(/\s+/g, "")));
  return parts.length > 0 && parts.every((part) => loose(part) === target);
}

/**
 * A card-ready English meaning: the translation, unless it is a mere
 * transliteration — then the explanation leads and the transliteration
 * follows in brackets ("lump-sum deposit lease (jeonse)").
 */
export function readableMeaning(
  lemma: string,
  translation: string | null | undefined,
  explanation: string | null | undefined,
): string | null {
  if (!translation) return explanation?.trim() || null;
  if (!isTransliteration(lemma, translation)) return translation;
  const better = explanation?.trim();
  return better ? `${better} (${translation})` : translation;
}
