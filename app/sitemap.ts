import type { MetadataRoute } from "next";

const SITE_URL = "https://sociaos.com";

// Served at /sitemap.xml: only the pages a logged-out visitor can open.
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/login", "/signup", "/privacy", "/terms", "/data-deletion"].map((path) => ({
    url: `${SITE_URL}${path}`,
  }));
}
