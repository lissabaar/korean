/**
 * Turning dropped files into analysis jobs — in the browser.
 *
 * Every format is reduced to what the analyse endpoint accepts: chunks of
 * text, or one downscaled image. Parsing happens here rather than on the
 * server so a 200 MB Anki deck full of audio never leaves the machine —
 * only the note text does.
 */

import Papa from "papaparse";
import type { ImageMediaType } from "@/lib/ingest/extract";

export type JobPayload =
  | { text: string }
  | { topic: string }
  | { image: { data: string; mediaType: ImageMediaType } };

export interface ImportJob {
  id: string;
  sourceId: string;
  payload: JobPayload;
}

export interface ImportSource {
  id: string;
  name: string;
  /** Stored as the material kind; GENERATED = words suggested for a topic. */
  kind: "TEXT" | "IMAGE" | "GENERATED";
  /** Stored with the saved words as the material they came from. */
  text: string;
  /** Human summary, e.g. "Anki deck · 312 notes". */
  summary: string;
  /** A category name the file itself carries (a ReWord category). */
  suggestedCategory?: string;
  jobs: ImportJob[];
}

/** One model call per chunk: small enough to finish well within limits. */
const CHUNK_LINES = 40;
const CHUNK_CHARS = 6000;

/** Claude reads images up to this long edge without downscaling them itself. */
const IMAGE_MAX_EDGE = 1568;

const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/;

export const ACCEPTED_FILES =
  "image/png,image/jpeg,image/webp,image/gif,.apkg,.colpkg,.reword,.csv,.tsv,.txt,.md,.srt,.vtt";

let counter = 0;
const nextId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export class UnsupportedFileError extends Error {}

export async function readFile(file: File): Promise<ImportSource> {
  const name = file.name;
  const ext = name.toLowerCase().split(".").pop() ?? "";

  if (file.type.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(ext)) {
    return imageSource(file);
  }
  if (ext === "apkg" || ext === "colpkg") {
    const { readAnkiPackage } = await import("./anki");
    const lines = await readAnkiPackage(await file.arrayBuffer());
    return textSource(name, lines, `Anki deck · ${lines.length} notes with Korean`);
  }
  if (ext === "reword") {
    const { readRewordPackage } = await import("./reword");
    const deck = readRewordPackage(await file.arrayBuffer());
    const source = textSource(
      name,
      deck.lines,
      `ReWord · ${deck.lines.length} words${deck.duplicates ? ` (${deck.duplicates} repeats removed)` : ""}`,
    );
    if (deck.name) source.suggestedCategory = deck.name.toLowerCase();
    return source;
  }
  if (ext === "csv" || ext === "tsv") {
    const lines = tableLines(await file.text());
    return textSource(name, lines, `Table · ${lines.length} rows with Korean`);
  }
  if (["txt", "md", "srt", "vtt"].includes(ext) || file.type.startsWith("text/")) {
    const raw = await file.text();
    // Anki's "Notes in Plain Text" export: tab-separated, # header lines.
    if (/^#separator:/m.test(raw)) {
      const lines = tableLines(raw);
      return textSource(name, lines, `Anki notes · ${lines.length} with Korean`);
    }
    return textSource(name, proseLines(ext === "srt" || ext === "vtt" ? stripSubtitleTiming(raw) : raw), "Text");
  }
  throw new UnsupportedFileError(`${name}: this file type is not supported`);
}

export function sourceFromText(text: string, name = "Pasted text"): ImportSource {
  return textSource(name, proseLines(text), "Text");
}

/** True when the input has no Korean at all — then it is read as a topic. */
export function isTopicRequest(text: string): boolean {
  return text.trim().length > 0 && !HANGUL.test(text);
}

/** "weather words", "ordering in a cafe, beginner" → one suggestion request. */
export function sourceFromTopic(topic: string): ImportSource {
  const id = nextId("s");
  const clean = topic.trim().slice(0, 300);
  return {
    id,
    name: `Topic: ${clean}`,
    kind: "GENERATED",
    text: clean,
    summary: "Words suggested by AI, checked against the dictionary",
    jobs: [{ id: nextId("j"), sourceId: id, payload: { topic: clean } }],
  };
}

// ---------------------------------------------------------------- text

function textSource(name: string, lines: string[], summary: string): ImportSource {
  const id = nextId("s");
  const chunks = chunkLines(lines);
  if (chunks.length === 0) {
    throw new UnsupportedFileError(`${name}: no Korean text found`);
  }
  return {
    id,
    name,
    kind: "TEXT",
    text: lines.join("\n"),
    summary: chunks.length > 1 ? `${summary} · ${chunks.length} parts` : summary,
    jobs: chunks.map((text) => ({ id: nextId("j"), sourceId: id, payload: { text } })),
  };
}

/** Running text: keep lines, split overlong paragraphs at sentence ends. */
function proseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .flatMap((line) =>
      line.length <= CHUNK_CHARS ? [line] : line.split(/(?<=[.!?。…])\s+/),
    )
    .map((line) => line.trim())
    .filter((line) => HANGUL.test(line));
}

/** CSV/TSV and Anki text exports: one row → "field — field — field". */
function tableLines(text: string): string[] {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true, comments: "#" });
  return parsed.data
    .map((row) => fieldsToLine(row))
    .filter((line): line is string => line !== null);
}

/**
 * The first few fields of a row or note are the word and its meaning;
 * later ones tend to be tags, audio and ids. HTML from Anki is flattened.
 */
export function fieldsToLine(fields: string[]): string | null {
  const clean = fields.map(cleanField).filter(Boolean).slice(0, 3);
  const line = clean.join(" — ").slice(0, 400);
  return HANGUL.test(line) ? line : null;
}

function cleanField(value: string): string {
  return htmlToText(
    value
      .replace(/\[sound:[^\]]*\]/g, "")
      // Cloze {{c1::answer::hint}} → answer
      .replace(/\{\{c\d+::(.*?)(?:::.*?)?\}\}/g, "$1"),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToText(html: string): string {
  if (!/[<&]/.test(html)) return html;
  const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, " "), "text/html");
  return doc.body.textContent ?? "";
}

function stripSubtitleTiming(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\d+$/.test(line.trim()) && !/-->/.test(line) && line.trim() !== "WEBVTT")
    .join("\n");
}

function chunkLines(lines: string[]): string[] {
  const chunks: string[] = [];
  let current: string[] = [];
  let size = 0;
  for (const line of lines) {
    if (current.length >= CHUNK_LINES || (size + line.length > CHUNK_CHARS && current.length)) {
      chunks.push(current.join("\n"));
      current = [];
      size = 0;
    }
    current.push(line);
    size += line.length + 1;
  }
  if (current.length) chunks.push(current.join("\n"));
  return chunks;
}

// ---------------------------------------------------------------- images

async function imageSource(file: File): Promise<ImportSource> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new UnsupportedFileError(
      `${file.name}: the browser cannot open this image. Save it as PNG or JPEG and try again.`,
    );
  }

  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d")!;
  // JPEG has no transparency; a transparent screenshot would turn black.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), "image/jpeg", 0.85),
  );
  const data = await blobToBase64(blob);

  const id = nextId("s");
  return {
    id,
    name: file.name || "Pasted image",
    kind: "IMAGE",
    text: "",
    summary: `Image · ${canvas.width}×${canvas.height}`,
    jobs: [{ id: nextId("j"), sourceId: id, payload: { image: { data, mediaType: "image/jpeg" } } }],
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
