/**
 * GET /api/dictionary?q=단어 — dictionary lookup for a word typed in by hand
 * (the "Dictionary" button in the manual word form).
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * No AI. Goes through the shared cache (lib/dictionary/cached.ts) and counts
 * against the plan's daily limit of typed-in lookups (consumeLookup).
 */

import { NextResponse } from "next/server";
import { dictionaryKeys, prisma } from "@/lib/clients";
import { cachedLookup, consumeLookup, LookupLimitError } from "@/lib/dictionary/cached";
import { DictionaryError, TRANS_LANG } from "@/lib/dictionary/krdict";
import { userPlan } from "@/lib/plan-limits";
import { getUserId } from "@/lib/session";

/**
 * Dictionary lookup for typed-in words. No AI involved, so it is open to
 * every user, anonymous ones included — within the plan's daily limit.
 */
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.normalize("NFC").trim() ?? "";
  if (!/[가-힣]/.test(q) || q.length > 40) {
    return NextResponse.json({ error: "Type a Korean word first." }, { status: 400 });
  }

  try {
    const plan = await userPlan(prisma, userId);
    await consumeLookup(prisma, userId, plan.dictionaryLookupsPerDay);
    const entries = await cachedLookup(prisma, q, dictionaryKeys, { transLang: TRANS_LANG.EN });
    return NextResponse.json({
      entries: entries.slice(0, 8).map((entry) => ({
        targetCode: entry.targetCode ?? null,
        lemma: entry.lemma,
        originalForm: entry.originalForm ?? null,
        partOfSpeech: entry.partOfSpeech ?? null,
        level: entry.level ?? null,
        translation: entry.senses[0]?.translation ?? null,
        definition: entry.senses[0]?.definition ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof LookupLimitError) {
      return NextResponse.json(
        { error: `That's today's ${error.limit} dictionary lookups. Fill the fields in yourself, or come back tomorrow.` },
        { status: 429 },
      );
    }
    if (error instanceof DictionaryError && error.code === "010") {
      return NextResponse.json({ error: "The dictionary's daily limit is used up." }, { status: 429 });
    }
    return NextResponse.json(
      { error: "The dictionary did not respond. Try again, or fill the fields in yourself." },
      { status: 503 },
    );
  }
}
