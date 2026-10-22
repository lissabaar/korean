/**
 * The browser-tab icon (favicon): the INLEX mark from lib/app-icon.tsx.
 *
 * Next.js metadata file: generated at build time with ImageResponse
 * (next/og); Next.js adds the <link rel="icon"> itself. Replaces the old
 * default favicon.ico.
 */

import { ImageResponse } from "next/og";
import { appIcon } from "@/lib/app-icon";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** The 64×64 tab icon (browsers scale it down). */
export default function Icon() {
  return new ImageResponse(appIcon(64), size);
}
