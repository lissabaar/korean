import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { addStarterDeck } from "@/lib/words/starter-deck";

export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json({ added: await addStarterDeck(prisma, userId) });
  } catch (error) {
    console.error("Starter deck failed:", error);
    return NextResponse.json({ error: "Could not add the starter deck." }, { status: 500 });
  }
}
