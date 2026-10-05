import AddWords from "@/components/AddWords";
import { getAiBalance } from "@/lib/ai-budget";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Add words · Korean vocabulary" };

export default async function AddPage() {
  const user = await requireUser();
  const balance = await getAiBalance(prisma, user.id);
  return <AddWords initialCredits={balance.unlimited ? null : balance.remaining} />;
}
