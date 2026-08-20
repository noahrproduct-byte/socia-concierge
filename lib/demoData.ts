// Demo dashboard data. This is the single source the dashboard reads from —
// when the Instagram/TikTok APIs are connected, replace these values with the
// real fetched metrics and the UI stays identical.

export type Kpi = {
  key: string;
  label: string;
  value: string;
  change: number | null; // percent (null = no history yet)
  up: boolean;
  compare: string;
  spark: number[];
  variant?: "line" | "bar";
};

export const KPIS: Kpi[] = [
  {
    key: "followers",
    label: "Total Followers",
    value: "24.8K",
    change: 12.4,
    up: true,
    compare: "vs. prev. 7 days",
    spark: [40, 42, 41, 45, 48, 47, 52, 55, 58, 62, 66, 71],
  },
  {
    key: "engagement",
    label: "Engagement Rate",
    value: "6.7%",
    change: 18.6,
    up: true,
    compare: "vs. prev. 7 days",
    spark: [30, 34, 32, 38, 40, 44, 42, 50, 54, 58, 63, 69],
  },
  {
    key: "reach",
    label: "Reach / Impressions",
    value: "178.4K",
    change: 9.3,
    up: true,
    compare: "vs. prev. 7 days",
    spark: [50, 48, 53, 55, 52, 60, 63, 61, 66, 70, 68, 74],
  },
  {
    key: "posts",
    label: "Posts Published",
    value: "18",
    change: 5.9,
    up: true,
    compare: "vs. prev. 7 days",
    spark: [3, 5, 2, 6, 4, 7, 3, 6, 5, 8, 4, 7],
    variant: "bar",
  },
];

export const AI_BRIEF = {
  lead: "Your short-form educational content is",
  highlight: "outperforming your average",
  tail: "this week.",
  body: "Posting more consistently between your strongest engagement windows could increase reach.",
  insights: [
    { icon: "trend", text: "Educational Reels drove 2.4× more engagement than your average." },
    { icon: "clock", text: "Your audience is most active Tue–Thu between 6PM–9PM." },
    { icon: "target", text: "You're outperforming 4 of 6 tracked competitors on engagement." },
  ],
};

export type Action = {
  tag: "High Impact" | "Opportunity" | "Consistency";
  tone: "impact" | "opportunity" | "consistency";
  title: string;
  body: string;
  cta: string;
  href: string;
};

export const ACTIONS: Action[] = [
  {
    tag: "High Impact",
    tone: "impact",
    title: "Publish another educational Reel",
    body: "Educational videos generated 2.4× your average engagement.",
    cta: "Create content",
    href: "/tool",
  },
  {
    tag: "Opportunity",
    tone: "opportunity",
    title: "Competitor format gaining traction",
    body: "3 tracked competitors are using a format generating above-average engagement.",
    cta: "View opportunity",
    href: "/competitors",
  },
  {
    tag: "Consistency",
    tone: "consistency",
    title: "You have an open posting window tomorrow",
    body: "Schedule content for your strongest engagement period.",
    cta: "Open calendar",
    href: "/calendar",
  },
];

// Performance-over-time series per metric (28 points).
function series(base: number, drift: number, jitter: number): number[] {
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < 28; i++) {
    v += drift + (Math.sin(i * 1.3) * jitter) / 2 + (i % 5 === 0 ? jitter : 0) * 0.3;
    out.push(Math.max(0, Math.round(v)));
  }
  return out;
}

export const PERF: Record<string, number[]> = {
  Reach: series(90000, 3200, 18000),
  Engagement: series(4200, 90, 700),
  Followers: series(22000, 110, 400),
  Views: series(120000, 4200, 26000),
};

export type Content = {
  title: string;
  platform: "ig" | "tt" | "yt";
  format: string;
  date: string;
  reach: string;
  eng: string;
  mult: string;
};

export const TOP_CONTENT: Content[] = [
  { title: "3 Content Ideas That Always Work", platform: "ig", format: "Reel", date: "May 12", reach: "24.8K", eng: "8.9%", mult: "2.7×" },
  { title: "How I Plan My Content in 30 Min", platform: "tt", format: "Reel", date: "May 9", reach: "18.3K", eng: "7.3%", mult: "2.1×" },
  { title: "Content Strategy Framework", platform: "ig", format: "Carousel", date: "May 6", reach: "15.7K", eng: "6.1%", mult: "1.8×" },
  { title: "Why Consistency Beats Talent", platform: "ig", format: "Reel", date: "May 3", reach: "13.9K", eng: "5.4%", mult: "1.6×" },
];

export const COMPETITOR_INTEL = [
  { icon: "activity", text: "Competitor activity increased 18% this week." },
  { icon: "flame", text: "2 competitor posts are significantly outperforming their normal baseline." },
  { icon: "trend", text: "Short-form educational content is the top performing format in your niche." },
];

export type Upcoming = {
  title: string;
  platform: "ig" | "tt" | "yt";
  date: string;
  time: string;
  status: string;
};

export const UPCOMING: Upcoming[] = [
  { title: "Content Ideas That Convert", platform: "tt", date: "May 17, 2026", time: "6:30 PM", status: "Scheduled" },
  { title: "Behind the Scenes", platform: "ig", date: "May 18, 2026", time: "7:00 PM", status: "Scheduled" },
  { title: "How I Create Content", platform: "yt", date: "May 19, 2026", time: "10:00 AM", status: "Scheduled" },
];
