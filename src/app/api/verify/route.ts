/**
 * POST /api/verify — check words that were saved while the dictionary was not
 * answering (Entry.needsCheck). Dictionary data replaces the AI placeholder;
 * the user's own meaning stays.
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * No AI, no credits. Called after an import and when the home page opens
 * (<BackgroundVerify/>). Logic in lib/words/verify.ts.
 */

import { NextResponse } from "next/server";
import { dictionaryKeys, prisma } from "@/lib/clients";
import { getUserId } from "@/lib/session";
import { verifyPending } from "@/lib/words/verify";

// Hobby plan maximum; up to 40 dictionary lookups.
export const maxDuration = 300;

/** Check words saved while the dictionary was down. No AI, no credits. */
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json(await verifyPending(prisma, dictionaryKeys, userId));
  } catch (error) {
    console.error("Verify failed:", error);
    return NextResponse.json({ error: "Could not check words now." }, { status: 500 });
  }
}
