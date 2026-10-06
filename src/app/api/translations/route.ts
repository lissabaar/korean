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
