/**
 * /robots.txt — tells search engines what to crawl: the public landing page
 * and the sign-in/up pages; not the API or the personal app pages (they show
 * one user's words and are also marked noindex).
 *
 * Next.js metadata route: this file's default export becomes robots.txt.
 */

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** The robots.txt rules. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/add", "/learn", "/review", "/categories", "/settings"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
