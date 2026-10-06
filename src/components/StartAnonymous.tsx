"use client";

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

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-5 py-10">
      <p className="korean mb-3 text-5xl text-celadon-deep">단어</p>
      {failed ? (
        <p className="text-sm text-muted">
          Could not start. Reload the page, or{" "}
          <Link href="/sign-in" className="text-celadon-deep underline underline-offset-4">
            sign in
          </Link>
          .
        </p>
      ) : (
        <p className="text-sm text-muted">Opening…</p>
      )}
    </main>
  );
}
