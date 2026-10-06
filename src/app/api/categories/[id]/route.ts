/**
 * /api/categories/:id — change or delete one category.
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * "[id]" is a dynamic segment: /api/categories/abc123 gives params.id =
 * "abc123" (a Promise in this Next.js version, hence `await params`).
 *
 *   PATCH   rename (renaming onto an existing name merges the two), switch
 *           Learn/Review, lock/unlock (locked = re-sort leaves its words),
 *           change the icon
 *   DELETE  delete; words left without a category go to "uncategorised"
 *
 * The rules live in lib/words/edit.ts; this file checks input and maps
 * errors to HTTP status codes.
 */

import { NextResponse } from "next/server";
import { isIconName } from "@/lib/category-icons";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { deleteCategory, EditError, renameCategory } from "@/lib/words/edit";

type Params = { params: Promise<{ id: string }> };

/**
 * Turns an error into an HTTP response: EditError carries its own status
 * (400/404/409); anything else is logged and answered 500.
 */
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

    const data: { learnActive?: boolean; reviewActive?: boolean; locked?: boolean; icon?: string | null } = {};
    if (typeof body.learnActive === "boolean") data.learnActive = body.learnActive;
    if (typeof body.reviewActive === "boolean") data.reviewActive = body.reviewActive;
    if (typeof body.locked === "boolean") data.locked = body.locked;
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
