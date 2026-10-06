/**
 * "/pricing" — the plans page. A placeholder: nothing can be bought yet
 * (see PAYMENTS.md). Prices and features come from lib/plans.ts.
 *
 * Next.js page (server component): runs on the server for every request, may
 * read the database directly, and returns HTML. The folder path is the URL.
 */

import { PLANS } from "@/lib/plans";

export const metadata = { title: "Plans · Korean vocabulary" };

/** Placeholder: plans are shown, nothing can be bought yet. */
export default function PricingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
      <header className="mb-6">
        <p className="korean text-4xl text-celadon-deep">요금제</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Plans</h1>
        <p className="mt-2 text-sm text-muted">
          Learning and reviewing are free, always. Plans add AI for turning texts, screenshots and
          Anki decks into cards. Paid plans are not available yet.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <section
            key={plan.id}
            className={`flex flex-col rounded-lg border bg-surface p-5 ${
              plan.id === "plus" ? "border-celadon-deep" : "border-line"
            }`}
          >
            <h2 className="font-medium">{plan.name}</h2>
            <p className="mt-2">
              {plan.priceUsd === null ? (
                <span className="text-3xl font-bold">$0</span>
              ) : (
                <>
                  <span className="text-3xl font-bold">${plan.priceUsd}</span>
                  <span className="text-sm text-muted"> / month</span>
                </>
              )}
            </p>
            {plan.yearlyUsd !== null && (
              <p className="text-xs text-muted">or ${plan.yearlyUsd} a year</p>
            )}
            <p className="mt-2 text-sm text-celadon-deep">{plan.wordsHint}</p>
            <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-2">
                  <i className="bi bi-check2 text-celadon-deep" aria-hidden />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled
              className="mt-5 rounded-md border border-line px-4 py-2.5 text-sm text-muted"
            >
              {plan.priceUsd === null ? "Your current plan" : "Coming soon"}
            </button>
          </section>
        ))}
      </div>
    </main>
  );
}
