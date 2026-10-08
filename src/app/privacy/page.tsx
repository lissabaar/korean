/**
 * "/privacy" — what the site stores, where it goes, and why there is no
 * cookie banner (only strictly necessary storage: the sign-in session and a
 * few display preferences; no analytics, no ads, no tracking).
 *
 * Next.js page (server component): static text, public, indexable. Outside
 * the (app) group, so it needs no session. Keep it true when adding anything
 * that stores data or sends it somewhere (analytics, payments, email).
 */

import Link from "next/link";
import { SITE_NAME } from "@/lib/site";

export const metadata = { title: "Privacy" };

/** The privacy page. */
export default function PrivacyPage() {
  const h2 = "mt-8 text-lg font-semibold";
  const p = "mt-2 text-muted";
  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6">
      <Link href="/" className="korean text-xl text-celadon-deep">
        단어
      </Link>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Privacy</h1>
      <p className={p}>
        {SITE_NAME} is a small personal project. It keeps only what it needs to work, shows no ads and
        uses no analytics or tracking.
      </p>

      <h2 className={h2}>Cookies and browser storage</h2>
      <p className={p}>
        One cookie keeps you signed in (also for using the app without an account). A few settings
        are kept in your browser&apos;s local storage: light or dark theme, how words are added, and
        which parts of a file were already imported. All of this is needed for the site to work, so
        there is no cookie banner — nothing is used to track you.
      </p>

      <h2 className={h2}>What is stored</h2>
      <p className={p}>
        Your email address and name if you create an account (or your Google account&apos;s email and
        name if you sign in with Google); the words, meanings, categories and examples you add; your
        study progress; and how much AI each request used, for the free AI allowance.
      </p>

      <h2 className={h2}>Where it goes</h2>
      <p className={p}>
        The site runs on Vercel and stores data in a Neon PostgreSQL database. Text and images you
        add are sent to Anthropic&apos;s Claude to find the words; Anthropic does not use them to
        train models. Files are read in your browser: only their text, or a reduced copy of an image,
        is sent. Dictionary data comes from the Korean learners&apos; dictionary (한국어기초사전) of the
        National Institute of Korean Language.
      </p>

      <h2 className={h2}>Deleting your data</h2>
      <p className={p}>
        You can delete any word or category in the app at any time. To delete your whole account and
        everything in it, ask the site owner.
      </p>
    </main>
  );
}
