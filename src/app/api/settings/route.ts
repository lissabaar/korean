import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (typeof body.askRecognition !== "boolean") {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: userId },
    data: { askRecognition: body.askRecognition },
  });
  return NextResponse.json({ ok: true });
}
