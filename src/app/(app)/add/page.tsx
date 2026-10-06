import AddWords from "@/components/AddWords";
import { getAiBalance } from "@/lib/ai-budget";
import { prisma } from "@/lib/db";
import { BASE_CATEGORIES } from "@/lib/ingest/categories";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Add words · Korean vocabulary" };

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
