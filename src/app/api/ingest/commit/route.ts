/**
 * POST /api/ingest/commit — save approved word candidates: entries, senses,
 * examples, categories and study cards (lib/ingest/commit.ts).
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * The candidates come back from the browser, so they are validated again:
 * a word with neither dictionary data nor a meaning is refused.
 */

import { NextResponse } from "next/server";
import { commitWords, resolveEntry, type ApprovedWord } from "@/lib/ingest/commit";
import { prisma } from "@/lib/clients";
import { getUserId } from "@/lib/session";

/**
 * Validate the approved words and save them. Answers 401 when nobody is signed
 * in.
 */
export async function POST(request: Request) {
  let body: { text?: string; title?: string; kind?: string; words?: ApprovedWord[] };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON" }, { status: 400 });
  }

  const words = body.words ?? [];
  if (words.length === 0) {
    return NextResponse.json({ error: "No words selected." }, { status: 400 });
  }

  // The dictionary entry travels through the client, so it cannot be
  // trusted blindly — a missing lemma would create a broken card.
  const invalid = words.find((word) => !resolveEntry(word));
  if (invalid) {
    return NextResponse.json(
      { error: `"${invalid.lemma ?? "A word"}" has no dictionary data and no meaning.` },
      { status: 400 },
    );
  }

  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    }
    const result = await commitWords(prisma, {
      userId,
      kind: body.kind === "IMAGE" || body.kind === "GENERATED" ? body.kind : "TEXT",
      text: body.text ?? "",
      title: body.title?.slice(0, 200),
      words,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Commit failed:", error);
    return NextResponse.json({ error: "Could not save those words." }, { status: 500 });
  }
}
