/**
 * POST /api/starter-deck — add the ready-made starter words to an empty
 * account (lib/words/starter-deck.ts).
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { addStarterDeck } from "@/lib/words/starter-deck";

/**
 * Add the starter words; returns how many were added. Answers 401 when nobody is
 * signed in.
 */
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
