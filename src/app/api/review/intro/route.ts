import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { IntroCardNotFoundError, introduceWord } from "@/lib/review/intro";

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
