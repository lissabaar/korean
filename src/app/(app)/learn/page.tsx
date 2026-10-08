/**
 * "/learn" — the learning drill for new words.
 *
 * Next.js page (server component): runs on the server for every request, may
 * read the database directly, and returns HTML. The folder path is the URL.
 * All the logic is in <Review mode="learn"/>.
 */

import Review from "@/components/Review";

// Personal pages: kept out of search results (see also app/robots.ts).
export const metadata = { title: "Learn", robots: { index: false } };

/** New words only: the learning drill, from categories with Learn on. */
export default function LearnPage() {
  return <Review mode="learn" />;
}
