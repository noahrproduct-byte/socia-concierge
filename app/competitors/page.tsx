import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  Plus,
  Play,
  Quote,
  Image as ImageIcon,
  List,
  Clock,
  CalendarDays,
  Type,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import DateRangeSelector from "@/components/DateRangeSelector";
import AccountSwitcher from "@/components/AccountSwitcher";
import CompetitorsBoard, { type Tracked, type Outlier } from "@/components/CompetitorsBoard";
import { Reveal } from "@/components/AnalyticsCharts";
import RadarChart from "@/components/RadarChart";

export const metadata = { title: "Competitors — SOCIA" };

// ------------------------------------------------------------------
// Preview dataset. Competitor tracking has no live backend yet; this
// page renders an internally consistent niche preview, labeled as such.
// ------------------------------------------------------------------
const TRACKED: Tracked[] = [
  { handle: "@cheese.pull.daily", followers: "89K", eng: "4.7%", momentum: 6, spark: [3, 4, 3, 5, 6, 6, 8] },
  { handle: "@trendy.slice", followers: "112K", eng: "5.1%", momentum: 5, spark: [4, 4, 5, 5, 6, 7, 7] },
  { handle: "@rival.pizza", followers: "48.2K", eng: "3.8%", momentum: 3, spark: [3, 3, 4, 3, 4, 4, 5] },
  { handle: "@nyc.pizza.tour", followers: "320K", eng: "6.2%", momentum: 4, spark: [5, 6, 5, 6, 7, 7, 8] },
  { handle: "@dough.diaries", followers: "27.5K", eng: "2.9%", momentum: 2, spark: [3, 2, 3, 3, 3, 4, 4] },
];

const OUTLIERS: Outlier[] = [
  {
    handle: "@cheese.pull.daily",
    format: "REEL",
    mult: "4.1×",
    why: "Trending audio + a fast 6-cut sequence, all under 8 seconds. Hook is the cheese pull in the very first frame.",
    views: "410K",
    saves: "12K",
    img: "/brand/comp/c1.jpg",
    tone: "amber",
  },
  {
    handle: "@trendy.slice",
    format: "REEL",
    mult: "3.2×",
    why: "First-person POV eating clip. No intro, it opens mid-bite, which kills the scroll.",
    views: "220K",
    saves: "8.4K",
    img: "/brand/comp/c2.jpg",
    tone: "blue",
  },
  {
    handle: "@rival.pizza",
    format: "CAROUSEL",
    mult: "2.8×",
    why: "“5 mistakes people make with pizza.” Slide 1 is a bold claim that forces a swipe.",
    views: "96K",
    saves: "5.1K",
    img: "/brand/comp/c3.jpg",
    tone: "green",
  },
  {
    handle: "@nyc.pizza.tour",
    format: "REEL",
    mult: "2.5×",
    why: "Location tag + “hidden gem” framing drives shares and saves from locals.",
    views: "180K",
    saves: "3.9K",
    img: "/brand/comp/c4.jpg",
    tone: "purple",
  },
];

const TRENDS = [
  {
    Ico: Play,
    label: "POV eating clips",
    note: "Spreading across 4 tracked accounts",
    mult: "2.6×",
    dir: "up" as const,
    status: "Rising",
    spark: [3, 4, 4, 5, 5, 7, 8],
  },
  {
    Ico: Quote,
    label: "“3 mistakes” hooks",
    note: "2.6× median on average",
    mult: "1.9×",
    dir: "up" as const,
    status: "Rising",
    spark: [3, 3, 4, 4, 5, 5, 6],
  },
  {
    Ico: ImageIcon,
    label: "Static menu photos",
    note: "Declining reach niche-wide",
    mult: "0.6×",
    dir: "down" as const,
    status: "Declining",
    spark: [7, 6, 6, 5, 4, 4, 3],
  },
  {
    Ico: List,
    label: "List-style carousels",
    note: "Consistent performance",
    mult: "1.1×",
    dir: "flat" as const,
    status: "Stable",
    spark: [5, 5, 6, 5, 5, 6, 5],
  },
];

