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
   * Categories this word belongs to, most apt first. A word genuinely can
   * sit in several (김치 is both food and culture), so this is a list —
   * but a capped one, since a word tagged with everything is tagged with
   * nothing.
   */
  categories: z.array(z.string()),
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
- categories: a list, most apt first. The FIRST entry must be chosen from the fixed list supplied below — pick the closest fit, never invent one. After it you may add at most two of your own, lowercase, only where they say something the fixed category does not.
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
  | { kind: "image"; data: string; mediaType: ImageMediaType };

export const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

export interface ExtractOptions {
  /** Cap on words returned, so one long text cannot create 300 cards. */
  maxWords?: number;
  /** Categories that already exist, so the model reuses them. */
  existingCategories?: string[];
  signal?: AbortSignal;
}

function buildInstructions(options: ExtractOptions): string {
  const parts: string[] = [];

  parts.push(
    `Fixed category list — the first entry of "categories" MUST be one of these, verbatim:\n${BASE_CATEGORIES.join(", ")}`,
  );

  if (options.existingCategories?.length) {
    parts.push(
      `Secondary categories already in use — prefer these over inventing new ones:\n${options.existingCategories.join(", ")}`,
    );
  }

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
    SYSTEM_PROMPT,
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
        categories: word.categories.map((name) => name.toLowerCase().trim()),
      })),
  };
}

/**
 * Generate a word pack for a category from scratch.
 *
 * Same contract as extraction: the model proposes lemmas, the dictionary
 * decides whether they are real. A model-invented word simply fails lookup
 * and never becomes a card.
 */
export async function generatePack(
  category: string,
  level: "beginner" | "intermediate" | "advanced",
  count: number,
  client: Anthropic,
  options: { signal?: AbortSignal } = {},
): Promise<Extraction> {
  const { words, ...meta } = await requestWords(
    client,
    `You generate Korean vocabulary lists for a learning app.

Return ${count} Korean words for the topic given, at ${level} level.
For each word give:
- lemma: dictionary form
- surface: same as lemma
- sentence: a natural example sentence using the word
- categories: just the topic, lowercase
- contextNote: one sentence in English on the core meaning
- gloss: the core meaning as a plain English word or two
- register: the politeness level, or null if none applies

Use only real, current Korean words that appear in standard dictionaries.`,
    `Topic: ${category}`,
    options.signal,
  );

  return {
    ...meta,
    words: words.map((word) => ({
      ...word,
      lemma: word.lemma.normalize("NFC").trim(),
      surface: word.lemma.normalize("NFC").trim(),
      categories: [category.toLowerCase().trim()],
    })),
  };
}
