import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Allow crawling of the public marketing pages while keeping the authenticated
 * app and API surface out of search indexes. AI crawlers are welcome — being
 * found across AI assistants (GEO) is the whole point of the product.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/onboarding",
          "/settings",
          "/articles",
          "/topics",
          "/activity",
          "/login",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
