/**
 * "/add" — adding words: paste text, drop files (images, Anki, CSV, ReWord,
 * subtitles), ask for a topic, or type a word by hand.
 *
 * Next.js page (server component): runs on the server for every request, may
 * read the database directly, and returns HTML. The folder path is the URL.
 *
 * Only prepares data for the browser part — AI credits left and the list of
 * category names — and hands it to <AddWords/>, where all the work happens.
 */

import AddWords from "@/components/AddWords";
import { getAiBalance } from "@/lib/ai-budget";
import { prisma } from "@/lib/db";
import { BASE_CATEGORIES } from "@/lib/ingest/categories";
import { currentUser } from "@/lib/session";

// Personal pages: kept out of search results (see also app/robots.ts).
export const metadata = { title: "Add words", robots: { index: false } };

/**
 * The page itself. Next.js calls this default export on the server for each
 * request and sends the HTML it returns. Here: credits and category names for
 * <AddWords/>.
 */
export default async function AddPage() {
  const user = await currentUser();
  if (!user) return null;

  const [balance, own] = await Promise.all([
    getAiBalance(prisma, user.id),
    prisma.category.findMany({
      where: { userId: user.id },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  // The user's own first, then the built-in taxonomy.
  const categories = [...new Set([...own.map((c) => c.name), ...BASE_CATEGORIES])];

  return (
    <AddWords
      initialCredits={balance.unlimited ? null : balance.remaining}
      anonymous={balance.anonymous}
      categories={categories}
    />
  );
}
