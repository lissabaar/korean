/**
 * /api/tts?text=... — the sound of a Korean word, for the speaker button.
 *
 * Next.js route handler: an HTTP API endpoint (the folder path is the URL;
 * the exported GET handles GET requests). Server only. It is a GET on purpose:
 * the browser's <audio> element can load a URL directly, and iPhone only lets
 * audio start inside the tap when the element itself fetches the file.
 *
 * Flow: look the text up in WordAudio (shared by all users, free) → if
 * missing, ask Gemini TTS once (metered like every model call), store the WAV
 * and return it. Answers:
 *   200 audio/wav   the sound, cacheable by the browser for a year
 *   401             nobody signed in (not even an anonymous visitor)
 *   402             not stored yet and the user may not use AI (anonymous / out of credits)
 *   400 / 503 / 500 bad text / no Gemini key / Gemini failed
 * The client treats any non-200 as "use the browser's own voice instead".
 *
 * Calls: lib/tts.ts, lib/ai-budget.ts, the WordAudio table. Called by:
 * components/SpeakButton.tsx.
 */

import { NextResponse } from "next/server";
import { assertCanUseAi, AiQuotaError, recordAiUsage } from "@/lib/ai-budget";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { audioKey, synthesizeKorean, TTS_MAX_CHARS, TTS_MODEL, TTS_VOICE } from "@/lib/tts";

// Gemini answers in a few seconds; leave room for a slow call.
export const maxDuration = 60;

/** A WAV answer the browser may keep for a year (the file for a key never changes). */
function wavResponse(data: Uint8Array) {
  return new Response(data as BodyInit, {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const text = (new URL(request.url).searchParams.get("text") ?? "").normalize("NFC").trim();
  // Only Korean, and short: this is a word/phrase voice, not a free TTS service.
  if (!text || text.length > TTS_MAX_CHARS || !/[ᄀ-ᇿ㄰-㆏가-힣]/.test(text)) {
    return NextResponse.json({ error: "Not a Korean word or phrase." }, { status: 400 });
  }

  const key = audioKey(text);
  // The cache lookup must never break pronunciation: if the table is missing
  // (migration not applied yet) we just synthesise without storing.
  const stored = await prisma.wordAudio.findUnique({ where: { key }, select: { data: true } }).catch(() => null);
  if (stored) return wavResponse(stored.data);

  try {
    const balance = await assertCanUseAi(prisma, userId);
    const speech = await synthesizeKorean(text);
    await recordAiUsage(prisma, userId, balance.unlimited, TTS_MODEL, {
      input_tokens: speech.inputTokens,
      output_tokens: speech.outputTokens,
    });
    await prisma.wordAudio
      .upsert({
        where: { key },
        create: { key, text, voice: TTS_VOICE, data: new Uint8Array(speech.wav) },
        update: {},
      })
      .catch((error: unknown) => console.error("Could not store word audio:", error));
    return wavResponse(speech.wav);
  } catch (error) {
    if (error instanceof AiQuotaError) return NextResponse.json({ error: error.message }, { status: 402 });
    console.error("Text-to-speech failed:", error);
    const missingKey = error instanceof Error && error.message.startsWith("Missing GEMINI_API_KEY");
    return NextResponse.json({ error: "No sound available." }, { status: missingKey ? 503 : 500 });
  }
}
