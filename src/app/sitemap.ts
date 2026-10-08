/**
 * /sitemap.xml — the public pages search engines should know about.
 *
 * Next.js metadata route: this file's default export becomes sitemap.xml.
 */

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** The public pages: the landing page first. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/sign-up`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${SITE_URL}/sign-in`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
