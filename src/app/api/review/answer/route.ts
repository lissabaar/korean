/**
 * POST /api/review/answer — record one answer.
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * The browser sends only what was picked or typed; grading happens here on
 * the server from the card itself (lib/review/submit.ts), then the card is
 * moved on: the learning streak, or the next FSRS review date.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { CardNotFoundError, submitAnswer, type AnswerInput } from "@/lib/review/submit";

/**
 * Body: { cardId, answer? | knewIt?, usedHint? }. Returns the grading
 * (AnswerResult). 404 if the card is not this user's.
 */
export async function POST(request: Request) {
  let body: Partial<AnswerInput>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  if (typeof body.cardId !== "string" || !body.cardId) {
    return NextResponse.json({ error: "Missing cardId." }, { status: 400 });
  }
  if (body.answer === undefined && body.knewIt === undefined) {
    return NextResponse.json({ error: "Missing answer." }, { status: 400 });
  }

  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  try {
    const result = await submitAnswer(prisma, userId, {
      cardId: body.cardId,
      answer: typeof body.answer === "string" ? body.answer : undefined,
      knewIt: typeof body.knewIt === "boolean" ? body.knewIt : undefined,
      usedHint: body.usedHint === true,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CardNotFoundError) {
      return NextResponse.json({ error: "That card no longer exists." }, { status: 404 });
    }
    console.error("Saving answer failed:", error);
    return NextResponse.json({ error: "Could not save that answer." }, { status: 500 });
  }
}
