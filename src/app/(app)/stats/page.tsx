/**
 * "/stats" — progress: how many words are not started, being learned, in
 * review and mastered, and what was done on each of the last 14 days.
 *
 * Next.js page (server component): only the frame; the numbers are loaded in
 * the browser by <StatsView/>, which knows the user's time zone.
 */

import StatsView from "@/components/StatsView";

// Personal page: kept out of search results (see also app/robots.ts).
export const metadata = { title: "Statistics", robots: { index: false } };

export default function StatsPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-7">
        <p className="korean text-4xl text-celadon-deep">통계</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Statistics</h1>
      </header>
      <StatsView />
    </main>
  );
}
