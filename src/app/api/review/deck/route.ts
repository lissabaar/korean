/**
 * GET /api/review/deck — the deck counters only (due now, new to learn,
 * next review time ...), without building a session.
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * Used by <Review/> when a session ends: the counters loaded at its start are
 * stale by then, and the "Session done" screen shows the countdown to the
 * next review. Logic in lib/review/queue.ts (getDeckStats).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { getDeckStats } from "@/lib/review/queue";

/** The current deck counters for the signed-in or anonymous user. */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  return NextResponse.json(await getDeckStats(prisma, userId));
}
