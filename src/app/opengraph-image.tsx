/**
 * The preview image shown when a link to the site is shared (Telegram,
 * WhatsApp, social networks): site name and what it does on the app's
 * celadon palette.
 *
 * Next.js metadata route: generated once at build time with ImageResponse
 * (next/og). Latin text only — the built-in font has no Hangul.
 */

import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

export const alt = `${SITE_NAME} — learn Korean words from what you read`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The 1200×630 preview image. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#f3f5f3",
          color: "#1e2622",
        }}
      >
        <div style={{ fontSize: 40, color: "#3c5f52" }}>{SITE_NAME}</div>
        <div style={{ marginTop: 24, fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>
          Learn Korean words from what you actually read
        </div>
        <div style={{ marginTop: 32, fontSize: 32, color: "#6b7670" }}>
          Texts, screenshots, Anki decks → dictionary-checked flashcards with spaced repetition
        </div>
      </div>
    ),
    size,
  );
}
