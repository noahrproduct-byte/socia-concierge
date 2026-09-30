import type { MetadataRoute } from "next";

// The public, indexable pages. The authenticated app is intentionally absent
// (it is disallowed in robots.ts and needs a session anyway).
const SITE = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://sociaos.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const pages: { path: string; priority: number }[] = [
    { path: "", priority: 1 },
    { path: "/pricing", priority: 0.8 },
    { path: "/login", priority: 0.5 },
    { path: "/signup", priority: 0.6 },
    { path: "/privacy", priority: 0.3 },
    { path: "/terms", priority: 0.3 },
  ];
  return pages.map((p) => ({
    url: `${SITE}${p.path}`,
    changeFrequency: "weekly",
    priority: p.priority,
  }));
}
