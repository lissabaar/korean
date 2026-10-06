/**
 * POST /api/examples — give saved words without an example sentence one.
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * One call handles up to ~60 words; the browser calls it again until
 * `remaining` is 0. Dictionary first, AI for the rest (lib/words/examples.ts).
 * `maxDuration` raises Vercel's time limit for this function (300 s is the
 * maximum on the free plan).
 */

import { NextResponse } from "next/server";
import { anthropic, dictionaryKeys, prisma } from "@/lib/clients";
import { getUserId } from "@/lib/session";
import { fillMissingExamples } from "@/lib/words/examples";

/** Dictionary lookups plus possibly one model call. */
// Hobby plan maximum. A part runs the model and up to 40 dictionary lookups.
export const maxDuration = 300;

/** Fill in examples for saved words that have none. */
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json(await fillMissingExamples(prisma, anthropic, dictionaryKeys, userId));
  } catch (error) {
    console.error("Filling examples failed:", error);
    return NextResponse.json({ error: "Could not add examples. Try again." }, { status: 500 });
  }
}
