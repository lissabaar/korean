/**
 * Home page ("/"): a short "what is this site" block (<HomeIntro/>), deck
 * counters (due now, new to learn, total words) and the three ways in —
 * Learn, Review, Add words.
 *
 * Next.js page (server component): runs on the server for every request, may
 * read the database directly, and returns HTML. The folder path is the URL.
 *
 * Also mounts <BackgroundVerify/>, which quietly re-checks words saved while
 * the dictionary was down, and offers the starter deck to an empty account.
 */

import Link from "next/link";
import { prisma } from "@/lib/db";
import { getAiBalance } from "@/lib/ai-budget";
import { getDeckStats } from "@/lib/review/queue";
import BackgroundVerify from "@/components/BackgroundVerify";
import HomeIntro from "@/components/HomeIntro";
import StarterDeckButton from "@/components/StarterDeckButton";
import { currentUser } from "@/lib/session";
import { STARTER_DECK } from "@/lib/words/starter-deck";

/**
 * The page itself. Next.js calls this default export on the server for each
 * request and sends the HTML it returns. Here: deck counters and the Learn /
 * Review / Add entry points.
 */
export default async function Home() {
  const user = await currentUser();
  if (!user) return null;
  const [stats, ai, pendingCheck] = await Promise.all([
    getDeckStats(prisma, user.id),
    getAiBalance(prisma, user.id),
    prisma.entry.count({ where: { userId: user.id, needsCheck: true } }),
  ]);
  const hasWork = stats.due + stats.learning > 0;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
      <BackgroundVerify pending={pendingCheck} />
      <HomeIntro />
      <header className="mb-8">
        <p className="korean text-4xl text-celadon-deep">안녕하세요</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Your words</h1>
      </header>

      <dl className="grid grid-cols-3 gap-3">
        <Stat label="Due now" value={stats.due} accent={stats.due > 0} />
        <Stat label="New to learn" value={stats.learning} />
        <Stat label="Words" value={stats.words} />
      </dl>

      {/* Three ways in, always visible; counts say whether there is work. */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Action
          href="/learn"
          icon="bi-stars"
          title="Learn"
          note={stats.learning > 0 ? `${stats.learning} new` : "no new words"}
          primary={stats.learning > 0 && stats.due === 0}
        />
        <Action
          href="/review"
          icon="bi-arrow-repeat"
          title="Review"
          note={stats.due > 0 ? `${stats.due} due` : "all caught up"}
          primary={stats.due > 0}
        />
        <Action href="/add" icon="bi-plus-lg" title="Add words" note="text, files or by hand" />
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

/**
 * One counter tile (Due now, New to learn, Words). `accent` highlights it when
 * there is work.
 */
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

/** "in 3 h", "tomorrow", "in 4 days" — when the next review is due. */
function formatWhen(date: Date): string {
  const hours = (date.getTime() - Date.now()) / 3_600_000;
  if (hours < 1) return "in under an hour";
  if (hours < 24) return `in ${Math.round(hours)} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

/**
 * One big entry button (Learn, Review, Add words) with an icon and a short note;
 * `primary` paints it in the accent colour.
 */
function Action({
  href,
  icon,
  title,
  note,
  primary = false,
}: {
  href: string;
  icon: string;
  title: string;
  note: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-4 py-3.5 sm:flex-col sm:items-start sm:gap-1 ${
        primary ? "bg-celadon-deep text-paper" : "border border-line bg-surface"
      }`}
    >
      <i className={`bi ${icon} text-xl`} aria-hidden />
      <span className="font-medium">{title}</span>
      <span className={`ml-auto text-sm sm:ml-0 ${primary ? "opacity-80" : "text-muted"}`}>{note}</span>
    </Link>
  );
}
