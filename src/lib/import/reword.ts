/**
 * Reading a ReWord category export (.reword) in the browser.
 *
 * The file is a zip: a JSON file named "data", plus TTS audio (mp3) and
 * pictures, which are skipped. Seen in a real export:
 *
 *   { type: "category", flavor: "kor", eng: "<category name>",
 *     words: [{ wrd: "직장", eng: "workplace, job", rus: "рабочее место", ... }] }
 *
 * The data is hand-made and messy — `eng` often holds Russian, `wrd` can be
 * "취소(하다)", "예를 들[어/면/어서]" or a sentence template with blanks, and
 * words repeat. That is left to the analysis step (the model normalises,
 * the dictionary verifies); here every entry just becomes one
 * "word — meaning" line, duplicates dropped.
 */

import { unzipSync } from "fflate";
import { UnsupportedFileError } from "./read";

interface RewordWord {
  wrd?: unknown;
  eng?: unknown;
  rus?: unknown;
}

export interface RewordDeck {
  name: string | null;
  lines: string[];
  duplicates: number;
}

const HANGUL = /[가-힣]/;
const text = (value: unknown) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "");

/**
 * Read a ReWord .reword export (a zip with JSON inside) into text lines "word —
 * translation", skipping duplicates and lines without Hangul.
 */
export function readRewordPackage(buffer: ArrayBuffer): RewordDeck {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buffer), { filter: (file) => file.name === "data" });
  } catch {
    throw new UnsupportedFileError("This does not look like a ReWord export (not a valid zip).");
  }
  if (!files.data) throw new UnsupportedFileError("No word list found inside this ReWord file.");

  let parsed: { eng?: unknown; words?: unknown };
  try {
    parsed = JSON.parse(new TextDecoder().decode(files.data));
  } catch {
    throw new UnsupportedFileError("The word list inside this ReWord file is damaged.");
  }
  const words = Array.isArray(parsed.words) ? (parsed.words as RewordWord[]) : [];

  const seen = new Set<string>();
  const lines: string[] = [];
  let duplicates = 0;
  for (const word of words) {
    const korean = text(word.wrd);
    if (!HANGUL.test(korean)) continue;
    const key = korean.normalize("NFC");
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    // `eng` and `rus` are both "the meaning", in whichever language was typed.
    const meanings = [...new Set([text(word.eng), text(word.rus)].filter(Boolean))];
    lines.push(meanings.length ? `${korean} — ${meanings.join(" / ")}`.slice(0, 400) : korean);
  }

  const name = text(parsed.eng);
  return { name: name || null, lines, duplicates };
}
