import SettingsPanel from "@/components/SettingsPanel";
import { getAiBalance } from "@/lib/ai-budget";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Settings · Korean vocabulary" };

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) return null;

  const [settings, ai, missingExamples] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { askRecognition: true, showKoreanDefinition: true },
    }),
    getAiBalance(prisma, user.id),
    prisma.sense.count({ where: { order: 0, examples: { none: {} }, entry: { userId: user.id } } }),
  ]);

  return (
    <SettingsPanel
      email={user.isAnonymous ? null : user.email}
      askRecognition={settings.askRecognition}
      showKoreanDefinition={settings.showKoreanDefinition}
      credits={ai.unlimited ? null : ai.remaining}
      missingExamples={missingExamples}
    />
  );
}
