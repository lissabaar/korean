import type { Metadata, Viewport } from "next";
import { Gowun_Batang, Public_Sans } from "next/font/google";
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
