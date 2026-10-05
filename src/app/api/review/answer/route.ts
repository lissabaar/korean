import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { CardNotFoundError, submitAnswer, type AnswerInput } from "@/lib/review/submit";

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
