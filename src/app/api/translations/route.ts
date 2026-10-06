/**
 * POST /api/translations — English translations for example sentences that
 * have none (KRDict examples are Korean only).
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * Called in rounds like /api/examples. Logic in lib/words/example-
 * translations.ts.
 */

import { NextResponse } from "next/server";
import { anthropic, prisma } from "@/lib/clients";
import { getUserId } from "@/lib/session";
import { translateExamples } from "@/lib/words/example-translations";

// Up to two model calls of 40 sentences each.
export const maxDuration = 300;

/** English translations for the examples shown on the user's cards. */
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json(await translateExamples(prisma, anthropic, userId));
  } catch (error) {
    console.error("Translating examples failed:", error);
    return NextResponse.json({ error: "Could not translate examples. Try again." }, { status: 500 });
  }
}
