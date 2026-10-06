/**
 * "/review" — spaced-repetition reviews of words already learned.
 *
 * Next.js page (server component): runs on the server for every request, may
 * read the database directly, and returns HTML. The folder path is the URL.
 * `searchParams` is the URL query (?mode=...); in this Next.js
 * version it is a Promise and must be awaited. All the logic is in <Review/>.
 */

import Review from "@/components/Review";
import { parseStudyMode } from "@/lib/review/queue";

export const metadata = { title: "Review · Korean vocabulary" };

/** Scheduled reviews only (?mode=all mixes in new words too). */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  return <Review mode={mode ? parseStudyMode(mode) : "review"} />;
}
