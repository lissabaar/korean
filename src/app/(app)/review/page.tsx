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
