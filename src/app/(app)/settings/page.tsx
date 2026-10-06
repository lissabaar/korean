import SettingsPanel from "@/components/SettingsPanel";
import { getAiBalance } from "@/lib/ai-budget";
import { prisma } from "@/lib/db";
import { lookupsToday } from "@/lib/dictionary/cached";
import { userPlan } from "@/lib/plan-limits";
import { currentUser } from "@/lib/session";

export const metadata = { title: "Settings · Korean vocabulary" };

export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) return null;

  const [settings, ai, missingExamples, plan, lookups, missingMeanings] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        askRecognition: true,
        showKoreanDefinition: true,
        learningGoal: true,
        autoPlayAudio: true,
        myMeaningFirst: true,
        newPerSession: true,
      },
    }),
    getAiBalance(prisma, user.id),
    prisma.sense.count({ where: { order: 0, examples: { none: {} }, entry: { userId: user.id } } }),
    userPlan(prisma, user.id),
    lookupsToday(prisma, user.id),
    prisma.sense.count({ where: { order: 0, translation: null, entry: { userId: user.id } } }),
  ]);

  return (
    <SettingsPanel
      email={user.isAnonymous ? null : user.email}
      askRecognition={settings.askRecognition}
      showKoreanDefinition={settings.showKoreanDefinition}
      learningGoal={settings.learningGoal}
      autoPlayAudio={settings.autoPlayAudio}
      myMeaningFirst={settings.myMeaningFirst}
      newPerSession={settings.newPerSession}
      credits={ai.unlimited ? null : ai.remaining}
      missingExamples={missingExamples}
      missingMeanings={missingMeanings}
      planName={plan.name}
      lookups={{ used: lookups, limit: plan.dictionaryLookupsPerDay }}
    />
  );
}
