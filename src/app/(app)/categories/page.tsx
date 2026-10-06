import CategoryList, { type CategoryView } from "@/components/CategoryList";
import { categoryIcon } from "@/lib/category-icons";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Categories · Korean vocabulary" };

export default async function CategoriesPage() {
  const user = await currentUser();
  if (!user) return null;

  const wordSelect = {
    id: true,
    lemma: true,
    senses: { where: { order: 0 }, select: { translation: true }, take: 1 },
  } as const;

  const [categories, loose, settings] = await Promise.all([
    prisma.category.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      include: {
        entries: {
          select: { entry: { select: wordSelect } },
          orderBy: { entry: { lemma: "asc" } },
        },
      },
    }),
    prisma.entry.findMany({
      where: { userId: user.id, categories: { none: {} } },
      select: wordSelect,
      orderBy: { lemma: "asc" },
    }),
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { askRecognition: true },
    }),
  ]);

  const view: CategoryView[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    icon: categoryIcon(category.name, category.icon),
    learnActive: category.learnActive,
    reviewActive: category.reviewActive,
    words: category.entries.map(({ entry }) => ({
      id: entry.id,
      lemma: entry.lemma,
      translation: entry.senses[0]?.translation ?? null,
    })),
  }));

  return (
    <CategoryList
      initial={view}
      looseWords={loose.map((entry) => ({
        id: entry.id,
        lemma: entry.lemma,
        translation: entry.senses[0]?.translation ?? null,
      }))}
      askRecognition={settings.askRecognition}
    />
  );
}
