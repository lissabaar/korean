/**
 * Spoken Korean from Gemini text-to-speech (library, server only).
 *
 * What it does: turns a Korean word or phrase into a playable WAV file.
 * Gemini returns raw PCM (24 kHz, 16-bit, mono) as base64; browsers cannot
 * play raw PCM, so `pcmToWav()` puts the 44-byte WAV header in front of it.
 *
 * Why it exists: the browser's own speech synthesis (SpeakButton) is muted by
 * the iPhone silent switch, while a real audio file played through an
 * <audio> element is not. The file is made ONCE per text and kept in the
 * WordAudio table (see app/api/tts/route.ts), so Gemini is paid for a word
 * only the first time anyone asks for it.
 *
 * Called by: app/api/tts/route.ts. Calls: @google/genai (the Gemini API).
 */

import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";

/** TTS model; override with GEMINI_TTS_MODEL (a different model, e.g. a newer preview). */
export const TTS_MODEL = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";

/** Prebuilt Gemini voice; override with GEMINI_TTS_VOICE. Gemini speaks the language of the text. */
export const TTS_VOICE = process.env.GEMINI_TTS_VOICE || "Kore";

/** Longest text we voice (a word or a short phrase); longer input is refused. */
export const TTS_MAX_CHARS = 120;

/** Gemini's fixed output format. */
const SAMPLE_RATE = 24000;

/** What a synthesis returns: the WAV file and the tokens Gemini billed (for the credit meter). */
export interface Speech {
  wav: Uint8Array;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Cache key of a text: hash of voice + text, so changing GEMINI_TTS_VOICE
 * makes new files instead of serving the old voice. The text is NFC-normalised
 * first (macOS IME often types decomposed Hangul).
 */
export function audioKey(text: string): string {
  return createHash("sha256").update(`${TTS_VOICE}\n${text.normalize("NFC")}`).digest("hex");
}

/**
 * Wrap raw 16-bit mono PCM in a WAV container: a 44-byte RIFF header
 * (format = PCM, 1 channel, 24 kHz) followed by the samples.
 */
export function pcmToWav(pcm: Uint8Array): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const ascii = (offset: number, value: string) =>
    [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true); // file size minus the first 8 bytes
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // size of the fmt block
  view.setUint16(20, 1, true); // format 1 = PCM
  view.setUint16(22, 1, true); // channels
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // bytes per second
  view.setUint16(32, 2, true); // bytes per sample frame
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, pcm.length, true);

  const wav = new Uint8Array(44 + pcm.length);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcm, 44);
  return wav;
}

/**
 * Ask Gemini to say `text` in Korean and return it as a WAV file with the
 * token counts. Throws when the key is missing or Gemini returns no audio.
 *
 * The instruction prefix makes the model read the text instead of answering
 * it, and slows it down a little for a learner.
 */
export async function synthesizeKorean(text: string): Promise<Speech> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY.");
  const genai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1beta" } });
  const response = await genai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ parts: [{ text: `Say this Korean text clearly and a little slowly, nothing else: ${text}` }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } } },
    },
  });
  const base64 = response.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData?.data;
  if (!base64) throw new Error("Gemini returned no audio.");
  return {
    wav: pcmToWav(new Uint8Array(Buffer.from(base64, "base64"))),
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
  };
}
