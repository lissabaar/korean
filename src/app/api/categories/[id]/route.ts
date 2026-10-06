import { NextResponse } from "next/server";
import { isIconName } from "@/lib/category-icons";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

type Params = { params: Promise<{ id: string }> };

/** Toggle learn/review, or change the icon. */
export async function PATCH(request: Request, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const data: { learnActive?: boolean; reviewActive?: boolean; icon?: string | null } = {};
  if (typeof body.learnActive === "boolean") data.learnActive = body.learnActive;
  if (typeof body.reviewActive === "boolean") data.reviewActive = body.reviewActive;
  if (body.icon === null || (typeof body.icon === "string" && isIconName(body.icon))) {
    data.icon = body.icon;
  }

  const { count } = await prisma.category.updateMany({ where: { id, userId }, data });
  if (count === 0) return NextResponse.json({ error: "No such category." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Delete an empty category. Ones with words stay, so no word loses its place. */
export async function DELETE(_request: Request, { params }: Params) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;

  const category = await prisma.category.findFirst({
    where: { id, userId },
    select: { _count: { select: { entries: true } } },
  });
  if (!category) return NextResponse.json({ error: "No such category." }, { status: 404 });
  if (category._count.entries > 0) {
    return NextResponse.json({ error: "Only empty categories can be deleted." }, { status: 409 });
  }
  await prisma.category.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
