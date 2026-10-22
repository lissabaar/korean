/**
 * POST /api/offline/sync — apply answers and intro choices made offline.
 * Body: { events: OfflineEvent[] }. Answers { applied, skipped }.
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * Grading happens here again, from the card rows, as for any answer — the
 * phone's own grading only drove the offline session. Each event carries its
 * own time and id (applied once). Logic in lib/offline/sync.ts.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { applyOfflineEvents } from "@/lib/offline/sync";
import type { OfflineEvent } from "@/lib/offline/types";

// A long flight can mean a few hundred answers, each a few database writes.
export const maxDuration = 120;

/** Apply the queued events for the current user. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body: { events?: unknown } = await request.json().catch(() => ({}));
  if (!Array.isArray(body.events)) {
    return NextResponse.json({ error: "Expected { events: [...] }." }, { status: 400 });
  }
  try {
    return NextResponse.json(await applyOfflineEvents(prisma, userId, body.events.slice(0, 2000) as OfflineEvent[]));
  } catch (error) {
    console.error("Offline sync failed:", error);
    return NextResponse.json({ error: "Could not sync the offline answers." }, { status: 500 });
  }
}