const GAPS = [
  {
    Ico: Clock,
    title: "Open strong in the first 0.5s",
    body: "Top accounts open on a face or motion. Your posts open on the logo.",
    impact: "High impact",
    tone: "hi" as const,
    cta: "Turn this into a post",
    href: "/tool",
  },
  {
    Ico: CalendarDays,
    title: "Post 4–5× per week",
    body: "You post 2× per week; top accounts post 4–6×.",
    impact: "Medium impact",
    tone: "med" as const,
    cta: "Plan more content",
    href: "/tool",
  },
  {
    Ico: Type,
    title: "On-screen text in every Reel",
    body: "Top accounts use text in 92% of Reels. You use it in 37%.",
    impact: "Medium impact",
    tone: "med" as const,
    cta: "Get text ideas",
    href: "/chat",
  },
];

const POSITION = {
  pct: 78,
  metrics: [
    { label: "Engagement rate", you: "5.8%", other: "3.9%", otherName: "Niche avg", delta: "↑ 1.9pp", good: true },
    { label: "Avg views / Reel", you: "92K", other: "54K", otherName: "Niche avg", delta: "↑ 38K", good: true },
    { label: "Save rate", you: "2.1%", other: "1.2%", otherName: "Niche avg", delta: "↑ 0.9pp", good: true },
    { label: "Post frequency", you: "2/week", other: "4.3/week", otherName: "Top avg", delta: "↓ 2.3", good: false },
  ],
  radarYou: [86, 74, 52, 80, 84],
  radarTop: [70, 70, 88, 72, 76],
  axes: ["Engagement", "Retention", "Consistency", "Growth", "Quality"],
};

