import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Users,
  Heart,
  Activity,
  CalendarClock,
  ExternalLink,
  ArrowRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/AppShell";
import LiveSync from "@/components/LiveSync";
import AccountSwitcher from "@/components/AccountSwitcher";
import { MetricCard } from "@/components/ui";
import { FormatBars, Reveal } from "@/components/AnalyticsCharts";
import PerformanceOverTime, {
  type PerfPost,
  type FollowerSnap,
} from "@/components/PerformanceOverTime";
import RadarChart from "@/components/RadarChart";
import { getIgSnapshot, type IgMediaItem } from "@/lib/instagramSync";
import type { Kpi } from "@/lib/demoData";

export const metadata = { title: "Analytics — SOCIA" };

// ---- helpers ----
function fmtNum(n: number | null | undefined): string {
  if (n == null) return "–";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}
function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
const engOf = (m: IgMediaItem) => (m.like_count ?? 0) + (m.comments_count ?? 0);

// Best time to post: the weekday+hour bucket whose posts earn the most engagement.
function bestTime(media: IgMediaItem[]): string | null {
  const buckets = new Map<string, { score: number; label: string }>();
  for (const m of media) {
    if (!m.timestamp) continue;
    const d = new Date(m.timestamp);
    const day = d.toLocaleDateString("en-US", { weekday: "short" });
    const hour = d.getHours();
    const key = `${day}-${hour}`;
    const ampm = hour === 0 ? "12AM" : hour < 12 ? `${hour}AM` : hour === 12 ? "12PM" : `${hour - 12}PM`;
    const cur = buckets.get(key) ?? { score: 0, label: `${day} ${ampm}` };
    cur.score += engOf(m);
    buckets.set(key, cur);
  }
  let best: { score: number; label: string } | null = null;
  for (const b of buckets.values()) if (!best || b.score > best.score) best = b;
  return best?.label ?? null;
}

// Two-hour engagement histogram across the day (12 buckets), for the best-time card.
function hourHistogram(media: IgMediaItem[]): { values: number[]; hot: number } {
  const values = Array(12).fill(0);
  for (const m of media) {
    if (!m.timestamp) continue;
    values[Math.floor(new Date(m.timestamp).getHours() / 2)] += engOf(m);
  }
  let hot = 0;
  values.forEach((v, i) => {
    if (v > values[hot]) hot = i;
  });
  return { values, hot };
}

// Real per-format engagement rates (% of followers), only for formats present.
function formatRates(media: IgMediaItem[], followers: number) {
  const groups: [string, (m: IgMediaItem) => boolean][] = [
    ["Reels", (m) => m.media_type === "VIDEO"],
    ["Carousels", (m) => m.media_type === "CAROUSEL_ALBUM"],
    ["Static", (m) => m.media_type === "IMAGE"],
  ];
  return groups
    .map(([label, test]) => {
      const xs = media.filter(test);
      return {
        label,
        value: xs.length ? Math.round((avg(xs.map(engOf)) / followers) * 1000) / 10 : 0,
        note: `${xs.length} post${xs.length === 1 ? "" : "s"}`,
        count: xs.length,
      };
    })
    .filter((g) => g.count > 0)
    .sort((a, b) => b.value - a.value);
}

const clamp = (v: number) => Math.max(8, Math.min(100, Math.round(v)));

