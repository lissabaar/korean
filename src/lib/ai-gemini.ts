/**
 * The Gemini side of the AI layer: an `AiClient` (see ai.ts) that answers
 * with Google's Gemini models instead of Claude.
 *
 * It imitates the one Anthropic call the app uses, `messages.parse`: the same
 * parameters in (system prompt, a user message that may hold an image, a JSON
 * schema from Zod) and the same fields out (`parsed_output`, `stop_reason`,
 * `model`, `usage`). So nothing else in the app changes when the provider
 * does.
 *
 * What it translates:
 *   - the user message → Gemini "contents" (text parts, inline image parts);
 *   - `output_config.format.schema` → `responseJsonSchema`, so the answer is
 *     JSON that follows the schema (never "please reply in JSON" in the prompt);
 *   - Gemini's finish reasons → Anthropic-style stop reasons, so callers'
 *     `refusal` / `max_tokens` checks keep working;
 *   - token counts → `usage`. Gemini bills its "thinking" tokens as output,
 *     so they are added to output_tokens — otherwise the credit meter would
 *     under-count the real cost.
 *
 * Thinking is kept at the lowest level (GEMINI_THINKING, default "minimal"):
 * the tasks here are lookups and classification, and thinking tokens are
 * what made Sonnet 5.5 five times more expensive (see ingest/extract.ts).
 *
 * Created by clients.ts when AI_PROVIDER=gemini. The Google SDK retries
 * rate-limit (429) and server errors by itself, which matters on the free
 * tier, where the per-minute limits are low.
 */

import { GoogleGenAI, FinishReason, ThinkingLevel } from "@google/genai";
import type { AiClient, AiContentBlock, AiParsedResponse, AiParseParams } from "./ai";

/** GEMINI_THINKING values → the SDK's thinking levels. */
const THINKING_LEVELS: Record<string, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/**
 * The thinking level from GEMINI_THINKING; "minimal" when unset or unknown.
 * Some models (Gemini 3.8 Flash) do not offer "minimal" — set "low" for them.
 */
function thinkingLevel(): ThinkingLevel {
  const wanted = process.env.GEMINI_THINKING?.trim().toLowerCase() ?? "";
  return THINKING_LEVELS[wanted] ?? ThinkingLevel.MINIMAL;
}

/**
 * The JSON schema to send: the Zod-derived one without the `$schema` marker
 * (a JSON-Schema draft URL that Gemini's schema field has no use for).
 */
function geminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...schema };
  delete rest.$schema;
  return rest;
}

/** One block of the user message → one Gemini part. */
function toPart(block: AiContentBlock) {
  return block.type === "text"
    ? { text: block.text }
    : { inlineData: { mimeType: block.source.media_type, data: block.source.data } };
}

/**
 * Gemini finish reason → Anthropic-style stop reason. Content-policy stops
 * become "refusal" (callers skip the batch), a cut-off answer "max_tokens".
 */
function stopReason(reason: FinishReason | undefined, blocked: boolean): string {
  if (blocked) return "refusal";
  switch (reason) {
    case FinishReason.STOP:
    case undefined:
      return "end_turn";
    case FinishReason.MAX_TOKENS:
      return "max_tokens";
    case FinishReason.SAFETY:
    case FinishReason.PROHIBITED_CONTENT:
    case FinishReason.BLOCKLIST:
    case FinishReason.SPII:
    case FinishReason.RECITATION:
      return "refusal";
    default:
      return String(reason).toLowerCase();
  }
}

/**
 * Build the Gemini client. `fetchImpl` exists for tests only (scripts can
 * pass a fake fetch to check the request without a key or a network).
 */
export function createGeminiClient(apiKey: string, fetchImpl?: typeof fetch): AiClient {
  const genai = new GoogleGenAI({
    apiKey,
    // v1beta, because that is the version Google's own examples for structured
    // output and thinking levels use; the SDK's default (v1) may lag behind.
    httpOptions: { apiVersion: "v1beta", ...(fetchImpl ? { fetch: fetchImpl } : {}) },
  });

  return {
    messages: {
      async parse<T>(
        params: AiParseParams<T>,
        options?: { signal?: AbortSignal },
      ): Promise<AiParsedResponse<T>> {
        const [message] = params.messages;
        const blocks: AiContentBlock[] =
          typeof message.content === "string"
            ? [{ type: "text", text: message.content }]
            : message.content;

        const response = await genai.models.generateContent({
          model: params.model,
          contents: [{ role: "user", parts: blocks.map(toPart) }],
          config: {
            systemInstruction: params.system,
            maxOutputTokens: params.max_tokens,
            responseMimeType: "application/json",
            responseJsonSchema: geminiSchema(params.output_config.format.schema),
            thinkingConfig: { thinkingLevel: thinkingLevel() },
            abortSignal: options?.signal,
          },
        });

        const usageMetadata = response.usageMetadata;
        const usage = {
          input_tokens: usageMetadata?.promptTokenCount ?? 0,
          // Thinking tokens are billed like output tokens.
          output_tokens:
            (usageMetadata?.candidatesTokenCount ?? 0) + (usageMetadata?.thoughtsTokenCount ?? 0),
        };

        const reason = stopReason(
          response.candidates?.[0]?.finishReason,
          Boolean(response.promptFeedback?.blockReason),
        );
        const model = response.modelVersion ?? params.model;

        // A refused or cut-off answer has no usable JSON.
        const text = response.text;
        if (reason !== "end_turn" || !text) {
          return { parsed_output: null, stop_reason: reason, model, usage };
        }
        // Throws when the JSON does not match the Zod schema, like the Anthropic helper.
        return {
          parsed_output: params.output_config.format.parse(text),
          stop_reason: reason,
          model,
          usage,
        };
      },
    },
  };
}
