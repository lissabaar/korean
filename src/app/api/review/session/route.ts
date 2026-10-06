import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { buildSession, getDeckStats, parseStudyMode } from "@/lib/review/queue";

export async function GET(request: Request) {
  const mode = parseStudyMode(new URL(request.url).searchParams.get("mode"));
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  try {
    const [items, stats] = await Promise.all([
      buildSession(prisma, userId, mode),
      getDeckStats(prisma, userId),
    ]);
    const settings = await prisma.user.findUnique({
      where: { id: userId },
      select: { autoPlayAudio: true },
    });
    return NextResponse.json({ items, stats, autoPlay: settings?.autoPlayAudio ?? false });
  } catch (error) {
    console.error("Building review session failed:", error);
    return NextResponse.json({ error: "Could not load your reviews." }, { status: 500 });
  }
}
