/**
 * The web app manifest (/manifest.webmanifest): lets a phone install the
 * site as an app — its own icon on the home screen, opening full screen
 * without the browser's address bar. Together with the service worker
 * (public/sw.js) and the offline card pack (lib/offline) this is what makes
 * learning and reviewing work with no connection.
 *
 * Next.js metadata route: Next.js serves it and links it from every page.
 */

import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "단어",
    description: SITE_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f3",
    theme_color: "#3c5f52",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
