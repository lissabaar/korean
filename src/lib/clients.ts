/**
 * Server-side clients that need secret keys: the Anthropic SDK (the AI) and
 * the dictionary API keys. Re-exports `prisma` from db.ts for convenience.
 *
 * Keys come from environment variables (.env locally, the Vercel dashboard
 * in production); a missing required key fails loudly at start-up. Server
 * only — never import this from a "use client" file.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { DictionaryKeys } from "./dictionary/krdict";

export { prisma } from "./db";

export const anthropic = new Anthropic({
  apiKey: requireEnv("ANTHROPIC_API_KEY"),
});

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
