import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { buildSession, getDeckStats } from "@/lib/review/queue";

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  try {
    const [items, stats] = await Promise.all([
      buildSession(prisma, userId),
      getDeckStats(prisma, userId),
    ]);
    return NextResponse.json({ items, stats });
  } catch (error) {
    console.error("Building review session failed:", error);
    return NextResponse.json({ error: "Could not load your reviews." }, { status: 500 });
  }
}
