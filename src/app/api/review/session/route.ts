/**
 * GET /api/review/session?mode=learn|review|all — the cards for one study
 * session plus deck counters.
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * Builds the questions in lib/review/queue.ts: which cards, what exercise
 * (choice or typing), the options, what each side of the card shows.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { buildSession, getDeckStats, parseStudyMode } from "@/lib/review/queue";

/**
 * Returns { items, stats, autoPlay }: the session's cards, the deck counters and
 * whether to play pronunciation automatically.
 */
export async function GET(request: Request) {
  const mode = parseStudyMode(new URL(request.url).searchParams.get("mode"));
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  try {
    const [items, stats] = await Promise.all([
      buildSession(prisma, userId, mode),
      getDeckStats(prisma, userId),
    ]);
    const settings = await prisma.user.findUnique({
      where: { id: userId },
      select: { autoPlayAudio: true },
    });
    return NextResponse.json({ items, stats, autoPlay: settings?.autoPlayAudio ?? false });
  } catch (error) {
    console.error("Building review session failed:", error);
    return NextResponse.json({ error: "Could not load your reviews." }, { status: 500 });
  }
}
