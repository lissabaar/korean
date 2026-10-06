/**
 * POST /api/review/intro — the first meeting with a new word:
 * { cardId, action: "start" } starts learning it, "skip" puts it away for
 * 3 days and returns a replacement word for the session.
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * Logic in lib/review/intro.ts.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { IntroCardNotFoundError, introduceWord } from "@/lib/review/intro";

/**
 * Body: { cardId, action: "start" | "skip", sessionSenseIds? }. Returns {
 * replacement } — new cards to put in the session after a skip.
 */
export async function POST(request: Request) {
  let body: { cardId?: unknown; action?: unknown; sessionSenseIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }
  if (typeof body.cardId !== "string" || (body.action !== "start" && body.action !== "skip")) {
    return NextResponse.json({ error: "Expected cardId and action start|skip." }, { status: 400 });
  }

  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  try {
    const result = await introduceWord(prisma, userId, {
      cardId: body.cardId,
      action: body.action,
      sessionSenseIds: Array.isArray(body.sessionSenseIds)
        ? body.sessionSenseIds.filter((id): id is string => typeof id === "string").slice(0, 200)
        : [],
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof IntroCardNotFoundError) {
      return NextResponse.json({ error: "That card no longer exists." }, { status: 404 });
    }
    console.error("Intro failed:", error);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
