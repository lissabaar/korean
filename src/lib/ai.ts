/**
 * Which AI provider the app talks to, and the one small interface it talks
 * through.
 *
 * Every model call in the app is "one prompt in, one structured (JSON) answer
 * out" — extraction, meanings, examples, translations, re-sorting. This file
 * describes exactly that call (`AiClient.messages.parse`) so the rest of the
 * code does not care whether Claude or Gemini answers. The shape is the same
 * as the Anthropic SDK's `messages.parse`, on purpose: the real Anthropic
 * client already fits it, and the Gemini adapter (`ai-gemini.ts`) imitates it.
 *
 * Provider choice comes from the AI_PROVIDER environment variable:
 *   anthropic (default) — Claude, key ANTHROPIC_API_KEY
 *   gemini              — Google Gemini, key GEMINI_API_KEY
 *
 * Imported by: clients.ts (builds the client), every file under words/ and
 * ingest/ that calls the model (for the types and AI_MODEL), ai-budget.ts
 * (prices), the privacy page (which provider to name). Contains no secrets
 * and no SDK imports, so it is safe to import anywhere on the server.
 */

import type { TokenUsage } from "./ai-budget";

/** The providers the app can use. */
export type AiProvider = "anthropic" | "gemini";

/**
 * The provider selected by AI_PROVIDER. Anything that is not exactly
 * "gemini" means Claude, so a typo never silently switches the provider.
 */
export function aiProvider(): AiProvider {
  return process.env.AI_PROVIDER?.trim().toLowerCase() === "gemini" ? "gemini" : "anthropic";
}

/**
 * Model used when AI_PROVIDER=gemini and GEMINI_MODEL is not set. The
 * cheapest current Gemini model: it has a free tier (Google AI Studio key,
 * no card) and costs $0.30 / $2.50 per million tokens when paid.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

/**
 * Sonnet 4.6, without thinking — the Claude model the app was tuned on (see
 * the note in ingest/extract.ts and "Decisions already made" in CLAUDE.md).
 */
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";

/**
 * The model name every call passes: the Claude model, or GEMINI_MODEL
 * (default DEFAULT_GEMINI_MODEL) when the provider is Gemini. Evaluated once
 * at start-up, like the other environment settings.
 */
export const AI_MODEL: string =
  aiProvider() === "gemini"
    ? process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL
    : DEFAULT_CLAUDE_MODEL;

/** Human-readable provider name for pages shown to users. */
export function aiProviderName(): string {
  return aiProvider() === "gemini" ? "Google Gemini" : "Anthropic's Claude";
}

/** One part of a user message: plain text, or an image (base64). */
export type AiContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        data: string;
      };
    };

/**
 * The structured-output format of a call: a JSON schema the answer must
 * follow, and a function that parses and validates the answer text.
 * `zodOutputFormat(zodSchema)` from the Anthropic SDK produces exactly this,
 * and both providers use it, so a response shape is written once, in Zod.
 */
export interface AiOutputFormat<T> {
  schema: Record<string, unknown>;
  parse(content: string): T;
}

/** The arguments of one call. */
export interface AiParseParams<T> {
  model: string;
  /** Upper bound for the answer; for Gemini the thinking tokens count too. */
  max_tokens: number;
  system?: string;
  messages: { role: "user"; content: string | AiContentBlock[] }[];
  output_config: { format: AiOutputFormat<T> };
}

/**
 * What a call returns. `parsed_output` is null when the answer was cut off
 * or refused; callers check `stop_reason` ("refusal", "max_tokens", …) and
 * record `usage` so the call is metered (ai-budget.ts).
 */
export interface AiParsedResponse<T> {
  parsed_output: T | null;
  stop_reason: string | null;
  /** The model that actually answered. */
  model: string;
  usage: TokenUsage;
}

/** The client the rest of the app receives from `clients.ts`. */
export interface AiClient {
  messages: {
    parse<T>(
      params: AiParseParams<T>,
      options?: { signal?: AbortSignal },
    ): Promise<AiParsedResponse<T>>;
  };
}
