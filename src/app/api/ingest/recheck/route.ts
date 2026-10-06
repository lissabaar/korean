import { NextResponse } from "next/server";
import { dictionaryKeys, prisma } from "@/lib/clients";
import { recheckDictionary, type RecheckItem } from "@/lib/ingest/analyze";
import { getUserId } from "@/lib/session";

/** Dictionary lookups only — retrying can take a while on a slow network. */
export const maxDuration = 120;

/** Re-ask the dictionary about words it did not answer for. No AI involved. */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const items: RecheckItem[] = (Array.isArray(body.items) ? body.items : [])
    .filter(
      (item: Partial<RecheckItem>) =>
        typeof item?.id === "string" && typeof item.lemma === "string" && /[가-힣]/.test(item.lemma),
    )
    .slice(0, 60)
    .map((item: RecheckItem) => ({
      id: item.id,
      lemma: item.lemma.normalize("NFC").trim().slice(0, 120),
      gloss: typeof item.gloss === "string" ? item.gloss.slice(0, 100) : "",
      contextNote: typeof item.contextNote === "string" ? item.contextNote.slice(0, 300) : "",
    }));
  if (items.length === 0) return NextResponse.json({ results: [] });

  try {
    return NextResponse.json({ results: await recheckDictionary(prisma, dictionaryKeys, userId, items) });
  } catch (error) {
    console.error("Recheck failed:", error);
    return NextResponse.json({ error: "Could not check those words. Try again." }, { status: 500 });
  }
}
