"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";

const LINKS = [
  { href: "/", label: "Home", icon: "bi-house" },
  { href: "/review", label: "Study", icon: "bi-mortarboard" },
  { href: "/add", label: "Add", icon: "bi-plus-lg" },
  { href: "/categories", label: "Categories", icon: "bi-grid" },
];

/** `email` is null for a visitor without an account. */
export default function Nav({ email }: { email: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-10 border-b border-line bg-paper/90 backdrop-blur">
      <nav className="mx-auto flex max-w-2xl items-center gap-0.5 px-3 py-2 sm:gap-1 sm:px-6">
        <Link href="/" className="korean mr-2 text-xl text-celadon-deep" aria-label="Home">
          단어
        </Link>
        {LINKS.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              aria-label={link.label}
              className={`rounded-md px-2 py-1.5 text-sm ${
                active ? "bg-celadon-soft font-medium text-celadon-deep" : "text-muted hover:text-ink"
              }`}
            >
              <i className={`bi ${link.icon} sm:mr-1.5`} aria-hidden />
              {/* Icons only on phones: five labels do not fit in 360px. */}
              <span className="hidden sm:inline">{link.label}</span>
            </Link>
          );
        })}
        {email === null ? (
          // No account yet. Sign-in links to sign-up, and either way the words
          // added so far come along.
          <Link
            href="/sign-in"
            className="ml-auto rounded-md px-2 py-1.5 text-sm font-medium text-celadon-deep"
          >
            <i className="bi bi-person-circle mr-1.5" aria-hidden />
            Sign in
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleSignOut}
            disabled={busy}
            title={email}
            className="ml-auto rounded-md px-2 py-1.5 text-sm text-muted hover:text-ink disabled:opacity-50"
          >
            <i className="bi bi-box-arrow-right sm:mr-1.5" aria-hidden />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        )}
      </nav>
    </header>
  );
}
