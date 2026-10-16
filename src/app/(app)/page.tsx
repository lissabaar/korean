/**
 * Home page ("/"): a short "what is this site" block (<HomeIntro/>), then a
 * bento grid — one large tile for what to do now (reviews due, else new
 * words, else when the next review is) and small counter tiles that lead to
 * Learn, Review, Statistics and Categories — and an Add words strip.
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

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
      <BackgroundVerify pending={pendingCheck} />
      <HomeIntro />
      <header className="mb-8">
        <p className="korean text-4xl text-celadon-deep">안녕하세요</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Your words</h1>
      </header>

      {/* Bento grid: one large tile for what to do now (reviews due, else new
          words, else when the next review is), four small ones around it.
          2 columns on phones, 4 on wide screens (the large tile spans 2×2). */}
      <div className="grid auto-rows-[minmax(7.5rem,auto)] grid-cols-2 gap-3 lg:grid-cols-4">
        <Hero due={stats.due} learning={stats.learning} nextDue={stats.nextDue} words={stats.words} />
        <Tile href="/learn" icon="bi-stars" label="New to learn" value={stats.learning} />
        <Tile href="/review" icon="bi-arrow-repeat" label="Due now" value={stats.due} accent={stats.due > 0} />
        <Tile href="/stats" icon="bi-trophy" label="Mastered" value={stats.mastered} />
        <Tile href="/categories" icon="bi-grid" label="Words" value={stats.words} />
        <Link
          href="/add"
          className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-dashed border-line px-5 py-4 text-muted transition-colors hover:border-celadon hover:text-ink lg:col-span-4"
        >
          <i className="bi bi-plus-lg text-xl" aria-hidden />
          <span className="font-medium text-ink">Add words</span>
          <span className="text-sm">from a text, a screenshot, a file — or type them in</span>
        </Link>
      </div>

      {stats.words === 0 && (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
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

    </main>
  );
}

/**
 * The large tile: the one thing to do now. Reviews due come first (they
 * slip if left), then new words; with neither, when the next review is.
 */
function Hero({ due, learning, nextDue, words }: { due: number; learning: number; nextDue: Date | null; words: number }) {
  const action =
    due > 0
      ? { href: "/review", count: due, what: due === 1 ? "word to review" : "words to review", cta: "Start review" }
      : learning > 0
        ? { href: "/learn", count: learning, what: learning === 1 ? "new word to learn" : "new words to learn", cta: "Start learning" }
        : null;
  if (!action) {
    return (
      <div className="col-span-2 flex flex-col justify-between rounded-2xl bg-celadon-soft p-6 lg:row-span-2">
        <p className="korean text-2xl text-celadon-deep">다 했어요</p>
        <div>
          <p className="text-2xl font-semibold tracking-tight">{words === 0 ? "No words yet" : "All caught up"}</p>
          <p className="mt-1 text-sm text-muted">
            {words === 0
              ? "Add some words to start."
              : nextDue
                ? `Next review ${formatWhen(nextDue)}.`
                : "Nothing scheduled."}
          </p>
        </div>
      </div>
    );
  }
  return (
    <Link
      href={action.href}
      className="group col-span-2 flex flex-col justify-between rounded-2xl bg-celadon-deep p-6 text-paper lg:row-span-2"
    >
      <p className="text-sm opacity-80">Now</p>
      <div>
        <p className="text-6xl font-bold tabular-nums tracking-tight">{action.count}</p>
        <p className="mt-1 text-lg">{action.what}</p>
        <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-paper/15 px-4 py-2 text-sm font-medium transition-colors group-hover:bg-paper/25">
          {action.cta}
          <i className="bi bi-arrow-right" aria-hidden />
        </span>
      </div>
    </Link>
  );
}

/** A small counter tile that leads to its page. `accent` highlights it when there is work. */
function Tile({
  href,
  icon,
  label,
  value,
  accent = false,
}: {
  href: string;
  icon: string;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-celadon"
    >
      <span className="flex items-center justify-between text-sm text-muted">
        {label}
        <i className={`bi ${icon}`} aria-hidden />
      </span>
      <span className={`text-3xl font-bold tabular-nums tracking-tight ${accent ? "text-celadon-deep" : ""}`}>{value}</span>
    </Link>
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
