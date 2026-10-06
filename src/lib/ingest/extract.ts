/**
 * Turning raw material into candidate words.
 *
 * The model does exactly two things here, both of which are analysis rather
 * than fact retrieval:
 *
 *   1. Morphological analysis — 먹었어요 in the text, 먹다 in the dictionary.
 *      Korean inflection means a raw substring search finds nothing.
 *   2. Context — which sense was meant, and which category the word belongs
 *      to. Neither is in a dictionary.
 *
 * Everything the model returns is a *claim*. Definitions, readings, levels
 * and examples are never taken from it; those come from the dictionary in
 * the next stage, and any lemma the dictionary does not recognise is
 * discarded as a failed analysis.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { BASE_CATEGORIES } from "./categories";

export const EXTRACTION_MODEL = "claude-sonnet-4-6";

/** Words plus what the call cost, so the caller can meter it. */
export interface Extraction {
  words: ExtractedWord[];
  model: string;
  usage: Anthropic.Usage;
}

const REGISTERS = [
  "NEUTRAL",
  "FORMAL",
  "POLITE",
  "CASUAL",
  "HONORIFIC",
  "HUMBLE",
  "WRITTEN",
  "SLANG",
] as const;

/**
 * The response shape, enforced by the API (structured outputs) rather than
 * requested in the prompt. Asking nicely for JSON is not enough: the model
 * occasionally answers in prose, which used to crash the whole analysis.
 */
const ExtractedWordSchema = z.object({
  /** Dictionary form, to be verified against the dictionary. */
  lemma: z.string(),
  /** The form as it appeared in the text. */
  surface: z.string(),
  /** The sentence it appeared in, for the card's context note. */
  sentence: z.string(),
  /**
   * One category, picked from a closed list (the built-in taxonomy plus the
   * user's own). Free-form extras used to be allowed and produced oddly
   * narrow categories ("cutting"), so the model no longer invents any.
   */
  category: z.string(),
  /** Model's reading of which sense was meant here. */
  contextNote: z.string(),
  /**
   * One-to-three-word English gloss of the meaning used here. Only used to
   * pick the right dictionary homograph (공원: park 公園, not worker 工員) —
   * never shown or stored as a translation.
   */
  gloss: z.string(),
  /** Politeness level, where the word carries one. */
  register: z.enum(REGISTERS).nullable(),
});

const ExtractionSchema = z.object({ words: z.array(ExtractedWordSchema) });

export type ExtractedWord = z.infer<typeof ExtractedWordSchema>;

const SYSTEM_PROMPT = `You analyse Korean text for a vocabulary learning app.

The input is running text (an article, a lesson, subtitles), a screenshot or photo of any of those, or a word list a learner wrote down, often with a translation or meaning next to each word in any language ("공원 — парк", "먹다 to eat"). For a word list, the learner's own meaning tells you which homograph they mean: base the gloss on it, and leave sentence empty unless the list includes one.

For each distinct content word in the text, return:
- lemma: the dictionary form (기본형). For verbs and adjectives this ends in 다.
- surface: the form exactly as it appears in the text
- sentence: the full sentence it appeared in, unmodified; empty for a bare word list
- category: exactly one, copied verbatim from the category list supplied below — the closest fit. Never invent a category.
- contextNote: one sentence in English on which meaning is used here
- gloss: the meaning used here as a plain English word or two ("park", "to eat") — this picks between dictionary homographs, so name the meaning, not the form
- register: the politeness level, or null if the word carries no particular level

Rules:
- Skip particles (조사), common auxiliary verbs, and pure grammar.
- Skip proper nouns unless they are culturally significant vocabulary.
- One entry per distinct lemma. If a word appears several times, pick the clearest occurrence.
- Do not invent definitions or translations. Those come from a dictionary.
- Getting the lemma right matters most. If unsure of the dictionary form, give your best analysis anyway.`;

/** What the words come from: pasted or file text, or one image. */
export type ExtractSource =
  | { kind: "text"; text: string }
  | { kind: "image"; data: string; mediaType: ImageMediaType }
  /** A request in plain words: "weather words", "food for beginners". */
  | { kind: "topic"; topic: string };

