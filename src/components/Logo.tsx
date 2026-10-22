/**
 * The INLEX wordmark: the name in caps, "IN" underlined by the same light
 * highlighter stroke as the app icon (lib/app-icon.tsx) — a word marked in a
 * text. Shown in the nav, on the sign-in / sign-up form and the privacy page.
 *
 * React component without state or browser APIs, so both server pages and
 * client components (Nav) can render it. `size` picks the text size.
 */

import { SITE_NAME } from "@/lib/site";

export default function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span
      className={`inline-flex items-baseline font-bold tracking-tight text-celadon-deep ${
        size === "lg" ? "text-4xl" : "text-lg"
      }`}
      aria-label={SITE_NAME}
    >
      {/* The highlighter: a light band across the lower part of "IN". */}
      <span className="bg-[linear-gradient(transparent_62%,var(--color-celadon-soft)_62%)] px-px" aria-hidden>
        IN
      </span>
      <span aria-hidden>LEX</span>
    </span>
  );
}
