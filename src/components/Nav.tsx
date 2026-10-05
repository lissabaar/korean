"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth-client";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/review", label: "Review" },
  { href: "/add", label: "Add words" },
];

export default function Nav({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <header className="sticky top-[env(safe-area-inset-top,0px)] z-10 border-b border-line bg-paper/90 backdrop-blur">
      <nav className="mx-auto flex max-w-2xl items-center gap-1 px-4 py-2.5 sm:px-6">
        <Link href="/" className="korean mr-3 text-xl text-celadon-deep" aria-label="Home">
          단어
        </Link>
        {LINKS.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-2.5 py-1.5 text-sm ${
                active ? "bg-celadon-soft font-medium text-celadon-deep" : "text-muted hover:text-ink"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={handleSignOut}
          disabled={busy}
          title={email}
          className="ml-auto rounded-md px-2.5 py-1.5 text-sm text-muted hover:text-ink disabled:opacity-50"
        >
          Sign out
        </button>
      </nav>
    </header>
  );
}
