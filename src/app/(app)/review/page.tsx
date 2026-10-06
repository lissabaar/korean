import Review from "@/components/Review";
import { parseStudyMode } from "@/lib/review/queue";

export const metadata = { title: "Study · Korean vocabulary" };

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  return <Review mode={parseStudyMode(mode)} />;
}
