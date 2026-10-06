import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAiBalance } from "@/lib/ai-budget";
import { getDeckStats } from "@/lib/review/queue";
import StarterDeckButton from "@/components/StarterDeckButton";
import { currentUser } from "@/lib/session";
import { STARTER_DECK } from "@/lib/words/starter-deck";

export default async function Home() {
  const user = await currentUser();
  if (!user) return null;
  const [stats, ai] = await Promise.all([
    getDeckStats(prisma, user.id),
    getAiBalance(prisma, user.id),
  ]);
  const hasWork = stats.due + stats.learning > 0;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-8">
        <p className="korean text-4xl text-celadon-deep">안녕하세요</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Your words</h1>
      </header>

      <dl className="grid grid-cols-3 gap-3">
        <Stat label="Due now" value={stats.due} accent={stats.due > 0} />
        <Stat label="New to learn" value={stats.learning} />
        <Stat label="Words" value={stats.words} />
      </dl>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {stats.due > 0 && (
          <Link
            href="/review?mode=review"
            className="rounded-md bg-celadon-deep px-6 py-3 text-center font-medium text-paper"
          >
            <i className="bi bi-arrow-repeat mr-2" aria-hidden />
            Review · {stats.due}
          </Link>
        )}
        {stats.learning > 0 && (
          <Link
            href="/review?mode=learn"
            className={`rounded-md px-6 py-3 text-center font-medium ${
              stats.due > 0 ? "border border-celadon bg-surface text-celadon-deep" : "bg-celadon-deep text-paper"
            }`}
          >
            <i className="bi bi-stars mr-2" aria-hidden />
            Learn new words · {stats.learning}
          </Link>
        )}
        <Link
          href="/add"
          className={`rounded-md px-6 py-3 text-center font-medium ${
            hasWork
              ? "border border-line bg-surface"
              : "bg-celadon-deep text-paper"
          }`}
        >
          Add words
        </Link>
      </div>

      {stats.words === 0 && (
        <div className="mt-6 rounded-lg border border-line bg-surface p-5">
          <p className="font-medium">No words yet?</p>
          <p className="mt-1 text-sm text-muted">
            Start with {STARTER_DECK.length} everyday words to see how learning works — you can
            switch their categories off later.
          </p>
          <StarterDeckButton />
        </div>
      )}

      {!ai.unlimited && !ai.anonymous && (
        <p className="mt-5 text-xs text-muted">
          {ai.remaining > 0
            ? `${ai.remaining} of ${ai.allowance} free AI credits left for finding new words.`
            : "Free AI credits are used up — reviews keep working as usual."}
        </p>
      )}

      {!hasWork && (
        <p className="mt-5 text-sm text-muted">
          {stats.words === 0
            ? "Add words by typing them in, or — with a free account — from texts, screenshots and Anki decks."
            : stats.nextDue
              ? `All caught up. Next review ${formatWhen(stats.nextDue)}.`
              : "All caught up."}
        </p>
      )}
    </main>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 text-3xl font-bold tabular-nums ${accent ? "text-celadon-deep" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function formatWhen(date: Date): string {
  const hours = (date.getTime() - Date.now()) / 3_600_000;
  if (hours < 1) return "in under an hour";
  if (hours < 24) return `in ${Math.round(hours)} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}
