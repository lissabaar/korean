import { NextResponse } from "next/server";
import { anthropic, dictionaryKeys, prisma } from "@/lib/clients";
import { getUserId } from "@/lib/session";
import { fillMissingExamples } from "@/lib/words/examples";

/** Dictionary lookups plus possibly one model call. */
// Hobby plan maximum. A part runs the model and up to 40 dictionary lookups.
export const maxDuration = 300;

/** Fill in examples for saved words that have none. */
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json(await fillMissingExamples(prisma, anthropic, dictionaryKeys, userId));
  } catch (error) {
    console.error("Filling examples failed:", error);
    return NextResponse.json({ error: "Could not add examples. Try again." }, { status: 500 });
  }
}