export default async function CompetitorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const raw = (user.email?.split("@")[0] ?? "there").replace(/[._-]+/g, " ");
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);

  const ringCirc = 2 * Math.PI * 34;

  return (
    <AppShell active="competitors" userEmail={user.email}>
      {/* Header */}
      <div className="dash-header db2-rise">
        <div>
          <h1 className="dash-greeting">
            {greeting}, {name} <span aria-hidden>👋</span>
          </h1>
          <p className="dash-context">What&apos;s outperforming in your niche right now, and why.</p>
        </div>
        <div className="dash-controls">
          <span
            className="cp2-preview"
            title="Competitor tracking preview. Live tracking of real accounts arrives with the Growth plan."
          >
            <i /> Preview
          </span>
          <DateRangeSelector />
          <AccountSwitcher />
          <Link href="/chat" className="btn-primary db2-ask">
            <Sparkles size={15} /> Ask AI Strategist
          </Link>
        </div>
      </div>
      <div className="cp2-subbar db2-rise" style={{ animationDelay: "80ms" }}>
        <button className="cp2-add" title="Coming soon: track real competitor accounts" type="button">
          <Plus size={14} /> Add competitor
        </button>
      </div>

      {/* Rail + outliers (interactive) */}
      <div className="db2-rise" style={{ animationDelay: "140ms" }}>
        <div className="cp2-columns">
          <CompetitorsBoard tracked={TRACKED} outliers={OUTLIERS} />

          <div className="cp2-side">
            {/* Trending formats */}
            <Reveal className="chart-card cp2-trends">
              <div className="chart-head">
                <h3>Trending formats</h3>
                <Link href="/niche" className="link-mini">View all</Link>
              </div>
              <ul>
                {TRENDS.map(({ Ico, label, note, mult, dir, status, spark }) => {
                  const W = 84;
                  const H = 22;
                  const mx = Math.max(...spark);
                  const mn = Math.min(...spark);
                  const pts = spark
                    .map((v, i) => `${(i / (spark.length - 1)) * W},${H - 3 - ((v - mn) / (mx - mn || 1)) * (H - 6)}`)
                    .join(" ");
                  return (
                    <li className="cp2-trend" key={label}>
                      <span className={`cp2-trend-ico ${dir}`}><Ico size={14} /></span>
                      <span className="cp2-trend-meta">
                        <b>{label}</b>
                        <small>{note}</small>
                      </span>
                      <span className="cp2-trend-mult">
                        <b>{mult}</b>
                        <small>vs last 7 days</small>
                      </span>
                      <svg viewBox={`0 0 ${W} ${H}`} className="cp2-trend-spark" preserveAspectRatio="none" aria-hidden>
                        <polyline
                          className={`cp2-tline ${dir}`}
                          points={pts}
                          fill="none"
                          strokeWidth="1.6"
                          strokeLinejoin="round"
                          pathLength={100}
                        />
                      </svg>
                      <span className={`cp2-status ${dir}`}>{status}</span>
                    </li>
                  );
                })}
              </ul>
            </Reveal>

            {/* Gaps to close */}
            <Reveal className="chart-card cp2-gaps" delay={90}>
              <div className="chart-head">
                <h3>Gaps to close</h3>
                <span className="head-note">High impact first</span>
              </div>
              <ul>
                {GAPS.map(({ Ico, title, body, impact, tone, cta, href }) => (
                  <li className="cp2-gap" key={title}>
                    <span className="cp2-gap-ico"><Ico size={15} /></span>
                    <span className="cp2-gap-meta">
                      <b>{title}</b>
                      <small>{body}</small>
                      <em className={`cp2-impact ${tone}`}>
                        <i /> {impact}
                      </em>
                    </span>
                    <Link href={href} className="cp2-gap-cta">
                      {cta} <ArrowRight size={12} />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/niche" className="cp2-viewall wide">
                View all opportunities <ArrowRight size={13} />
              </Link>
            </Reveal>
          </div>
        </div>
      </div>

      {/* Competitive position (dark) */}
      <Reveal className="cp2-pos" delay={120}>
        <div className="cp2-pos-head">
          <h3>Competitive position</h3>
          <small>How you rank against 6 similar accounts · preview</small>
        </div>
        <div className="cp2-pos-grid">
          <div className="cp2-pos-ring">
            <div className="cp2-ring">
              <svg viewBox="0 0 84 84" aria-hidden>
                <circle cx="42" cy="42" r="34" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" />
                <circle
                  className="cp2-ring-fill"
                  cx="42"
                  cy="42"
                  r="34"
                  fill="none"
                  stroke="url(#cp2rg)"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={ringCirc}
                  style={{ ["--target" as string]: ringCirc * (1 - POSITION.pct / 100) }}
                  transform="rotate(-90 42 42)"
                />
                <defs>
                  <linearGradient id="cp2rg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#2563ff" />
                    <stop offset="100%" stopColor="#60a5fa" />
                  </linearGradient>
                </defs>
              </svg>
              <b>{POSITION.pct}%</b>
            </div>
            <p>
              You outperform <b>{POSITION.pct}%</b> of similar accounts
            </p>
          </div>

          <div className="cp2-pos-metrics">
            {POSITION.metrics.map((m) => (
              <div className="cp2-pmetric" key={m.label}>
                <small>{m.label}</small>
                <div className="cp2-pmetric-vals">
                  <span className="you"><b>{m.you}</b><em>You</em></span>
                  <span className="other"><b>{m.other}</b><em>{m.otherName}</em></span>
                </div>
                <span className={`cp2-pdelta ${m.good ? "good" : "bad"}`}>{m.delta}</span>
              </div>
            ))}
          </div>

          <div className="cp2-pos-radar">
            <RadarChart values={POSITION.radarYou} compare={POSITION.radarTop} axes={POSITION.axes} size={168} />
            <div className="cp2-pos-legend">
              <span><i className="you" /> You</span>
              <span><i className="cmp" /> Top accounts avg</span>
            </div>
            <Link href="/analytics" className="cp2-pos-cta">
              See full comparison <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </Reveal>
    </AppShell>
  );
}
