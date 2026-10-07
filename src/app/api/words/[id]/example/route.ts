/**
 * /api/words/:id/example — "Add example" in the word editor.
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, ...) handles that HTTP method. Runs on
 * the server only, so it may use secret keys and the database.
 *
 *   GET   examples from the dictionary (free), to pick one
 *   POST  one example written by the AI, with its translation (metered)
 *
 * Nothing is saved here: the editor fills its Example field with the choice
 * and the word is saved with the editor's Save. Logic in lib/words/examples.ts.
 */

import { NextResponse } from "next/server";
import { AiQuotaError } from "@/lib/ai-budget";
import { anthropic, dictionaryKeys, prisma } from "@/lib/clients";
import { getUserId } from "@/lib/session";
import { EditError } from "@/lib/words/edit";
import { dictionaryExamples, writeExample } from "@/lib/words/examples";

type Params = { params: Promise<{ id: string }> };

/** Dictionary examples for the word. Answers 401 when nobody is signed in. */
export async function GET(_request: Request, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json({
      examples: await dictionaryExamples(prisma, dictionaryKeys, userId, (await params).id),
    });
  } catch (error) {
    if (error instanceof EditError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The dictionary did not answer. Try again, or ask the AI." }, { status: 503 });
  }
}

/** One AI-written example. Out of credits → 402 with a readable message. */
export async function POST(_request: Request, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json({ example: await writeExample(prisma, anthropic, userId, (await params).id) });
  } catch (error) {
    if (error instanceof EditError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof AiQuotaError) {
      const message =
        error.scope === "anonymous"
          ? "Create an account to use AI."
          : error.scope === "user"
            ? "Out of AI credits."
            : "The AI is resting for today — try again tomorrow.";
      return NextResponse.json({ error: message }, { status: 402 });
    }
    console.error("Writing an example failed:", error);
    return NextResponse.json({ error: "Could not write an example. Try again." }, { status: 500 });
  }
}
