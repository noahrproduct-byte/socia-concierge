import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  Play,
  Quote,
  Image as ImageIcon,
  List,
  Clock,
  CalendarDays,
  Type,
  Zap,
  Volume2,
  Bookmark,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import DateRangeSelector from "@/components/DateRangeSelector";
import CompetitorsBoard, {
  ExportButton,
  type Tracked,
  type Outlier,
} from "@/components/CompetitorsBoard";
import { Reveal } from "@/components/AnalyticsCharts";

export const metadata = { title: "Competitors — SOCIA" };

// ------------------------------------------------------------------
// Preview dataset. Competitor tracking has no live backend yet; this
// page renders an internally consistent niche preview, labeled as such.
// ------------------------------------------------------------------
const TRACKED: Tracked[] = [
  { handle: "@cheese.pull.daily", followers: "89K", eng: "4.7%", momentum: 6, spark: [3, 4, 3, 5, 6, 6, 8], avatar: "/brand/comp/a1.jpg" },
  { handle: "@trendy.slice", followers: "112K", eng: "5.1%", momentum: 5, spark: [4, 4, 5, 5, 6, 7, 7], avatar: "/brand/comp/a2.jpg" },
  { handle: "@rival.pizza", followers: "48.2K", eng: "3.8%", momentum: 3, spark: [3, 3, 4, 3, 4, 4, 5], avatar: "/brand/comp/a3.jpg" },
  { handle: "@nyc.pizza.tour", followers: "320K", eng: "6.2%", momentum: 4, spark: [5, 6, 5, 6, 7, 7, 8], avatar: "/brand/comp/a4.jpg" },
  { handle: "@dough.diaries", followers: "27.5K", eng: "2.9%", momentum: 2, spark: [3, 2, 3, 3, 3, 4, 4], avatar: "/brand/comp/a5.jpg" },
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

const STRENGTHS = [
  {
    Ico: Zap,
    tone: "purple",
    title: "Strong short-form hooks",
    body: "Your hooks beat 76% of competitors in the first 1.5s.",
    pct: 76,
  },
  {
    Ico: Volume2,
    tone: "blue",
    title: "Audio trend adoption",
    body: "You use trending audio 32% more often than the niche average.",
    pct: 66,
  },
  {
    Ico: Bookmark,
    tone: "green",
    title: "Saves per view",
    body: "Your save rate is 18% higher than the top 5 accounts.",
    pct: 59,
  },
];

const NICHE = {
  avgEng: 5.2, // % — gauge runs 0–10%
  delta: "▲ 0.8% vs last 7 days",
  views: "2.1M",
  viewsDelta: "▲ 12%",
  saves: "256K",
  savesDelta: "▲ 14%",
};

export default async function CompetitorsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Semicircle gauge geometry: radius 62, half-circumference ≈ 194.8.
  const half = Math.PI * 62;
  const frac = Math.max(0, Math.min(1, NICHE.avgEng / 10));

  return (
    <AppShell active="competitors" userEmail={user.email}>
      <div className="cp3">
        {/* header */}
        <div className="cp3-head db2-rise">
          <div>
            <small className="cp3-eyebrow">Competitor intelligence</small>
            <h1>
              Competitors <Sparkles size={19} className="cp3-spark-ico" />
            </h1>
            <p>Track what&apos;s working for your competitors and find your edge.</p>
          </div>
          <div className="cp3-controls">
            <span
              className="cp2-preview"
              title="Competitor tracking preview. Live tracking of real accounts arrives with the Growth plan."
            >
              <i /> Preview
            </span>
            <DateRangeSelector />
            <ExportButton />
          </div>
        </div>

        <CompetitorsBoard tracked={TRACKED} outliers={OUTLIERS}>
          {/* center intelligence column */}
          <div className="cp3-center">
            <Reveal className="cp3-panel">
              <div className="cp3-card-head">
                <h3>Trending formats</h3>
                <Link href="/niche" className="link-mini">View all</Link>
              </div>
              <ul className="cp3-trends">
                {TRENDS.map(({ Ico, label, note, mult, dir, status, spark }) => {
                  const W = 74;
                  const H = 22;
                  const mx = Math.max(...spark);
                  const mn = Math.min(...spark);
                  const pts = spark
                    .map((v, i) => `${(i / (spark.length - 1)) * W},${H - 3 - ((v - mn) / (mx - mn || 1)) * (H - 6)}`)
                    .join(" ");
                  return (
                    <li className="cp3-trend" key={label}>
                      <span className={`cp3-trend-ico ${dir}`}><Ico size={14} /></span>
                      <span className="cp3-trend-meta">
                        <b>{label}</b>
                        <small>{note}</small>
                      </span>
                      <span className="cp3-trend-mult">
                        <b>{mult}</b>
                        <small>vs last 7 days</small>
                      </span>
                      <svg viewBox={`0 0 ${W} ${H}`} className="cp3-trend-spark" preserveAspectRatio="none" aria-hidden>
                        <polyline
                          className={`cp3-tline ${dir}`}
                          points={pts}
                          fill="none"
                          strokeWidth="1.6"
                          strokeLinejoin="round"
                          pathLength={100}
                        />
                      </svg>
                      <span className={`cp3-status ${dir}`}>{status}</span>
                    </li>
                  );
                })}
              </ul>
            </Reveal>

            <Reveal className="cp3-panel" delay={90}>
              <div className="cp3-card-head">
                <h3>Gaps to close</h3>
                <span className="cp3-filter">High impact first</span>
              </div>
              <ul className="cp3-gaps">
                {GAPS.map(({ Ico, title, body, impact, tone, cta, href }, i) => (
                  <li className="cp3-gap" key={title}>
                    <span className="cp3-gap-num">{String(i + 1).padStart(2, "0")}</span>
                    <span className="cp3-gap-meta">
                      <b><Ico size={13} /> {title}</b>
                      <small>{body}</small>
                      <em className={`cp3-impact ${tone}`}><i /> {impact}</em>
                    </span>
                    <Link href={href} className="cp3-gap-cta">
                      {cta} <ArrowRight size={12} />
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/niche" className="cp3-viewmore">
                View all opportunities <ArrowRight size={13} />
              </Link>
            </Reveal>
          </div>

          {/* right intelligence column */}
          <aside className="cp3-right">
            <Reveal className="cp3-panel" delay={60}>
              <div className="cp3-card-head">
                <h3>Strengths you can leverage</h3>
              </div>
              <ul className="cp3-strengths">
                {STRENGTHS.map(({ Ico, tone, title, body, pct }) => (
                  <li className="cp3-str" key={title}>
                    <span className={`cp3-str-ico ${tone}`}><Ico size={14} /></span>
                    <span className="cp3-str-meta">
                      <b>{title}</b>
                      <small>{body}</small>
                      <span className="cp3-str-bar">
                        <i className={tone} style={{ width: `${pct}%` }} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <Link href="/analytics" className="cp3-viewmore">
                See full benchmark <ArrowRight size={13} />
              </Link>
            </Reveal>

            <Reveal className="cp3-panel cp3-niche" delay={130}>
              <div className="cp3-card-head">
                <h3>Niche performance</h3>
              </div>
              <div className="cp3-gauge">
                <svg viewBox="0 0 148 84" aria-hidden>
                  <path
                    d="M 12 78 A 62 62 0 0 1 136 78"
                    fill="none"
                    stroke="#ede9fe"
                    strokeWidth="11"
                    strokeLinecap="round"
                  />
                  <path
                    className="cp3-gauge-fill"
                    d="M 12 78 A 62 62 0 0 1 136 78"
                    fill="none"
                    stroke="url(#cp3g)"
                    strokeWidth="11"
                    strokeLinecap="round"
                    strokeDasharray={half}
                    style={{ ["--target" as string]: half * (1 - frac) }}
                  />
                  <defs>
                    <linearGradient id="cp3g" x1="0" y1="1" x2="1" y2="0">
                      <stop offset="0%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#4c86ff" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="cp3-gauge-val">
                  <b>{NICHE.avgEng}%</b>
                  <small>Avg. engagement rate</small>
                </div>
                <span className="cp3-gauge-min">0%</span>
                <span className="cp3-gauge-max">10%</span>
              </div>
              <p className="cp3-gauge-delta">{NICHE.delta}</p>
              <div className="cp3-niche-kpis">
                <div className="cp3-nkpi">
                  <b>{NICHE.views}</b>
                  <small>Total views (niche)</small>
                  <em>{NICHE.viewsDelta}</em>
                </div>
                <div className="cp3-nkpi">
                  <b>{NICHE.saves}</b>
                  <small>Total saves (niche)</small>
                  <em>{NICHE.savesDelta}</em>
                </div>
              </div>
              <Link href="/niche" className="cp3-viewmore">
                View niche trends <ArrowRight size={13} />
              </Link>
            </Reveal>
          </aside>
        </CompetitorsBoard>

        {/* smart takeaway */}
        <Reveal className="cp3-takeaway" delay={150}>
          <span className="cp3-take-ico"><Sparkles size={17} /></span>
          <div className="cp3-take-meta">
            <small>Smart takeaway</small>
            <p>
              POV clips and strong first frames are driving the biggest lifts this week. Lean into
              short, in-your-face openers.
            </p>
          </div>
          <Link href="/tool" className="cp3-take-cta">
            <Sparkles size={13} /> See content ideas <ArrowRight size={13} />
          </Link>
        </Reveal>
      </div>
    </AppShell>
  );
}
