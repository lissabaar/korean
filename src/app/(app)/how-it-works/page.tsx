/**
 * "/how-it-works" — how the app teaches a word: meeting it, the learning
 * drill, spaced review, and when it counts as mastered.
 *
 * Next.js page (server component): runs on the server for every request, may
 * read the database directly, and returns HTML. The folder path is the URL.
 *
 * Every number on the page comes from the code (steps.ts, mastery.ts,
 * intro.ts, session.ts) and the user's own settings, so the text cannot drift
 * from what the app does. Change the explanation here when the logic changes.
 */

import Link from "next/link";
import { prisma } from "@/lib/clients";
import { currentUser } from "@/lib/session";
import { KNOWN_FIRST_REVIEW_DAYS, SKIP_DAYS } from "@/lib/review/intro";
import { clampMasteredAfterDays, MASTERY_STREAK } from "@/lib/review/mastery";
import { CHOICE_REVIEWS_BEFORE_TYPING, clampLearningGoal } from "@/lib/review/session";
import { PICKS_AFTER_TYPING_MISS, stepsToLearn, typedFromStreak } from "@/lib/review/steps";
import { OFFLINE_DAYS } from "@/lib/offline/pack";

// Lives in the app (it shows the user's own numbers): kept out of search results.
export const metadata = { title: "How learning works", robots: { index: false } };

export default async function HowItWorksPage() {
  const user = await currentUser();
  if (!user) return null;
  const settings = await prisma.user.findUnique({
    where: { id: user.id },
    select: { learningGoal: true, masteredAfterDays: true, desiredRetention: true },
  });
  const goal = clampLearningGoal(settings?.learningGoal);
  const total = stepsToLearn(goal);
  const picks = typedFromStreak(goal);
  const typed = total - picks;
  const masteredAfter = clampMasteredAfterDays(settings?.masteredAfterDays);
  const retention = Math.round((settings?.desiredRetention ?? 0.9) * 100);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-7">
        <p className="korean text-4xl text-celadon-deep">공부하는 법</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">How learning works</h1>
        <p className="mt-2 text-sm text-muted">
          A word goes through four stages: new → learning → review → mastered. The numbers below are your
          current settings.
        </p>
      </header>

      <Stage n={1} title="Meet the word">
        <p>
          A new word is first shown whole: meaning, definition, example. Then you choose:
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Start learning</b> — it goes into the drill below.</li>
          <li><b>Skip for {SKIP_DAYS} days</b> — it stays out of new-word sessions until then.</li>
          <li>
            <b>I know it</b> — no drill; it goes straight to review, first checked in {KNOWN_FIRST_REVIEW_DAYS} days.
          </li>
        </ul>
      </Stage>

      <Stage n={2} title="Learning: right answers in a row">
        <p>
          A word is learned after <b>{total} right answers in a row</b> within your sessions: the first {picks}{" "}
          picked from options, the last {typed} typed.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>A wrong pick starts the count over.</li>
          <li>
            A wrong typed answer sends it back {PICKS_AFTER_TYPING_MISS} picks before typing — not all the way
            to the start.
          </li>
          <li>A right answer typed with the hint does not count: the count stays where it was.</li>
          <li>Typos count as wrong unless “Forgive typos” is on in Settings.</li>
        </ul>
        <p className="mt-2">
          This drill is not part of the review schedule: practice inside one session says little about
          whether you will remember the word next week.
        </p>
      </Stage>

      <Stage n={3} title="Review: spaced repetition">
        <p>
          The first review is <b>the next day</b>. After that the gaps are set by FSRS, a spaced-repetition
          scheduler that aims for a {retention}% chance you still remember the word when it comes up. Each
          right answer makes the next gap longer — roughly 1, 3, 14, 57 days and on — and a miss brings the
          word back the next day.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>The first {CHOICE_REVIEWS_BEFORE_TYPING} reviews of a word are picked from options, then typed.</li>
          <li>A right answer with the hint counts as not remembered.</li>
        </ul>
      </Stage>

      <Stage n={4} title="Mastered">
        <p>
          A word is mastered after <b>{MASTERY_STREAK} right reviews in a row</b>, the last one at least{" "}
          <b>{masteredAfter} days</b> after the review before it. A mastered word no longer comes up in review.
        </p>
        <p className="mt-2">
          Why a long last gap: remembering a word after two months says much more than three right answers a
          few days apart. In a long study of foreign-language words (Bahrick et al., 1993), words reviewed 56
          days apart were kept far better than words reviewed at short gaps. You can change the number of
          days in Settings.
        </p>
        <p className="mt-2">
          You can still practise mastered words any time. A right answer there changes nothing; a miss sends
          the word back to review.
        </p>
      </Stage>

      {/* Offline: how to install the app and get cards onto the phone first.
          Matches lib/offline (OFFLINE_DAYS of reviews, 40 new words) and
          public/sw.js. */}
      <section id="offline" className="mt-6 scroll-mt-20 rounded-2xl border border-line bg-surface p-5 text-sm leading-relaxed">
        <h2 className="flex items-center gap-2 text-base font-medium">
          <i className="bi bi-airplane text-celadon-deep" aria-hidden />
          Studying offline — on a plane, in the metro
        </h2>
        <p className="mt-2">
          Learn and Review work without a connection. Install the app on your phone, then open it once while
          online — it keeps the reviews due in the next {OFFLINE_DAYS} days and every word you have not started
          yet on the device. Offline, answers are saved on the phone and sent automatically the next time you are online;
          the review schedule counts them at the time you answered.
        </p>
        <h3 className="mt-4 font-medium">1. Install the app</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>
            <b>iPhone / iPad (Safari):</b> open this site, tap Share <i className="bi bi-box-arrow-up" aria-hidden /> →
            “Add to Home Screen” → Add.
          </li>
          <li>
            <b>Android (Chrome):</b> menu <i className="bi bi-three-dots-vertical" aria-hidden /> → “Install app” (or
            “Add to Home screen”).
          </li>
          <li>
            <b>Computer (Chrome, Edge):</b> the install icon at the right end of the address bar, or menu → “Install”.
          </li>
        </ul>
        <h3 className="mt-4 font-medium">2. Before you go</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Open the installed app while you still have a connection, and open Learn and Review once.</li>
          <li>That is all: the cards are refreshed every time you use the app online.</li>
        </ul>
        <h3 className="mt-4 font-medium">3. Offline</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Learn and Review work as usual; a note at the top says you are offline.</li>
          <li>
            Adding words, editing them, categories, statistics and hanja need a connection. A skipped word gets
            no replacement in the session until you are online.
          </li>
        </ul>
      </section>

      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link href="/stats" className="rounded-md bg-celadon-deep px-4 py-2.5 font-medium text-paper">
          Your statistics
        </Link>
        <Link href="/settings" className="rounded-md border border-line px-4 py-2.5">
          Settings
        </Link>
      </div>
    </main>
  );
}

/** One numbered stage of the explanation. */
function Stage({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface p-5 text-sm leading-relaxed">
      <h2 className="flex items-baseline gap-2 text-base font-medium">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-celadon-soft text-xs text-celadon-deep">
          {n}
        </span>
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
