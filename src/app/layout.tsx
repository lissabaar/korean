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

export const metadata: Metadata = {
  title: "Korean vocabulary",
  description: "Turn Korean texts into flashcards worth reviewing.",
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
    <html lang="en">
      <body className={`${publicSans.variable} ${gowun.variable}`}>
        {children}
      </body>
    </html>
  );
}
