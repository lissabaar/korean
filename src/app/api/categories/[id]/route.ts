import { NextResponse } from "next/server";
import { isIconName } from "@/lib/category-icons";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { deleteCategory, EditError, renameCategory } from "@/lib/words/edit";

type Params = { params: Promise<{ id: string }> };

function failure(error: unknown) {
  if (error instanceof EditError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("Category change failed:", error);
  return NextResponse.json({ error: "Could not save that change." }, { status: 500 });
}

/** Rename (merging into an existing name), toggle learn/review, change icon. */
export async function PATCH(request: Request, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    let targetId = id;
    let merged = false;
    if (typeof body.name === "string") {
      ({ id: targetId, merged } = await renameCategory(prisma, userId, id, body.name));
    }

    const data: { learnActive?: boolean; reviewActive?: boolean; icon?: string | null } = {};
    if (typeof body.learnActive === "boolean") data.learnActive = body.learnActive;
    if (typeof body.reviewActive === "boolean") data.reviewActive = body.reviewActive;
    if (body.icon === null || (typeof body.icon === "string" && isIconName(body.icon))) {
      data.icon = body.icon;
    }
    if (Object.keys(data).length) {
      const { count } = await prisma.category.updateMany({ where: { id: targetId, userId }, data });
      if (count === 0) throw new EditError("No such category.", 404);
    }
    return NextResponse.json({ id: targetId, merged });
  } catch (error) {
    return failure(error);
  }
}

/** Delete; words that had only this category move to "uncategorised". */
export async function DELETE(_request: Request, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  try {
    await deleteCategory(prisma, userId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
