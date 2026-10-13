"use client";

/**
 * Top navigation bar shown on every app page: links (Home, Learn, Review,
 * Add, Categories, Settings) and the account / sign-in link.
 *
 * React client component ("use client"): runs in the browser, so it can hold
 * state, react to clicks and call the API with fetch(). It cannot touch the
 * database or secret keys. (it highlights the current page, which needs the
 * browser's URL).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Fired on window when a nav link to the current page is clicked; detail = href. */
export const SAME_PAGE_EVENT = "hangugo:same-page";

interface NavItem {
  href: string;
  label: string;
  /** Bootstrap Icons class — or `glyph`, a character shown as the icon. */
  icon?: string;
  glyph?: string;
}

/** Left to right: home and how it works first (owner's order), then the rest. */
const LINKS: NavItem[] = [
  { href: "/", label: "Home", icon: "bi-house" },
  { href: "/how-it-works", label: "How it works", icon: "bi-info-circle" },
  { href: "/learn", label: "Learn", icon: "bi-stars" },
  { href: "/review", label: "Review", icon: "bi-arrow-repeat" },
  { href: "/add", label: "Add", icon: "bi-plus-lg" },
  { href: "/categories", label: "Categories", icon: "bi-grid" },
  { href: "/stats", label: "Statistics", icon: "bi-bar-chart" },
  // 字 — the "ja" of 한자 (漢字): "written character".
  { href: "/hanja", label: "Hanja", glyph: "字" },
];

/** Settings sits apart at the right edge (where the theme button was). */
const SETTINGS: NavItem = { href: "/settings", label: "Settings", icon: "bi-gear" };

/** `email` is null for a visitor without an account. */
export default function Nav({ email }: { email: string | null }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-10 border-b border-line bg-paper/90 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center gap-0.5 px-3 py-2 sm:gap-1 sm:px-6">
        <Link href="/" className="korean mr-2 text-xl text-celadon-deep" aria-label="Home">
          단어
        </Link>
        {LINKS.map((link) => (
          <NavLink key={link.href} link={link} pathname={pathname} />
        ))}
        <div className="ml-auto flex items-center">
          {email === null ? (
            // No account yet. Sign-in links to sign-up, and either way the words
            // added so far come along.
            <Link
              href="/sign-in"
              className="rounded-md px-2 py-1.5 text-sm font-medium text-celadon-deep"
            >
              <i className="bi bi-person-circle sm:mr-1.5" aria-hidden />
              <span className="hidden sm:inline">Sign in</span>
            </Link>
          ) : null}
          <NavLink link={SETTINGS} pathname={pathname} />
        </div>
      </nav>
    </header>
  );
}

/** One nav entry: icon (or glyph), with its label on wide screens. */
function NavLink({ link, pathname }: { link: NavItem; pathname: string }) {
  const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      aria-label={link.label}
      // Clicking the page you are on does not remount it in Next.js, so
      // the page would stay as it is (the + on a finished import did
      // nothing). Tell the page instead; /add starts over (AddWords).
      onClick={() => {
        if (active) window.dispatchEvent(new CustomEvent(SAME_PAGE_EVENT, { detail: link.href }));
      }}
      className={`rounded-md px-1.5 py-1.5 text-sm sm:px-2 ${
        active ? "bg-celadon-soft font-medium text-celadon-deep" : "text-muted hover:text-ink"
      }`}
    >
      {link.glyph ? (
        <span className="korean font-semibold leading-none lg:mr-1.5" aria-hidden>
          {link.glyph}
        </span>
      ) : (
        <i className={`bi ${link.icon} lg:mr-1.5`} aria-hidden />
      )}
      {/* Icons only below lg: nine labels do not fit on a phone or tablet. */}
      <span className="hidden lg:inline">{link.label}</span>
    </Link>
  );
}
