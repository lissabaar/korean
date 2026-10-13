/**
 * GET /api/stats?tz=<minutes> — the numbers for the /stats page: where the
 * user's words are (not started, learning, in review, mastered) and what was
 * done on each of the last 14 days.
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * `tz` is the browser's getTimezoneOffset(), so days are the user's own
 * days. Logic in lib/stats.ts. Reads only; no AI.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { getStats } from "@/lib/stats";

/** The stats for the signed-in or anonymous user. */
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const tz = Number(new URL(request.url).searchParams.get("tz") ?? 0);
  try {
    return NextResponse.json(await getStats(prisma, userId, Number.isFinite(tz) ? tz : 0));
  } catch (error) {
    console.error("Stats failed:", error);
    return NextResponse.json({ error: "Could not load the statistics." }, { status: 500 });
  }
}
