/**
 * "/categories" — every category with its words: rename, merge, delete,
 * change icon, switch Learn/Review on or off, edit single words.
 *
 * Next.js page (server component): runs on the server for every request, may
 * read the database directly, and returns HTML. The folder path is the URL.
 *
 * Before reading, it repairs data: words without any category are put into
 * "uncategorised" (which always exists). The list is then passed to
 * <CategoryList/>, the interactive part.
 */

import CategoryList, { type CategoryView } from "@/components/CategoryList";
import { categoryIcon } from "@/lib/category-icons";
import { prisma } from "@/lib/db";
import { guessIcon } from "@/lib/guess-icon";
import { BASE_CATEGORIES } from "@/lib/ingest/categories";
import { currentUser } from "@/lib/session";
import { repairLooseWords } from "@/lib/words/edit";

export const metadata = { title: "Categories · Korean vocabulary" };

/**
 * The page itself. Next.js calls this default export on the server for each
 * request and sends the HTML it returns. Here: repairs words without a category,
 * then loads every category with its words for <CategoryList/>.
 */
export default async function CategoriesPage() {
  const user = await currentUser();
  if (!user) return null;

  // Words saved before every word had a category get "uncategorised" now.
  await repairLooseWords(prisma, user.id);

  // "uncategorised" always exists, so its words are always findable here.
  await prisma.category.upsert({
    where: { userId_language_name: { userId: user.id, language: "KO", name: "uncategorised" } },
    create: { userId: user.id, language: "KO", name: "uncategorised" },
    update: {},
  });

  const [categories] = await Promise.all([
    prisma.category.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      include: {
        entries: {
          select: {
            entry: {
              select: {
                id: true,
                lemma: true,
                senses: {
                  where: { order: 0 },
                  select: { translation: true, userMeaning: true },
                  take: 1,
                },
              },
            },
          },
          orderBy: { entry: { lemma: "asc" } },
        },
      },
    }),
  ]);

  const view: CategoryView[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    icon: category.icon ?? (categoryIcon(category.name, null) === "tag" ? guessIcon(category.name) : categoryIcon(category.name, null)),
    learnActive: category.learnActive,
    reviewActive: category.reviewActive,
    locked: category.locked,
    words: category.entries.map(({ entry }) => ({
      id: entry.id,
      lemma: entry.lemma,
      translation: entry.senses[0]?.translation ?? entry.senses[0]?.userMeaning ?? null,
      userMeaning: entry.senses[0]?.userMeaning ?? null,
    })),
  }));

  const names = [...new Set([...categories.map((c) => c.name), ...BASE_CATEGORIES])];

  return (
    <CategoryList
      // Server data changes (a word edited, a category merged) remount the
      // list with fresh state instead of patching it by hand.
      key={fingerprint(JSON.stringify(view))}
      initial={view}
      allCategoryNames={names}
    />
  );
}

/** Short stable hash, used only as a React key. */
function fingerprint(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return hash.toString(36);
}
