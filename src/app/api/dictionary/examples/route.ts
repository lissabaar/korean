/**
 * GET /api/dictionary/examples?code=12345 — example sentences for one KRDict
 * entry (by its target code), to prefill the manual word form.
 *
 * Next.js route handler: an HTTP API endpoint. The folder path is the URL;
 * each exported function (GET, POST, PATCH, DELETE) handles that HTTP method.
 * Runs on the server only, so it may use secret keys and the database.
 *
 * Never fails loudly: without examples the form still works.
 */

import { NextResponse } from "next/server";
import { dictionaryKeys, prisma } from "@/lib/clients";
import { cachedExamples } from "@/lib/dictionary/cached";
import { getUserId } from "@/lib/session";

/** Example sentences for one dictionary entry, to prefill a typed-in word. */
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!/^\d{1,10}$/.test(code)) return NextResponse.json({ examples: [] });
  try {
    return NextResponse.json({ examples: await cachedExamples(prisma, code, dictionaryKeys) });
  } catch {
    // Examples are a nice-to-have here; the form works without them.
    return NextResponse.json({ examples: [] });
  }
}
