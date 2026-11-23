/**
 * Server-side clients that need secret keys: the AI client (Claude or Gemini,
 * chosen by AI_PROVIDER — see ai.ts) and the dictionary API keys. Re-exports
 * `prisma` from db.ts for convenience.
 *
 * Keys come from environment variables (.env locally, the Vercel dashboard
 * in production); a missing required key fails loudly at start-up — only the
 * key of the selected provider is required. Server only — never import this
 * from a "use client" file.
 */

import Anthropic from "@anthropic-ai/sdk";
import { aiProvider, type AiClient } from "./ai";
import { createGeminiClient } from "./ai-gemini";
import type { DictionaryKeys } from "./dictionary/krdict";

export { prisma } from "./db";

/**
 * The AI client every model call goes through. With AI_PROVIDER=gemini it is
 * the Gemini adapter; otherwise the real Anthropic SDK client, whose
 * `messages.parse` has the shape `AiClient` describes (the cast only narrows
 * its much larger type to the part the app uses).
 */
export const ai: AiClient =
  aiProvider() === "gemini"
    ? createGeminiClient(requireEnv("GEMINI_API_KEY"))
    : (new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") }) as unknown as AiClient);

export const dictionaryKeys: DictionaryKeys = {
  krdict: requireEnv("KRDICT_API_KEY"),
  stdict: process.env.STDICT_API_KEY,
};

/**
 * An environment variable that must be set; throws a clear message if it is
 * missing.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}
