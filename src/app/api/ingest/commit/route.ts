import { NextResponse } from "next/server";
import { commitWords, type ApprovedWord } from "@/lib/ingest/commit";
import { prisma } from "@/lib/clients";
import { getUserId } from "@/lib/session";

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
  const invalid = words.find((word) => !word.lemma || !word.dictionary?.senses?.length);
  if (invalid) {
    return NextResponse.json(
      { error: `"${invalid.lemma ?? "A word"}" has no dictionary data.` },
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
