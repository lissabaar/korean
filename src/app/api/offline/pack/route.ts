/**
 * GET /api/offline/pack — the cards a phone keeps for studying without a
 * connection (reviews due in the next days, new words). See lib/offline.
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * Called by <OfflineSync/> in the app layout while online. Reads only.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { buildOfflinePack } from "@/lib/offline/pack";

// Every word not started yet: a couple of thousand cards with their options.
export const maxDuration = 60;

/** The current user's offline pack. */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json(await buildOfflinePack(prisma, userId));
  } catch (error) {
    console.error("Offline pack failed:", error);
    return NextResponse.json({ error: "Could not prepare the offline cards." }, { status: 500 });
  }
}
