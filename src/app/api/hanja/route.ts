/**
 * GET /api/hanja?char=小 — dictionary words built on one hanja, beyond the
 * user's own: the "More words" list on the /hanja page.
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * Reads the local KRDict table (no network, no AI). Logic in lib/hanja.ts.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { dictionaryWordsWith } from "@/lib/hanja";

/** Up to 8 dictionary words containing the character, beginner words first. */
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const char = [...(new URL(request.url).searchParams.get("char") ?? "")][0];
  if (!char) return NextResponse.json({ error: "Expected ?char=" }, { status: 400 });
  // The user's own words with this character are already on the page.
  const own = await prisma.entry.findMany({
    where: { userId, originalForm: { contains: char } },
    select: { lemma: true },
  });
  return NextResponse.json({ words: await dictionaryWordsWith(prisma, char, own.map((row) => row.lemma)) });
}
