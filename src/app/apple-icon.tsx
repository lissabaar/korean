/**
 * The icon iPhone and iPad use when the site is added to the home screen
 * ("Add to Home Screen" in Safari's share menu).
 *
 * Next.js metadata file: generated at build time with ImageResponse
 * (next/og); Next.js adds the <link rel="apple-touch-icon"> itself. The
 * picture is lib/app-icon.tsx, shared with the manifest icons.
 */

import { ImageResponse } from "next/og";
import { appIcon } from "@/lib/app-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The 180×180 home-screen icon. */
export default function AppleIcon() {
  return new ImageResponse(appIcon(180), size);
}
