import Review from "@/components/Review";

export const metadata = { title: "Learn · Korean vocabulary" };

/** New words only: the learning drill, from categories with Learn on. */
export default function LearnPage() {
  return <Review mode="learn" />;
}