/**
 * Topic requests: the model proposes words, the dictionary decides whether
 * they are real — an invented word fails lookup and never becomes a card,
 * exactly as with extraction.
 */
const TOPIC_PROMPT = `You suggest Korean vocabulary for a learning app.

The learner describes what they want in their own words, in any language — a topic, a situation, a level ("weather", "words for ordering in a cafe, beginner"). Suggest the most useful words for it: common, current, standard-dictionary words; respect a level if one is given, otherwise mix beginner and intermediate.

For each word return:
- lemma: the dictionary form (기본형); verbs and adjectives end in 다
- surface: same as lemma
- sentence: one short, natural example sentence using the word (polite 해요체)
- category: exactly one, copied verbatim from the category list supplied below — the closest fit. Never invent a category.
- contextNote: one sentence in English on the meaning
- gloss: the meaning as a plain English word or two
- register: the politeness level, or null if the word carries no particular level

Do not invent definitions or translations. Those come from a dictionary.`;

export const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

export interface ExtractOptions {
  /** Cap on words returned, so one long text cannot create 300 cards. */
  maxWords?: number;
  /** The user's own categories, offered alongside the built-in ones. */
  existingCategories?: string[];
  signal?: AbortSignal;
}

function buildInstructions(options: ExtractOptions): string {
  const parts: string[] = [];

  const allowed = [...new Set([...(options.existingCategories ?? []), ...BASE_CATEGORIES])];
  parts.push(
    `Category list — "category" MUST be one of these, verbatim. The learner's own categories come first; prefer one of them when it fits:\n${allowed.join(", ")}`,
  );

  if (options.maxWords) {
    parts.push(
      `Return at most ${options.maxWords} words. If the text has more, pick the ones most worth learning.`,
    );
  }

  return parts.join("\n\n");
}

function buildContent(source: ExtractSource, options: ExtractOptions): Anthropic.ContentBlockParam[] {
  const instructions = buildInstructions(options);
  if (source.kind === "text") {
    return [{ type: "text", text: `${instructions}\n\nText:\n${source.text}` }];
  }
  if (source.kind === "topic") {
    return [{ type: "text", text: `${instructions}\n\nRequest:\n${source.topic}` }];
  }
  return [
    {
      type: "image",
      source: { type: "base64", media_type: source.mediaType, data: source.data },
    },
    {
      type: "text",
      text: `${instructions}\n\nThe text is in the image above (a screenshot or photo). Read the Korean in it; skip interface labels and buttons unless they are vocabulary worth learning. Translations or notes written next to words are the learner's meanings.`,
    },
  ];
}

/** One structured-output call; throws when the model did not finish. */
async function requestWords(
  client: Anthropic,
  system: string,
  content: string | Anthropic.ContentBlockParam[],
  signal?: AbortSignal,
): Promise<Extraction> {
  const response = await client.messages.parse(
    {
      model: EXTRACTION_MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(ExtractionSchema) },
    },
    { signal },
  );

  if (!response.parsed_output) {
    // max_tokens cuts the JSON off; refusal returns no JSON at all.
    throw new Error(`Extraction returned no result (stop_reason: ${response.stop_reason})`);
  }
  return {
    words: response.parsed_output.words,
    model: EXTRACTION_MODEL,
    usage: response.usage,
  };
}

export async function extractWords(
  source: ExtractSource,
  client: Anthropic,
  options: ExtractOptions = {},
): Promise<Extraction> {
  const { words, ...meta } = await requestWords(
    client,
    source.kind === "topic" ? TOPIC_PROMPT : SYSTEM_PROMPT,
    buildContent(source, options),
    options.signal,
  );

  return {
    ...meta,
    words: words
      .filter((word) => word.lemma && word.surface)
      .map((word) => ({
        ...word,
        lemma: word.lemma.normalize("NFC").trim(),
        surface: word.surface.normalize("NFC").trim(),
        category: word.category.toLowerCase().trim(),
      })),
  };
}
