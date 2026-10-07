/**
 * /api/words/:id/senses — which meanings of a word are studied (the
 * "Meanings to learn" list in the word editor).
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, PUT, ...) handles that HTTP method. Runs on
 * the server only, so it may use secret keys and the database.
 *
 *   GET  every sense: saved ones and the dictionary's others, with "studied"
 *   PUT  { studied: ["s:<senseId>" | "d:<index>", ...] } — study exactly
 *        these; returns { studiedSenseIds }
 *
 * No AI. Logic in lib/words/senses.ts.
 */

import { NextResponse } from "next/server";
import { dictionaryKeys, prisma } from "@/lib/clients";
import { getUserId } from "@/lib/session";
import { EditError } from "@/lib/words/edit";
import { listSenses, setStudiedSenses } from "@/lib/words/senses";

type Params = { params: Promise<{ id: string }> };

/** EditError carries its own status; anything else is logged and answered 500. */
function failure(error: unknown) {
  if (error instanceof EditError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Senses change failed:", error);
  return NextResponse.json({ error: "Could not save that change." }, { status: 500 });
}

/** The word's senses with which are studied. Answers 401 when nobody is signed in. */
export async function GET(_request: Request, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json({ senses: await listSenses(prisma, dictionaryKeys, userId, (await params).id) });
  } catch (error) {
    return failure(error);
  }
}

/** Study exactly the given senses (at least one). */
export async function PUT(request: Request, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const studied = Array.isArray(body.studied)
    ? body.studied.filter((key: unknown): key is string => typeof key === "string").slice(0, 60)
    : [];
  try {
    const ids = await setStudiedSenses(prisma, dictionaryKeys, userId, (await params).id, studied);
    return NextResponse.json({ studiedSenseIds: ids });
  } catch (error) {
    return failure(error);
  }
}
