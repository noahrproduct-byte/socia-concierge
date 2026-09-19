import type { MetadataRoute } from "next";

// Served at /robots.txt. Public pages are crawlable; everything behind a
// login (and the auth callback endpoints) is not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api",
        "/auth",
        "/dashboard",
        "/settings",
        "/onboarding",
        "/analytics",
        "/competitors",
        "/calendar",
        "/studio",
        "/reports",
        "/tool",
        "/chat",
        "/niche",
        "/scorer",
        "/plan",
        "/content",
      ],
    },
    sitemap: "https://sociaos.com/sitemap.xml",
  };
}
