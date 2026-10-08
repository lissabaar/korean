/**
 * Root layout — the outermost HTML around every page of the site.
 *
 * Next.js wraps every page in the nearest layout.tsx files, from the root
 * down. This one sets <html>/<body>, loads the two web fonts (Public Sans for
 * Latin text, Gowun Batang for Hangul), the Bootstrap Icons font, and the
 * global CSS with the design tokens (globals.css). `metadata` and `viewport`
 * become <title>/<meta> tags.
 */

import type { Metadata, Viewport } from "next";
import { Gowun_Batang, Public_Sans } from "next/font/google";
import "bootstrap-icons/font/bootstrap-icons.min.css";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

const publicSans = Public_Sans({
  subsets: ["latin"],
  variable: "--font-public-sans",
  display: "swap",
});

// Korean serif. Hangul subsets are large, so this loads only the weights used.
const gowun = Gowun_Batang({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-gowun",
  display: "swap",
});

/**
 * Search and social metadata. Pages set only their own title ("Learn"); the
 * template adds the site name. metadataBase turns relative URLs (the
 * canonical link, the preview image) into absolute ones.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — learn Korean words from what you read`, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["Korean", "learn Korean", "Korean vocabulary", "flashcards", "spaced repetition", "Anki", "KRDict", "한국어"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — learn Korean words from what you read`,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title: SITE_NAME, description: SITE_DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Wraps every page: `children` is the page (or the nested layout) Next.js
 * renders inside. The font classes put the fonts' CSS variables on <body>.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-theme is set by the script below before React loads, so React
    // must not complain that the server's <html> had none.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The stored light/dark choice, applied before the first paint (see ThemeToggle.tsx). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("hangugo:theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body className={`${publicSans.variable} ${gowun.variable}`}>
        {children}
      </body>
    </html>
  );
}
