/**
 * The site's public identity: name, address and description — used by the
 * metadata (title, description, social previews), robots.txt, sitemap.xml
 * and the landing page. Safe to import anywhere (no secrets).
 */

export const SITE_NAME = "Korean vocabulary";

export const SITE_DESCRIPTION =
  "Learn Korean words from what you actually read. Paste a text, a screenshot, subtitles or an Anki deck: the AI finds the words, the Korean learners' dictionary checks them, and spaced repetition keeps them.";

/**
 * The address search engines and link previews should use: the production
 * domain on Vercel, otherwise the configured auth URL (local development).
 */
export const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : (process.env.BETTER_AUTH_URL ?? "http://localhost:3000");

/** The four points the site is about — on the landing page and the home page intro. */
export const SITE_POINTS = [
  {
    icon: "bi-clipboard-plus",
    title: "Add from anything",
    text: "Paste a text or a word list, drop a screenshot, subtitles, an Anki or ReWord deck — or just ask for a topic.",
  },
  {
    icon: "bi-book",
    title: "Checked by a dictionary",
    text: "The AI finds the words and their dictionary form; the Korean learners' dictionary (KRDict) supplies meanings, levels, hanja and examples.",
  },
  {
    icon: "bi-stars",
    title: "Learn",
    text: "Meet each new word, then short drills: pick it a few times, then type it.",
  },
  {
    icon: "bi-arrow-repeat",
    title: "Remember",
    text: "Reviews on a spaced-repetition schedule (FSRS): every word comes back just before you would forget it.",
  },
] as const;
