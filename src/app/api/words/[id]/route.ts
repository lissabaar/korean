import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { deleteWord, EditError, getWord, updateWord } from "@/lib/words/edit";

type Params = { params: Promise<{ id: string }> };

function failure(error: unknown) {
  if (error instanceof EditError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Word change failed:", error);
  return NextResponse.json({ error: "Could not save that change." }, { status: 500 });
}

export async function GET(_request: Request, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    return NextResponse.json(await getWord(prisma, userId, (await params).id));
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  try {
    await updateWord(prisma, userId, (await params).id, {
      lemma: text(body.lemma),
      translation: text(body.translation),
      userMeaning: text(body.userMeaning),
      definition: text(body.definition),
      example: text(body.example),
      categories: Array.isArray(body.categories)
        ? body.categories.filter((name: unknown): name is string => typeof name === "string")
        : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}

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
