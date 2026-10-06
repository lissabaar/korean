import CategoryList, { type CategoryView } from "@/components/CategoryList";
import { categoryIcon } from "@/lib/category-icons";
import { prisma } from "@/lib/db";
import { guessIcon } from "@/lib/guess-icon";
import { BASE_CATEGORIES } from "@/lib/ingest/categories";
import { currentUser } from "@/lib/session";
import { repairLooseWords } from "@/lib/words/edit";

export const metadata = { title: "Categories · Korean vocabulary" };

export default async function CategoriesPage() {
  const user = await currentUser();
  if (!user) return null;

  // Words saved before every word had a category get "uncategorised" now.
  await repairLooseWords(prisma, user.id);

  const [categories, settings] = await Promise.all([
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
                senses: { where: { order: 0 }, select: { translation: true }, take: 1 },
              },
            },
          },
          orderBy: { entry: { lemma: "asc" } },
        },
      },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { askRecognition: true },
    }),
  ]);

  const view: CategoryView[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    icon: category.icon ?? (categoryIcon(category.name, null) === "tag" ? guessIcon(category.name) : categoryIcon(category.name, null)),
    learnActive: category.learnActive,
    reviewActive: category.reviewActive,
    words: category.entries.map(({ entry }) => ({
      id: entry.id,
      lemma: entry.lemma,
      translation: entry.senses[0]?.translation ?? null,
    })),
  }));

  const names = [...new Set([...categories.map((c) => c.name), ...BASE_CATEGORIES])];

  return (
    <CategoryList
      // Server data changes (a word edited, a category merged) remount the
      // list with fresh state instead of patching it by hand.
      key={fingerprint(JSON.stringify([view, settings]))}
      initial={view}
      allCategoryNames={names}
      askRecognition={settings.askRecognition}
    />
  );
}

/** Short stable hash, used only as a React key. */
function fingerprint(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return hash.toString(36);
}