// ---- demo data (shown only before an account is connected) ----
const DEMO_FORMATS = [
  { label: "Reels", value: 7.2 },
  { label: "Carousels", value: 5.1 },
  { label: "Stories", value: 3.9 },
  { label: "Static", value: 2.8 },
];
const DEMO_POSTS = [
  { title: "Owner tossing dough (Reel)", sub: "610 saves", metric: "22.4k views", up: true },
  { title: "Cheese pull close-up (Reel)", sub: "420 saves", metric: "14.1k views", up: true },
  { title: "Behind the scenes: new oven", sub: "180 saves", metric: "9.8k views", up: true },
  { title: "Menu update (Carousel)", sub: "12 saves", metric: "0.8k views", up: false },
];
const DEMO_RADAR = [72, 84, 66, 78, 90];

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const raw = (user.email?.split("@")[0] ?? "there").replace(/[._-]+/g, " ");
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);

  const snap = await getIgSnapshot(supabase, user.id);
  const live = Boolean(snap && snap.followers_count != null);
  const media = snap?.media ?? [];
  const followers = snap?.followers_count ?? 0;
  const eng = media.map(engOf);
  const overallAvg = avg(eng);

  // --- KPI cards ---
  const engRateNum =
    live && followers > 0 && media.length ? (overallAvg / followers) * 100 : null;
  const avgLikes = media.length ? Math.round(avg(media.map((m) => m.like_count ?? 0))) : null;
  const best = live ? bestTime(media) : null;
  const chronological = [...media].reverse();
  const dateLabels = chronological.map((m) =>
    m.timestamp ? new Date(m.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "",
  );
  const recent = eng.slice(0, 5);
  const prev = eng.slice(5, 10);
  let engChange =
    recent.length && prev.length && avg(prev) > 0
      ? Math.round(((avg(recent) - avg(prev)) / avg(prev)) * 1000) / 10
      : null;
  if (engChange !== null && Math.abs(engChange) > 300) engChange = null;

  const kpis: Kpi[] = live
    ? [
        {
          key: "followers",
          label: "Followers",
          value: followers.toLocaleString("en-US"),
          change: null,
          up: true,
          compare: "Live from Instagram",
          spark: [],
        },
        {
          key: "reach",
          label: "Avg likes / post",
          value: fmtNum(avgLikes),
          change: null,
          up: true,
          compare: `across ${media.length} posts`,
          spark: chronological.map((m) => m.like_count ?? 0),
          sparkLabels: dateLabels,
        },
        {
          key: "engagement",
          label: "Engagement rate",
          value: engRateNum != null ? engRateNum.toFixed(1) + "%" : "–",
          change: engChange,
          up: (engChange ?? 0) >= 0,
          compare: "per post, of followers",
          spark: chronological.map(engOf),
          sparkLabels: dateLabels,
        },
      ]
    : [
        { key: "followers", label: "Followers", value: "12,480", change: 3.2, up: true, compare: "demo data", spark: [] },
        { key: "reach", label: "Reach / week", value: "1.24M", change: 34, up: true, compare: "demo data", spark: [] },
        { key: "engagement", label: "Engagement rate", value: "5.8%", change: 0.6, up: true, compare: "demo data", spark: [] },
      ];

  // --- performance-over-time module: real posts + real follower snapshots ---
  const perfPosts: PerfPost[] = media
    .filter((m) => m.timestamp)
    .map((m) => ({
      t: m.timestamp!,
      likes: m.like_count ?? 0,
      comments: m.comments_count ?? 0,
      type: m.media_type ?? "IMAGE",
      caption: m.caption ?? "",
      thumb: m.thumbnail_url || m.media_url || null,
      permalink: m.permalink ?? null,
    }));
  let snapsHist: FollowerSnap[] = [];
  try {
    const { data } = await supabase
      .from("account_snapshots")
      .select("day, followers")
      .eq("user_id", user.id)
      .order("day", { ascending: true })
      .limit(400);
    snapsHist = ((data ?? []) as { day: string; followers: number | null }[])
      .filter((r): r is FollowerSnap => r.followers != null);
  } catch {
    // snapshots table may not exist yet — follower history shows its empty state
  }

  // --- formats ---
  const formats = live && followers > 0 ? formatRates(media, followers) : DEMO_FORMATS;

  // --- top posts ---
  const livePosts = [...media]
    .sort((a, b) => engOf(b) - engOf(a))
    .slice(0, 4)
    .map((m) => {
      const firstLine = (m.caption || "").split("\n")[0].trim();
      return {
        title: firstLine ? firstLine.slice(0, 52) : "(no caption)",
        sub: `${fmtNum(m.comments_count ?? 0)} comments`,
        metric: `${fmtNum(m.like_count ?? 0)} likes`,
        up: engOf(m) >= overallAvg,
        thumb: m.thumbnail_url || m.media_url || null,
        href: m.permalink || null,
      };
    });
  const posts = live && livePosts.length
    ? livePosts
    : DEMO_POSTS.map((p) => ({ ...p, thumb: null, href: null }));

  // --- baseline comparison (live: your recent 5 posts vs your average) ---
  const recentLikes = media.slice(0, 5).map((m) => m.like_count ?? 0);
  const recentComments = media.slice(0, 5).map((m) => m.comments_count ?? 0);
  const allLikes = media.map((m) => m.like_count ?? 0);
  const allComments = media.map((m) => m.comments_count ?? 0);
  const bench = live
    ? [
        {
          label: "Engagement rate",
          a: followers > 0 ? Math.round((avg(recent) / followers) * 1000) / 10 : 0,
          b: followers > 0 ? Math.round((overallAvg / followers) * 1000) / 10 : 0,
          unit: "%",
        },
        {
          label: "Likes / post",
          a: Math.round(avg(recentLikes)),
          b: Math.round(avg(allLikes)),
          unit: "",
        },
        {
          label: "Comments / post",
          a: Math.round(avg(recentComments) * 10) / 10,
          b: Math.round(avg(allComments) * 10) / 10,
          unit: "",
        },
      ]
    : [
        { label: "Engagement rate", a: 5.8, b: 3.9, unit: "%" },
        { label: "Save rate", a: 2.1, b: 1.2, unit: "%" },
        { label: "Follows / post", a: 34, b: 21, unit: "" },
      ];
  const benchNames: [string, string] = live ? ["last 5", "your avg"] : ["you", "niche"];

  // --- insight card (live: honest, derived from the account's own posts) ---
  const reels = media.filter((m) => m.media_type === "VIDEO");
  const reelMult = reels.length >= 3 && overallAvg > 0 ? avg(reels.map(engOf)) / overallAvg : null;
  const topMult = overallAvg > 0 && eng.length ? Math.max(...eng) / overallAvg : null;
  const spanDays =
    media.length >= 2 && media[media.length - 1].timestamp && media[0].timestamp
      ? Math.max(
          7,
          (new Date(media[0].timestamp!).getTime() -
            new Date(media[media.length - 1].timestamp!).getTime()) /
            86400000,
        )
      : null;
  const postsPerWeek = spanDays ? (media.length / spanDays) * 7 : null;
  const momentum = recent.length && prev.length && avg(prev) > 0 ? avg(recent) / avg(prev) : null;
  const commentShare = overallAvg > 0 ? avg(allComments) / overallAvg : null;

  const radar = live
    ? [
        clamp(((engRateNum ?? 0) / 5) * 100),
        clamp(((postsPerWeek ?? 0) / 5) * 100),
        clamp(((momentum ?? 0) / 2) * 100),
        clamp(((commentShare ?? 0) / 0.12) * 100),
        clamp(((topMult ?? 0) / 6) * 100),
      ]
    : DEMO_RADAR;
  const radarAxes = live
    ? ["Engagement", "Consistency", "Momentum", "Community", "Virality"]
    : ["Engagement", "Retention", "Consistency", "Growth", "Quality"];
  const insightHead = live
    ? reelMult && reelMult >= 1.2
      ? { a: "Reels earn", b: `${reelMult.toFixed(1)}× your average`, c: "engagement" }
      : topMult
        ? { a: "Your top post earned", b: `${topMult.toFixed(1)}× your average`, c: "engagement" }
        : { a: "Your content profile,", b: "computed from real posts", c: "" }
    : { a: "You outperform", b: "78%", c: "of similar accounts" };
  const insightSub = live
    ? `Profile computed from your last ${media.length} posts.`
    : "Demo data. Connect your account for your real profile.";

  return (
    <AppShell active="analytics" userEmail={user.email}>
      {/* Header */}
      <div className="dash-header db2-rise">
        <div>
          <h1 className="dash-greeting">
            {greeting}, {name} <span aria-hidden>👋</span>
          </h1>
          <p className="dash-context">
            {live
              ? <>Live snapshot of <b>@{snap!.username}</b>, synced from Instagram.</>
              : <>Your performance overview. Connect an account for live data.</>}
          </p>
        </div>
        <div className="dash-controls">
          {live && <LiveSync syncedAt={snap!.last_synced_at} />}
          <AccountSwitcher />
          <Link href="/chat" className="btn-primary db2-ask">
            <Sparkles size={15} /> Ask AI Strategist
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="kpi-row">
        {kpis.map((k, i) => (
          <MetricCard
            key={k.key}
            kpi={k}
            icon={k.key === "followers" ? <Users size={16} /> : k.key === "reach" ? <Heart size={16} /> : <Activity size={16} />}
            index={i}
          />
        ))}
        {/* Best time to post, with the real posting-hour histogram */}
        <section className="db2-kpi db2-rise an2-besttime" style={{ animationDelay: "290ms" }}>
          <div className="db2-kpi-top">
            <span className="db2-kpi-ico"><CalendarClock size={16} /></span>
            <span className="db2-kpi-label">Best time to post</span>
          </div>
          <div className="db2-kpi-value an2-besttime-val">{live ? (best ?? "–") : "Tue 7PM"}</div>
          <span className="db2-kpi-compare">
            {live ? "when your posts earn the most" : "demo data"}
          </span>
          {live && media.length > 0 && <HourBars media={media} />}
        </section>
      </div>

      {/* Performance over time — the analytics centerpiece */}
      <PerformanceOverTime
        posts={live ? perfPosts : []}
        followers={live ? followers : null}
        snaps={snapsHist}
      />

      {/* Benchmark/insight + formats */}
      <div className="panel-grid an2-main">
        <section className="chart-card db2-rise" style={{ animationDelay: "430ms" }}>
          <div className="chart-head">
            <h3>{live ? "Recent posts vs your baseline" : "Benchmarked vs your niche"}</h3>
          </div>
          <div className="an2-bench-grid">
            <Reveal className="bench an2-bench">
              {bench.map((b) => {
                const max = Math.max(b.a, b.b) || 1;
                return (
                  <div className="bench-row" key={b.label}>
                    <div className="bench-label">{b.label}</div>
                    <div className="bench-bars">
                      <span className="bench-track">
                        <span className="bench-fill you" style={{ ["--w" as string]: `${(b.a / max) * 100}%` }} />
                      </span>
                      <span className="bench-num">
                        {b.a}{b.unit} <em>{benchNames[0]}</em>
                      </span>
                    </div>
                    <div className="bench-bars">
                      <span className="bench-track">
                        <span className="bench-fill niche" style={{ ["--w" as string]: `${(b.b / max) * 100}%` }} />
                      </span>
                      <span className="bench-num muted">
                        {b.b}{b.unit} <em>{benchNames[1]}</em>
                      </span>
                    </div>
                  </div>
                );
              })}
            </Reveal>

            <Reveal className="an2-insight" delay={120}>
              <h4>
                {insightHead.a} <b>{insightHead.b}</b> {insightHead.c}
              </h4>
              <RadarChart values={radar} axes={radarAxes} />
              <p className="an2-insight-sub">{insightSub}</p>
              <Link href="/competitors" className="an2-insight-cta">
                See how you compare <ArrowRight size={13} />
              </Link>
            </Reveal>
          </div>
        </section>

        <section className="chart-card db2-rise" style={{ animationDelay: "500ms" }}>
          <div className="chart-head">
            <h3>Engagement by format</h3>
          </div>
          <FormatBars items={formats} />
          <p className="an2-formats-note">
            {live ? "Avg engagement per post, as % of followers." : "Demo data."}
          </p>
        </section>
      </div>

      {/* Top posts */}
      <div className="an2-bottom">
        <section className="chart-card db2-rise" style={{ animationDelay: "560ms" }}>
          <div className="chart-head">
            <h3>Top performing posts</h3>
            {live && snap?.username && (
              <a
                className="link-mini"
                href={`https://instagram.com/${snap.username}`}
                target="_blank"
                rel="noreferrer"
              >
                View profile
              </a>
            )}
          </div>
          <ul className="an2-posts">
            {posts.map((p, i) => (
              <li className="an2-post" key={i}>
                <span className="an2-post-rank">{i + 1}</span>
                {p.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="an2-post-thumb" src={p.thumb} alt="" loading="lazy" width={44} height={44} />
                ) : (
                  <span className="an2-post-thumb ph" aria-hidden />
                )}
                <span className="an2-post-meta">
                  <b>{p.title}</b>
                  <small>{p.sub}</small>
                </span>
                <span className={`an2-post-metric ${p.up ? "up" : "down"}`}>
                  {p.up ? "▲" : "▼"} {p.metric}
                </span>
                {p.href && (
                  <a
                    className="an2-post-open"
                    href={p.href}
                    target="_blank"
                    rel="noreferrer"
                    title="Open on Instagram"
                    aria-label="Open on Instagram"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>

      </div>
    </AppShell>
  );
}

// ---- server-rendered pieces ----

// Real posting-hour histogram (12 two-hour buckets) for the best-time card.
function HourBars({ media }: { media: IgMediaItem[] }) {
  const { values, hot } = hourHistogram(media);
  const max = Math.max(...values) || 1;
  return (
    <div className="an2-hours">
      <div className="an2-hours-bars" aria-hidden>
        {values.map((v, i) => (
          <i
            key={i}
            className={i === hot ? "hot" : ""}
            style={{ height: `${Math.max(10, (v / max) * 100)}%` }}
            title={`${i * 2}:00 – ${i * 2 + 2}:00`}
          />
        ))}
      </div>
      <div className="an2-hours-axis" aria-hidden>
        <span>12AM</span><span>6AM</span><span>12PM</span><span>6PM</span><span>12AM</span>
      </div>
    </div>
  );
}
