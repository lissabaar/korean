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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}
