"use client";

/**
 * Runs on a visitor's very first load (no session yet): creates an anonymous
 * account in the browser and reloads, so the app works without signing up.
 * Renders just a status line ("Opening…") inside the landing page.
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys.
 *
 * Done in the browser on purpose: search-engine crawlers do not run
 * JavaScript, so they never create accounts.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signIn } from "@/lib/auth-client";

/** First visit: open an anonymous session, then show the app. */
export default function StartAnonymous() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // Strict mode runs effects twice in development; one session is enough.
    if (started.current) return;
    started.current = true;
    signIn.anonymous().then((result) => {
      if (result.error) setFailed(true);
      else router.refresh();
    });
  }, [router]);

  // Only the status line: the landing page around it is rendered on the
  // server by (app)/layout.tsx, so crawlers (no JavaScript) read it.
  return failed ? (
    <>
      Could not start. Reload the page, or{" "}
      <Link href="/sign-in" className="text-celadon-deep underline underline-offset-4">
        sign in
      </Link>
      .
    </>
  ) : (
    <>Opening…</>
  );
}
