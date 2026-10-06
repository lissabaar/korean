import { NextResponse } from "next/server";
import { dictionaryKeys } from "@/lib/clients";
import { fetchExamples } from "@/lib/dictionary/krdict";
import { getUserId } from "@/lib/session";

/** Example sentences for one dictionary entry, to prefill a typed-in word. */
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!/^\d{1,10}$/.test(code)) return NextResponse.json({ examples: [] });
  try {
    return NextResponse.json({ examples: await fetchExamples(code, dictionaryKeys.krdict, { max: 3 }) });
  } catch {
    // Examples are a nice-to-have here; the form works without them.
    return NextResponse.json({ examples: [] });
  }
}
