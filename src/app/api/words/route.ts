/**
 * POST /api/words — add one word typed in by hand (the manual form on /add).
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * No AI. What the user typed is stored as their own fact (source USER);
 * dictionary data is attached if they picked an entry. Duplicate → 409.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import {
  createManualWord,
  DuplicateWordError,
  InvalidWordError,
  type ManualWordInput,
} from "@/lib/words/manual";

/** Add one word by hand. No AI, so it works for every user. */
export async function POST(request: Request) {
  let body: Partial<Record<keyof ManualWordInput, unknown>>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  try {
    const result = await createManualWord(prisma, userId, {
      lemma: text(body.lemma) ?? "",
      translation: text(body.translation) ?? "",
      definition: text(body.definition),
      example: text(body.example),
      category: text(body.category),
      dictionary:
        body.dictionary && typeof body.dictionary === "object"
          ? (body.dictionary as ManualWordInput["dictionary"])
          : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InvalidWordError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof DuplicateWordError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Adding word failed:", error);
    return NextResponse.json({ error: "Could not save that word." }, { status: 500 });
  }
}
