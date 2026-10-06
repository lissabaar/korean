/**
 * POST /api/meanings — add an English meaning to saved words that only have
 * the user's own (for example, imported with a Russian translation).
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * Dictionary first, then AI checked against the dictionary
 * (lib/words/meanings.ts). Called in rounds until `remaining` is 0.
 */

import { NextResponse } from "next/server";
import { anthropic, dictionaryKeys, prisma } from "@/lib/clients";
import { getUserId } from "@/lib/session";
import { fillEnglishMeanings } from "@/lib/words/meanings";

/** Dictionary lookups plus up to two model calls. */
// Hobby plan maximum. A part runs the model and up to 40 dictionary lookups.
export const maxDuration = 300;

/** Add English meanings to saved words that only have the user's own. */
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json(await fillEnglishMeanings(prisma, anthropic, dictionaryKeys, userId));
  } catch (error) {
    console.error("Filling meanings failed:", error);
    return NextResponse.json({ error: "Could not add meanings. Try again." }, { status: 500 });
  }
}
