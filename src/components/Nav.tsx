"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home", icon: "bi-house" },
  { href: "/learn", label: "Learn", icon: "bi-stars" },
  { href: "/review", label: "Review", icon: "bi-arrow-repeat" },
  { href: "/add", label: "Add", icon: "bi-plus-lg" },
  { href: "/categories", label: "Categories", icon: "bi-grid" },
  { href: "/settings", label: "Settings", icon: "bi-gear" },
];

/** `email` is null for a visitor without an account. */
export default function Nav({ email }: { email: string | null }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-10 border-b border-line bg-paper/90 backdrop-blur">
      <nav className="mx-auto flex max-w-3xl items-center gap-0.5 px-3 py-2 sm:gap-1 sm:px-6">
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
              <i className={`bi ${link.icon} md:mr-1.5`} aria-hidden />
              {/* Icons only below md: six labels do not fit on a phone. */}
              <span className="hidden md:inline">{link.label}</span>
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
            <i className="bi bi-person-circle sm:mr-1.5" aria-hidden />
            <span className="hidden sm:inline">Sign in</span>
          </Link>
        ) : null}
      </nav>
    </header>
  );
}
