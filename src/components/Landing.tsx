/**
 * The public face of the site: what a first-time visitor — and a search
 * engine — sees before any session exists. A heading, what the app does,
 * how it works, and the way in.
 *
 * Server component (no "use client"): rendered to plain HTML, so crawlers
 * that run no JavaScript still read it. A real visitor sees it only for the
 * moment <StartAnonymous/> needs to start their anonymous session, then the
 * app itself opens. Also carries schema.org data (WebApplication) for search
 * results.
 */

import Link from "next/link";
import { SITE_DESCRIPTION, SITE_NAME, SITE_POINTS, SITE_URL } from "@/lib/site";

/** Structured data for search engines: what kind of thing this site is. */
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "EducationalApplication",
  operatingSystem: "Any (web browser)",
  inLanguage: "en",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

/** The landing page; `status` is what the session starter shows (opening, or an error). */
export default function Landing({ status }: { status?: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-12 sm:px-6">
      <script
        type="application/ld+json"
        // JSON-LD must be raw JSON in the page; it is built from constants above.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <p className="korean text-5xl text-celadon-deep">한국어 단어장</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        Learn Korean words from what you actually read
      </h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">
        A free flashcard app for learners of Korean. Turn your own texts, screenshots and decks into
        cards, learn them with short drills, and keep them with spaced repetition.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link href="/" className="rounded-md bg-celadon-deep px-5 py-3 font-medium text-paper">
          Start learning — no sign-up needed
        </Link>
        <Link href="/sign-in" className="rounded-md border border-line px-5 py-3">
          Sign in
        </Link>
        {status && <span className="text-sm text-muted">{status}</span>}
      </div>

      <h2 className="mt-12 text-xl font-semibold">How it works</h2>
      <ul className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {SITE_POINTS.map((point) => (
          <li key={point.title} className="rounded-lg border border-line bg-surface p-5">
            <i className={`bi ${point.icon} text-2xl text-celadon-deep`} aria-hidden />
            <h3 className="mt-2 font-medium">{point.title}</h3>
            <p className="mt-1 text-sm text-muted">{point.text}</p>
          </li>
        ))}
      </ul>

      <h2 className="mt-12 text-xl font-semibold">Made for real reading</h2>
      <p className="mt-2 max-w-3xl text-muted">
        Words come with their dictionary form (먹었어요 → 먹다), the meaning used in your text, hanja,
        level and example sentences. Write your own translation in any language — it is kept next to
        the dictionary&apos;s. Learning and reviewing are free; finding words with AI uses a small
        allowance of free credits.
      </p>
      <p className="mt-12 text-xs text-muted">
        Dictionary data: 한국어기초사전, National Institute of Korean Language, CC BY-SA 2.0 KR ·{" "}
        <Link href="/privacy" className="underline underline-offset-2">
          Privacy
        </Link>
      </p>
    </main>
  );
}
