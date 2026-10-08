/**
 * /api/words/:id — one saved word (the word editor on /categories).
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 *   GET     the word with its meanings, example and categories
 *   PATCH   edit any of them
 *   DELETE  delete the word with its cards
 *
 * The rules live in lib/words/edit.ts.
 */

import { NextResponse } from "next/server";
import { anthropic, prisma } from "@/lib/clients";
import { translateOneExample } from "@/lib/words/example-translations";
import { getUserId } from "@/lib/session";
import { deleteWord, EditError, getWord, updateWord } from "@/lib/words/edit";

type Params = { params: Promise<{ id: string }> };

/**
 * Turns an error into an HTTP response: EditError carries its own status
 * (400/404/409); anything else is logged and answered 500.
 */
function failure(error: unknown) {
  if (error instanceof EditError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Word change failed:", error);
  return NextResponse.json({ error: "Could not save that change." }, { status: 500 });
}

/**
 * The word with everything editable about it. Answers 401 when nobody is signed
 * in.
 */
export async function GET(_request: Request, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json(await getWord(prisma, userId, (await params).id));
  } catch (error) {
    return failure(error);
  }
}

/**
 * Save edits; only string fields that were sent are changed. Answers 401 when
 * nobody is signed in.
 */
export async function PATCH(request: Request, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  try {
    const { untranslatedExampleId } = await updateWord(prisma, userId, (await params).id, {
      lemma: text(body.lemma),
      translation: text(body.translation),
      userMeaning: text(body.userMeaning),
      definition: text(body.definition),
      example: text(body.example),
      exampleTranslation: text(body.exampleTranslation),
      exampleSource: ["KRDICT", "AI", "USER"].includes(body.exampleSource) ? body.exampleSource : undefined,
      categories: Array.isArray(body.categories)
        ? body.categories.filter((name: unknown): name is string => typeof name === "string")
        : undefined,
    });
    // A new example without English: translate it now, so the card shows it
    // at once. A failure here must not fail the save itself.
    if (untranslatedExampleId) {
      await translateOneExample(prisma, anthropic, userId, untranslatedExampleId).catch((error) =>
        console.error("Translating the edited example failed:", error),
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

/**
 * Delete the word together with its senses, examples and cards. Answers 401 when
 * nobody is signed in.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    await deleteWord(prisma, userId, (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
