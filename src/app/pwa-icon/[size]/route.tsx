/**
 * GET /pwa-icon/192 and /pwa-icon/512 — the home-screen icons named in the
 * web app manifest (app/manifest.ts), as PNG.
 *
 * Next.js route handler: an HTTP endpoint at the folder path; [size] is the
 * variable part. Draws lib/app-icon.tsx with ImageResponse (next/og). Fixed
 * URLs on purpose: the manifest needs stable addresses (generated "icon"
 * routes get a hash in theirs).
 */

import { ImageResponse } from "next/og";
import { appIcon } from "@/lib/app-icon";

const SIZES = new Set([192, 512]);

/** The icon at the requested size (192 or 512 px). */
export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  return new ImageResponse(appIcon(size), { width: size, height: size });
}
