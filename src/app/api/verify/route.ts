import { NextResponse } from "next/server";
import { dictionaryKeys, prisma } from "@/lib/clients";
import { getUserId } from "@/lib/session";
import { verifyPending } from "@/lib/words/verify";

// Hobby plan maximum; up to 40 dictionary lookups.
export const maxDuration = 300;

/** Check words saved while the dictionary was down. No AI, no credits. */
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json(await verifyPending(prisma, dictionaryKeys, userId));
  } catch (error) {
    console.error("Verify failed:", error);
    return NextResponse.json({ error: "Could not check words now." }, { status: 500 });
  }
}
