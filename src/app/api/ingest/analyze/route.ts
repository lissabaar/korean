import { NextResponse } from "next/server";
import { analyzeText } from "@/lib/ingest/analyze";
import { anthropic, dictionaryKeys, prisma } from "@/lib/clients";
import { getUserId } from "@/lib/session";
import { AiQuotaError, assertCanUseAi, getAiBalance } from "@/lib/ai-budget";
import { DictionaryError } from "@/lib/dictionary/krdict";
import {
  IMAGE_MEDIA_TYPES,
  type ExtractSource,
  type ImageMediaType,
} from "@/lib/ingest/extract";

/** Extraction plus up to forty dictionary calls takes a while. */
export const maxDuration = 120;

/** Images are downscaled in the browser; anything near this is a mistake. */
const MAX_IMAGE_BASE64 = 4_000_000;

export async function POST(request: Request) {
  let body: {
    text?: string;
    topic?: string;
    phrases?: boolean;
    image?: { data?: string; mediaType?: string };
    maxWords?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  let source: ExtractSource;
  if (typeof body.topic === "string" && body.topic.trim()) {
    source = { kind: "topic", topic: body.topic.trim().slice(0, 300) };
  } else if (body.image) {
    const { data, mediaType } = body.image;
    if (!data || !IMAGE_MEDIA_TYPES.includes(mediaType as ImageMediaType)) {
      return NextResponse.json(
        { error: "Unsupported image. Use PNG, JPEG, GIF or WebP." },
        { status: 400 },
      );
    }
    if (data.length > MAX_IMAGE_BASE64) {
      return NextResponse.json({ error: "That image is too large." }, { status: 400 });
    }
    source = { kind: "image", data, mediaType: mediaType as ImageMediaType };
  } else {
    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "Paste some Korean text first." }, { status: 400 });
    }
    if (text.length > 20000) {
      return NextResponse.json(
        { error: "That text is too long. Split it into smaller pieces." },
        { status: 400 },
      );
    }
    source = { kind: "text", text };
  }

  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    }
    const budget = await assertCanUseAi(prisma, userId);
    const result = await analyzeText(prisma, anthropic, dictionaryKeys, {
      userId,
      source,
      unlimitedAi: budget.unlimited,
      phrases: body.phrases === true,
      maxWords: body.maxWords,
    });
    const after = await getAiBalance(prisma, userId);
    return NextResponse.json({
      ...result,
      aiCreditsLeft: after.unlimited ? null : after.remaining,
    });
  } catch (error) {
    if (error instanceof AiQuotaError) {
      const messages = {
        anonymous: "Create a free account to find words with AI — it comes with free credits.",
        user: "Your free AI credits are used up. Reviews and your saved words keep working.",
        daily: "The AI part is resting for today — try again tomorrow.",
      };
      const status = { anonymous: 401, user: 402, daily: 503 }[error.scope];
      return NextResponse.json(
        { error: messages[error.scope], aiQuota: error.scope },
        { status },
      );
    }
    if (error instanceof DictionaryError && error.code === "010") {
      return NextResponse.json(
        { error: "The dictionary's daily limit is used up. Try again tomorrow." },
        { status: 429 },
      );
    }
    console.error("Analysis failed:", error);
    return NextResponse.json(
      { error: "Could not analyse that text. Check the server log." },
      { status: 500 },
    );
  }
}
