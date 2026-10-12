/**
 * POST /api/starter-categories — add the ready-made categories (numbers,
 * colors, days and months, counters ...) and their words to the signed-in or
 * anonymous account, if it has no words yet.
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * No AI, no credits: the words come from the local dictionary table.
 * Called once by <StarterSeed/> in the app layout. Logic in
 * lib/words/starter-seed.ts. Answers { added, linked }, or { skipped: true }
 * when the account already has words (checked here too: the button-less
 * trigger must never re-run for an account in use).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/clients";
import { getUserId } from "@/lib/session";
import { needsStarterCategories, seedStarterCategories } from "@/lib/words/starter-seed";

// One transaction of bulk inserts; generous in case the database is slow.
export const maxDuration = 120;

/** Seed the starter categories for the current user (no-op when up to date). */
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    if (!(await needsStarterCategories(prisma, userId))) return NextResponse.json({ skipped: true });
    return NextResponse.json(await seedStarterCategories(prisma, userId));
  } catch (error) {
    console.error("Starter categories failed:", error);
    return NextResponse.json({ error: "Could not add the starter categories now." }, { status: 500 });
  }
}
