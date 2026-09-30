import type { MetadataRoute } from "next";

// Let search engines index the public marketing pages, but never the
// authenticated app or the API. Uses the deployed origin so the sitemap URL is
// absolute.
const SITE = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://sociaos.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/analytics",
          "/competitors",
          "/calendar",
          "/create",
          "/studio",
          "/reports",
          "/settings",
          "/tool",
          "/onboarding",
          "/niche",
          "/plan",
          "/scorer",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
