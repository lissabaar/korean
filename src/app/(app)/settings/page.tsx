/**
 * "/settings" — study settings, filling in missing meanings / examples /
 * example translations, AI credits, account.
 *
 * Next.js page (server component): runs on the server for every request, may
 * read the database directly, and returns HTML. The folder path is the URL.
 *
 * Reads the current settings and a few counters (words without an example,
 * without an English meaning, examples without a translation, today's
 * dictionary lookups) in parallel and passes them to <SettingsPanel/>.
 */

import SettingsPanel from "@/components/SettingsPanel";
import { getAiBalance } from "@/lib/ai-budget";
import { prisma } from "@/lib/db";
import { lookupsToday } from "@/lib/dictionary/cached";
import { userPlan } from "@/lib/plan-limits";
import { currentUser } from "@/lib/session";
import { countUntranslatedExamples } from "@/lib/words/example-translations";

export const metadata = { title: "Settings · Korean vocabulary" };

/**
 * The page itself. Next.js calls this default export on the server for each
 * request and sends the HTML it returns. Here: current settings plus counters,
 * passed to <SettingsPanel/>.
 */
export default async function SettingsPage() {
  const user = await currentUser();
  if (!user) return null;

  const [settings, ai, missingExamples, plan, lookups, missingMeanings, untranslated] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        askRecognition: true,
        showKoreanDefinition: true,
        learningGoal: true,
        autoPlayAudio: true,
        myMeaningFirst: true,
        newPerSession: true,
        cardTextSize: true,
      },
    }),
    getAiBalance(prisma, user.id),
    prisma.sense.count({ where: { order: 0, examples: { none: {} }, entry: { userId: user.id } } }),
    userPlan(prisma, user.id),
    lookupsToday(prisma, user.id),
    prisma.sense.count({ where: { order: 0, translation: null, entry: { userId: user.id } } }),
    countUntranslatedExamples(prisma, user.id),
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
      cardTextSize={settings.cardTextSize}
      credits={ai.unlimited ? null : ai.remaining}
      missingExamples={missingExamples}
      missingMeanings={missingMeanings}
      untranslatedExamples={untranslated}
      planName={plan.name}
      lookups={{ used: lookups, limit: plan.dictionaryLookupsPerDay }}
    />
  );
}
