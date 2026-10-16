"use client";

/**
 * The /stats page body: word totals by stage (not started, learning, in
 * review, mastered), a table of the last 14 days, and the way into
 * "Practice mastered words".
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys. Runs in the browser because the days must be the
 * user's local days: it sends its time zone offset to GET /api/stats.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import type { StatsResult } from "@/lib/stats";

export default function StatsView() {
  const [stats, setStats] = useState<StatsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/stats?tz=${new Date().getTimezoneOffset()}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load the statistics.");
        setStats(data);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load the statistics."));
  }, []);

  if (error) return <p className="rounded-md bg-clay-soft px-3 py-2 text-sm text-clay">{error}</p>;
  if (!stats) return <p className="text-sm text-muted">Loading…</p>;

  const { totals, days } = stats;
  const active = days.filter((day) => day.started + day.learned + day.reviews + day.mastered > 0);

  return (
    <div>
      {/* Where the words are now. */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="Words" value={totals.words} />
        <Tile label="Not started" value={totals.notStarted} />
        <Tile label="Learning" value={totals.learning} />
        <Tile label="In review" value={totals.inReview} />
        <Tile label="Mastered" value={totals.mastered} accent />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        {totals.mastered > 0 ? (
          <Link
            href="/review?mode=mastered"
            className="rounded-md bg-celadon-deep px-4 py-2.5 font-medium text-paper"
          >
            <i className="bi bi-trophy mr-1.5" aria-hidden />
            Practice mastered words
          </Link>
        ) : (
          <span className="text-muted">No mastered words yet.</span>
        )}
        <Link href="/how-it-works" className="text-celadon-deep underline underline-offset-4">
          How learning works
        </Link>
      </div>

      {/* The last 14 days, newest first; quiet days are left out. */}
      <h2 className="mt-8 font-medium">Last {days.length} days</h2>
      {active.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing yet — learn or review a few words and come back.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-normal">Day</th>
                <th className="px-3 py-2 text-right font-normal">Started</th>
                <th className="px-3 py-2 text-right font-normal">Learned</th>
                <th className="px-3 py-2 text-right font-normal">Reviews (right)</th>
                <th className="px-4 py-2 text-right font-normal">Mastered</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {active.map((day) => (
                <tr key={day.date} className="border-t border-line/60">
                  <td className="px-4 py-2">{dayLabel(day.date)}</td>
                  <td className="px-3 py-2 text-right">{day.started || "–"}</td>
                  <td className="px-3 py-2 text-right">{day.learned || "–"}</td>
                  <td className="px-3 py-2 text-right">
                    {day.reviews ? `${day.reviews} (${day.reviewsRight})` : "–"}
                  </td>
                  <td className="px-4 py-2 text-right">{day.mastered || "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">
        Words count once each (by their English → Korean card). Reviews count every answer, both directions.
      </p>
    </div>
  );
}

/** One counter tile. */
function Tile({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-1 text-2xl font-bold tabular-nums ${accent ? "text-celadon-deep" : ""}`}>{value}</dd>
    </div>
  );
}

/** "Today", "Yesterday", else "Mon 6 Oct" — for a local YYYY-MM-DD date. */
function dayLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year, month - 1, day);
  const today = new Date();
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((midnight.getTime() - value.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return value.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
