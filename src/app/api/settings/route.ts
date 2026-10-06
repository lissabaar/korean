import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/session";

/** Study settings. Only known boolean fields are accepted. */
export async function PATCH(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const data: { askRecognition?: boolean; showKoreanDefinition?: boolean; learningGoal?: number } = {};
  if (Number.isInteger(body.learningGoal) && body.learningGoal >= 2 && body.learningGoal <= 10) {
    data.learningGoal = body.learningGoal;
  }
  if (typeof body.askRecognition === "boolean") data.askRecognition = body.askRecognition;
  if (typeof body.showKoreanDefinition === "boolean") {
    data.showKoreanDefinition = body.showKoreanDefinition;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }
  await prisma.user.update({ where: { id: userId }, data });
  return NextResponse.json({ ok: true });
}
