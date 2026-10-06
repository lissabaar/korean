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
import type { TokenUsage } from "../ai-budget";
import { z } from "zod";
import { BASE_CATEGORIES } from "./categories";

/**
 * Sonnet 4.6, without thinking. Sonnet 5.5 was tried (cheaper per token)
 * but its thinking cannot be switched off: measured on real imports it wrote
 * ~4 800 output tokens per call against ~360 here — about 5× the cost.
 */
export const EXTRACTION_MODEL = "claude-sonnet-4-6";

/** Words plus what the call cost, so the caller can meter it. */
export interface Extraction {
  words: ExtractedWord[];
  model: string;
  usage: TokenUsage;
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
  /** A single word, or a phrase / sentence learned as a whole. */
  kind: z.enum(["word", "phrase"]),
  /**
   * A short English meaning. A fallback only: used when no dictionary knows
   * the lemma (phrases, compounds), and then stored marked as source AI.
   */
  meaning: z.string(),
  /**
   * The meaning the learner wrote next to the word in the input, verbatim
   * and in whatever language; empty when they wrote none. It wins over the
   * dictionary's translation unless the user chooses otherwise.
   */
  userMeaning: z.string(),
  /** The learner's spelling was wrong and the lemma corrects it. */
  misspelled: z.boolean(),
  /**
   * Whether the learner's meaning is a real meaning of this word. false
   * flags a likely mistake (배 — "car"); the user then decides.
   */
  userMeaningFits: z.boolean(),
});

const ExtractionSchema = z.object({ words: z.array(ExtractedWordSchema) });

export type ExtractedWord = z.infer<typeof ExtractedWordSchema>;

const SYSTEM_PROMPT = `You analyse Korean text for a vocabulary learning app.

The input is running text (an article, a lesson, subtitles), a screenshot or photo of any of those, or a word list a learner wrote down, often with a translation or meaning next to each word in any language ("공원 — парк", "먹다 to eat"). For a word list, the learner's own meaning tells you which homograph they mean: base the gloss on it, and leave sentence empty unless the list includes one.

For each distinct content word — and, when phrases are wanted (see the instructions below), each phrase or sentence worth learning as a whole — return:
- lemma: the dictionary form (기본형). For verbs and adjectives this ends in 다.
- surface: the form exactly as it appears in the text
- sentence: the full sentence it appeared in, unmodified; empty for a bare word list
- category: exactly one, copied verbatim from the category list supplied below — the closest fit. Never invent a category.
- contextNote: one sentence in English on which meaning is used here
- gloss: the meaning used here as a plain English word or two ("park", "to eat") — this picks between dictionary homographs, so name the meaning, not the form
- register: the politeness level, or null if the word carries no particular level
- kind: "word" for a single word, "phrase" for a set expression, collocation or sentence kept whole
- meaning: a short, accurate English meaning of the lemma as used here (for a phrase, its natural English equivalent). It is only used when no dictionary has the entry.
- userMeaning: the meaning the learner wrote next to this entry in the input, copied verbatim in its own language ("парк", "to eat"); an empty string if they wrote none
- misspelled: true only if the learner's written form was a misspelling you corrected in the lemma (not merely an inflected, bracketed or abbreviated form)
- userMeaningFits: false if the learner's meaning is not a real meaning of this Korean word in any of its senses (a likely mistake); true if it fits, or if there is no learner meaning. Judge the learner's meaning as written — do not reinterpret it to make it fit.

Rules:
- Skip particles (조사), common auxiliary verbs, and pure grammar.
- Skip proper nouns unless they are culturally significant vocabulary.
- One entry per distinct lemma. If a word appears several times, pick the clearest occurrence.
- Definitions, examples and translations come from a dictionary whenever it has the entry; "meaning" is only the fallback for what it lacks.
- Phrases (only when wanted): set expressions, collocations and sentences worth learning whole. The lemma is the phrase in its natural, complete form — fill a template's blanks with a typical word or drop them, keep a sentence's natural polite ending; surface is the phrase as it appears. Single words inside a phrase may also be returned as words.
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
- kind: "word", or "phrase" for a useful expression or sentence (only when phrases are wanted)
- meaning: a short, accurate English meaning — only used if no dictionary has the entry
- userMeaning: an empty string
- misspelled: false
- userMeaningFits: true

Definitions, examples and translations come from a dictionary whenever it has the entry.`;

export const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

export interface ExtractOptions {
  /** Cap on words returned, so one long text cannot create 300 cards. */
  maxWords?: number;
  /** The user's own categories, offered alongside the built-in ones. */
  existingCategories?: string[];
  /** Also return phrases and sentences to learn whole (default: words only). */
  phrases?: boolean;
  signal?: AbortSignal;
}

function buildInstructions(options: ExtractOptions): string {
  const parts: string[] = [];

  const allowed = [...new Set([...(options.existingCategories ?? []), ...BASE_CATEGORIES])];
  parts.push(
    `Category list — "category" MUST be one of these, verbatim. The learner's own categories come first; prefer one of them when it fits:\n${allowed.join(", ")}`,
  );

  parts.push(
    options.phrases
      ? `Phrases are wanted: besides words, return useful phrases and sentences as kind "phrase". If the input is a list of phrases or sentences, or a screenshot of them, keep each one as a phrase.`
      : `Return single words only (kind "word"), no phrases.`,
  );

  if (options.maxWords) {
    parts.push(
      `Return at most ${options.maxWords} entries. If the text has more, pick the ones most worth learning.`,
    );
  }

  return parts.join("\n\n");
}

function buildContent(
  source: ExtractSource,
  options: ExtractOptions,
): Anthropic.ContentBlockParam[] {
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
      // Thinking counts towards max_tokens as well as the JSON.
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(ExtractionSchema) },
    },
    { signal },
  );

  if (response.stop_reason === "refusal") {
    throw new Error("The model declined this input");
  }
  if (!response.parsed_output) {
    // max_tokens cuts the JSON off.
    throw new Error(`Extraction returned no result (stop_reason: ${response.stop_reason})`);
  }
  return {
    words: response.parsed_output.words,
    // The model that actually answered — the fallback one if it ran.
    model: response.model,
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
