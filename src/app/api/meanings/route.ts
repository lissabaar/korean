import { NextResponse } from "next/server";
import { anthropic, dictionaryKeys, prisma } from "@/lib/clients";
import { getUserId } from "@/lib/session";
import { fillEnglishMeanings } from "@/lib/words/meanings";

/** Dictionary lookups plus up to two model calls. */
export const maxDuration = 120;

/** Add English meanings to saved words that only have the user's own. */
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json(await fillEnglishMeanings(prisma, anthropic, dictionaryKeys, userId));
  } catch (error) {
    console.error("Filling meanings failed:", error);
    return NextResponse.json({ error: "Could not add meanings. Try again." }, { status: 500 });
  }
}
