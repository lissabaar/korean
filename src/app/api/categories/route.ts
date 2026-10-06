import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guessIcon } from "@/lib/guess-icon";
import { getUserId } from "@/lib/session";

/** Create a category. Names are lowercase, like the built-in taxonomy. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const name =
    typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().toLowerCase() : "";
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "Give the category a name (up to 60 characters)." }, { status: 400 });
  }

  const category = await prisma.category.upsert({
    where: { userId_language_name: { userId, language: "KO", name } },
    create: { userId, language: "KO", name, icon: guessIcon(name) },
    update: {},
  });
  return NextResponse.json({ id: category.id, name: category.name, icon: category.icon ?? "tag" });
}
