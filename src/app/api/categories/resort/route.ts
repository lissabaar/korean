/**
 * /api/categories/resort — "Re-sort with AI" on /categories.
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, ...) handles that HTTP method. Runs on
 * the server only, so it may use secret keys and the database.
 *
 *   GET   the plan: how many words, into which categories, expected cost
 *   POST  { cursor } — re-sort the next batch; the page repeats until
 *         nextCursor is null
 *
 * (A static folder name like "resort" wins over the dynamic [id] next to it.)
 * Logic in lib/words/resort.ts.
 */

import { NextResponse } from "next/server";
import { anthropic, prisma } from "@/lib/clients";
import { getUserId } from "@/lib/session";
import { ResortError, resortBatch, resortPlan } from "@/lib/words/resort";

// One model call over up to 120 words.
export const maxDuration = 300;

/** What a re-sort would do and cost. Answers 401 when nobody is signed in. */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json(await resortPlan(prisma, userId));
}

/** Re-sort one batch, continuing after `cursor`. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const cursor = typeof body.cursor === "string" ? body.cursor : null;
  try {
    return NextResponse.json(await resortBatch(prisma, anthropic, userId, cursor));
  } catch (error) {
    if (error instanceof ResortError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Re-sort failed:", error);
    return NextResponse.json({ error: "Could not re-sort. Try again." }, { status: 500 });
  }
}
