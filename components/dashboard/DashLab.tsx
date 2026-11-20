"use client";

// The Dashboard on made-up numbers, for looking at its layout without an
// account. Development only (app/dev/dash-lab). Nothing here is real data.
import Dashboard, { type DashboardData } from "./Dashboard";
import type { PostCard, Series, SeriesPoint } from "@/lib/overview";

const DAY = 86400000;
const now = Date.now();
const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();
const post = (id: string, daysAgo: number, views: number, eng: number, caption: string): PostCard => ({
  id, title: caption.slice(0, 48), caption, published: iso(daysAgo), format: "Reel", platform: "instagram", isVideo: true,
  views, reach: Math.round(views * 0.8), likes: Math.round(eng * 0.7), comments: Math.round(eng * 0.1), saves: Math.round(eng * 0.1), shares: Math.round(eng * 0.1),
  engagements: eng, multiplier: eng / 400, thumb: null, permalink: null,
});
const posts: PostCard[] = [
  post("p1", 0.5, 4200, 380, "Three things I check before I post"),
  post("p2", 2, 48200, 2900, "I bought a warehouse. Comment WAREHOUSE for the breakdown"),
  post("p3", 3, 2100, 120, "Monday reset"),
  post("p4", 5, 9100, 610, "What would you do with 500 dollars?"),
  post("p5", 6, 6400, 400, "Behind the edit"),
  post("p6", 9, 5200, 410, "Old one"), post("p7", 12, 4800, 390, "Older one"), post("p8", 15, 5100, 420, "Oldest one"),
];
const points = (f: (i: number) => number): SeriesPoint[] => Array.from({ length: 30 }, (_, i) => ({ day: iso(29 - i).slice(0, 10), value: Math.round(f(i)), postIds: [] }));
const series = (metric: Series["metric"], label: string, f: (i: number) => number): Series => {
  const current = points(f);
  return { metric, label, provenance: "instagram_daily", note: "Made-up numbers for the lab.", current, previous: [], total: current.reduce((n, p) => n + (p.value ?? 0), 0), prevTotal: null };
};
const kpi = (id: string, label: string, value: string, raw: number, deltaText: string, positive: boolean) => ({ id, label, value, raw, deltaPct: null, deltaText, positive, note: "", status: "ok", source: "lab" });

const d = {
  rangeLabel: "Last 30 days", live: true, handle: "socia.appmedia", justConnected: false, connectHref: "/settings#accounts",
  kpis: [kpi("views", "Views", "84.2K", 84200, "+18% vs. previous", true), kpi("reach", "Reach", "61.0K", 61000, "+9% vs. previous", true), kpi("engagement_rate", "Engagement rate", "6.1%", 6.1, "-0.4 pts", false), kpi("followers", "Followers", "3,412", 3412, "+212", true)],
  series: {
    views: series("views", "Views", (i) => 1800 + 900 * Math.sin(i / 3) + (i === 27 ? 30000 : 0)),
    engagement: series("engagement", "Engagement", (i) => 160 + 60 * Math.cos(i / 4)),
    followers: series("followers", "Followers", (i) => 3200 + i * 7),
  },
  summaries: [{ platform: "instagram", connected: true, label: "Instagram", audience: 3412, audienceLabel: "followers", views: 84200, viewsNote: null, engagement: 5230, contentPublished: 8 }],
  insights: [], top: [...posts].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)), posts, baseline: 400, medianViews: 5150,
  focus: null, upcoming: [], goals: [], trackers: [], timed: [], today: { locked: { planName: "Growth", href: "/pricing" } }, repurpose: [],
  firstName: "Umar", lastPost: { platform: "Instagram", at: iso(0.5) }, competitors: { tracked: 0, rows: [], you: { engagement: null, followers: 3412 } }, calendar: [], planWeek: null, tasks: [],
  intel: {
    briefing: { lines: [], missing: [] }, works: [], angles: [], nicheToTry: [], nicheRead: null, nicheOn: false, themes: [], postsRead: 8,
    actions: [
      { title: "Make a second warehouse video", reason: "It got 9 times your usual views.", evidence: null, learning: null, href: "/create", from: "finding" },
      { title: "End every video with one ask", reason: "Posts with an ask got more comments.", evidence: null, learning: null, href: "/plan", from: "finding" },
      { title: "Post on Tuesday and Thursday evenings", reason: "Your best two posts went out then.", evidence: null, learning: null, href: "/plan/calendar", from: "finding" },
    ],
    goals: [], goalsReady: true, learning: [], storeReady: true,
  },
} as unknown as DashboardData;

export default function DashLab() {
  return <div className="s-page"><Dashboard d={d} /></div>;
}
