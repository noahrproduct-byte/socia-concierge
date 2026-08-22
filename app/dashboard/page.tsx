import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Users,
  Activity,
  Eye,
  FileText,
  Sparkles,
  TrendingUp,
  Clock,
  Target,
  Zap,
  Flame,
  ArrowRight,
  Link2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { igConfigured } from "@/lib/instagram";
import { getIgSnapshot, type IgMediaItem } from "@/lib/instagramSync";
import type { Kpi } from "@/lib/demoData";
import AppShell from "@/components/AppShell";
import { MetricCard, PlatformBadge } from "@/components/ui";
import PerformanceChart from "@/components/PerformanceChart";
import DateRangeSelector from "@/components/DateRangeSelector";
import AccountSwitcher from "@/components/AccountSwitcher";
import ContentScoreCard from "@/components/ContentScoreCard";
import SyncCinematic from "@/components/SyncCinematic";
import LiveSync from "@/components/LiveSync";
import {
  KPIS,
  AI_BRIEF,
  ACTIONS,
  TOP_CONTENT,
  COMPETITOR_INTEL,
  UPCOMING,
} from "@/lib/demoData";

export const metadata = { title: "Dashboard — SOCIA" };

const KPI_ICON: Record<string, React.ReactNode> = {
  followers: <Users size={16} />,
  engagement: <Activity size={16} />,
  reach: <Eye size={16} />,
  posts: <FileText size={16} />,
};
const INSIGHT_ICON: Record<string, React.ReactNode> = {
  trend: <TrendingUp size={15} />,
  clock: <Clock size={15} />,
  target: <Target size={15} />,
};
const ACTION_ICON: Record<string, React.ReactNode> = {
  impact: <TrendingUp size={17} />,
  opportunity: <Zap size={17} />,
  consistency: <Clock size={17} />,
};
const INTEL_ICON: Record<string, React.ReactNode> = {
  activity: <Activity size={15} />,
  flame: <Flame size={15} />,
  trend: <TrendingUp size={15} />,
};

// ---- real-data helpers (synced Instagram snapshot) ----
function fmtNum(n: number | null | undefined): string {
  if (n == null) return "–";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}
function avg(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function fmtDate(ts?: string): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function formatLabel(t?: string): string {
  if (t === "VIDEO") return "Reel";
  if (t === "CAROUSEL_ALBUM") return "Carousel";
  return "Post";
}

type ContentRow = {
  title: string;
  date: string;
  format: string;
  platform: "ig" | "tt" | "yt";
  aVal: string;
  aLabel: string;
  bVal: string;
  bLabel: string;
  mult: string | null;
};

function buildLiveData(followers: number | null, mediaCount: number | null, media: IgMediaItem[]) {
  const eng = media.map((m) => (m.like_count ?? 0) + (m.comments_count ?? 0));
  const chronological = [...media].reverse(); // API returns newest first
  const engSpark = chronological.map((m) => (m.like_count ?? 0) + (m.comments_count ?? 0));
  const likesSpark = chronological.map((m) => m.like_count ?? 0);
  const dateLabels = chronological.map((m) => fmtDate(m.timestamp));
  const weekMs = 7 * 24 * 3600 * 1000;
  const postsThisWeek = media.filter(
    (m) => m.timestamp && Date.now() - new Date(m.timestamp).getTime() < weekMs,
  ).length;
  const engRate =
    followers && followers > 0 && media.length ? (avg(eng) / followers) * 100 : null;
  const recent = eng.slice(0, 5);
  const prev = eng.slice(5, 10);
  let engChange =
    recent.length && prev.length && avg(prev) > 0
      ? Math.round(((avg(recent) - avg(prev)) / avg(prev)) * 1000) / 10
      : null;
  // A four-digit swing is real math but reads like a bug — hide extremes.
  if (engChange !== null && Math.abs(engChange) > 300) engChange = null;
  const avgLikes = media.length ? Math.round(avg(media.map((m) => m.like_count ?? 0))) : null;

  const kpis: Kpi[] = [
    {
      key: "followers",
      label: "Total Followers",
      value: fmtNum(followers),
      change: null,
      up: true,
      compare: "Live from Instagram",
      spark: [],
    },
    {
      key: "engagement",
      label: "Engagement Rate",
      value: engRate != null ? engRate.toFixed(1) + "%" : "–",
      change: engChange,
      up: (engChange ?? 0) >= 0,
      compare: "last 5 vs prev 5 posts",
      spark: engSpark,
      sparkLabels: dateLabels,
    },
    {
      key: "reach",
      label: "Avg Likes / Post",
      value: fmtNum(avgLikes),
      change: null,
      up: true,
      compare: `across ${media.length} recent posts`,
      spark: likesSpark,
      sparkLabels: dateLabels,
    },
    {
      key: "posts",
      label: "Posts Published",
      value: String(mediaCount ?? media.length),
      change: null,
      up: true,
      compare: postsThisWeek > 0 ? `+${postsThisWeek} this week` : "on your profile",
      spark: engSpark,
      sparkLabels: dateLabels,
      variant: "bar",
    },
  ];

  const avgEng = avg(eng);
  const topRows: ContentRow[] = [...media]
    .sort(
      (x, y) =>
        (y.like_count ?? 0) + (y.comments_count ?? 0) - ((x.like_count ?? 0) + (x.comments_count ?? 0)),
    )
    .slice(0, 4)
    .map((m) => {
      const e = (m.like_count ?? 0) + (m.comments_count ?? 0);
      const mult = avgEng > 0 ? e / avgEng : null;
      const firstLine = (m.caption || "").split("\n")[0].trim();
      return {
        title: firstLine ? firstLine.slice(0, 46) : "(no caption)",
        date: fmtDate(m.timestamp),
        format: formatLabel(m.media_type),
        platform: "ig" as const,
        aVal: fmtNum(m.like_count ?? 0),
        aLabel: "Likes",
        bVal: fmtNum(m.comments_count ?? 0),
        bLabel: "Com.",
        mult: mult ? mult.toFixed(1) + "×" : null,
      };
    });

  return { kpis, topRows };
}

// Derive an honest strategy brief from the synced media. Returns null when
// there isn't enough signal, in which case the demo copy is shown instead.
function buildLiveBrief(media: IgMediaItem[]) {
  if (media.length < 6) return null;
  const engOf = (m: IgMediaItem) => (m.like_count ?? 0) + (m.comments_count ?? 0);
  const all = media.map(engOf);
  const overall = avg(all);
  if (!overall) return null;

  const reels = media.filter((m) => m.media_type === "VIDEO");
  const reelMult = reels.length >= 3 ? avg(reels.map(engOf)) / overall : null;
  const topMult = Math.max(...all) / overall;

  // Strongest weekday + hour bucket by average engagement.
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const byDay = new Map<number, number[]>();
  const byHour = new Map<number, number[]>();
  for (const m of media) {
    if (!m.timestamp) continue;
    const d = new Date(m.timestamp);
    byDay.set(d.getDay(), [...(byDay.get(d.getDay()) ?? []), engOf(m)]);
    byHour.set(d.getHours(), [...(byHour.get(d.getHours()) ?? []), engOf(m)]);
  }
  const best = <K,>(m: Map<K, number[]>): K | null => {
    let k: K | null = null;
    let v = -1;
    for (const [key, xs] of m) {
      const a = avg(xs);
      if (a > v) {
        v = a;
        k = key;
      }
    }
    return k;
  };
  const bestDay = best(byDay);
  const bestHour = best(byHour);
  const hourLabel =
    bestHour == null
      ? null
      : bestHour === 0
        ? "12 AM"
        : bestHour < 12
          ? `${bestHour} AM`
          : bestHour === 12
            ? "12 PM"
            : `${bestHour - 12} PM`;

  const windowText =
    bestDay != null && hourLabel
      ? `Your audience responds best on ${days[bestDay]}s around ${hourLabel}.`
      : "Post more inside your strongest engagement windows.";

  const head =
    reelMult && reelMult >= 1.2
      ? {
          lead: "Your Reels are",
          highlight: "outperforming your average",
          tail: `by ${Math.round((reelMult - 1) * 100)}% right now.`,
        }
      : {
          lead: "Your top content is",
          highlight: `${topMult.toFixed(1)}× above your average`,
          tail: "this month.",
        };

  return {
    ...head,
    body:
      bestDay != null && hourLabel
        ? `Your strongest window is ${days[bestDay]} around ${hourLabel}. Posting more consistently inside it could increase reach.`
        : "Posting more consistently between your strongest engagement windows could increase reach.",
    insights: [
      {
        icon: "trend",
        text:
          reelMult && reelMult >= 1.1
            ? `Reels drive ${reelMult.toFixed(1)}× more engagement than your average post.`
            : `Your top post earned ${topMult.toFixed(1)}× your average engagement.`,
      },
      { icon: "clock", text: windowText },
      {
        icon: "target",
        text: `Computed from your last ${media.length} posts, synced from Instagram.`,
      },
    ],
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ ig?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { ig } = await searchParams;
  const justConnected = ig === "connected";

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const raw = (user.email?.split("@")[0] ?? "there").replace(/[._-]+/g, " ");
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);

  const profile = await getProfile(supabase, user.id);
  const connected = profile?.account_connected ?? false;

  // No social account connected yet → show a real connect/empty state,
  // not fabricated analytics.
  if (!connected) {
    const igHref = igConfigured() ? "/api/auth/instagram/start" : "/settings";
    return (
      <AppShell active="dashboard" userEmail={user.email}>
        <div className="dash-header">
          <div>
            <h1 className="dash-greeting">
              {greeting}, {name} <span aria-hidden>👋</span>
            </h1>
            <p className="dash-context">Let&apos;s get your account set up.</p>
          </div>
        </div>

        {/* tinted connect banner */}
        <div className="db-connect">
          <span className="db-connect-ico"><Link2 size={22} /></span>
          <div className="db-connect-copy">
            <h2>Connect your Instagram account</h2>
            <p>See how your community grows, what content performs best, and how you compare to your competitors.</p>
          </div>
          <Link href={igHref} className="db-connect-cta">Connect Instagram</Link>
        </div>

        {/* what you get, illustrated */}
        <div className="db-feats">
          <section className="db-feat">
            <h3>Know your audience</h3>
            <p>Track your follower growth and discover who actually watches you.</p>
            <div className="mockp">
              <div className="mockp-head"><span className="side-mark sm">S</span> Audience · top segments</div>
              <div className="mock-row"><span>18 to 24</span><span className="mock-bar"><i style={{ width: "34%" }} /></span><b>34%</b></div>
              <div className="mock-row"><span>25 to 34</span><span className="mock-bar"><i style={{ width: "42%" }} /></span><b>42%</b></div>
              <div className="mock-row"><span>35 to 44</span><span className="mock-bar"><i style={{ width: "18%" }} /></span><b>18%</b></div>
              <span className="mock-chip left"><small>Followers</small><b>12.4K</b><em>+234 this month</em></span>
            </div>
          </section>

          <section className="db-feat">
            <h3>See every format&apos;s numbers</h3>
            <p>Reach, views, and engagement for posts, reels, and stories in detail.</p>
            <div className="mockp donuts">
              <div className="mockp-head"><span className="side-mark sm">S</span> Engagement · by format</div>
              <div className="mock-donut-row">
                <span className="mock-donut" style={{ ["--v" as string]: "42%" }}><b>4.2%</b><small>Posts</small></span>
                <span className="mock-donut hot" style={{ ["--v" as string]: "68%" }}><b>6.8%</b><small>Reels</small></span>
                <span className="mock-donut warm" style={{ ["--v" as string]: "21%" }}><b>2.1%</b><small>Stories</small></span>
              </div>
              <span className="mock-chip right"><small>Top format</small><b>Reels</b><em>84.2K views</em></span>
            </div>
          </section>

          <section className="db-feat">
            <h3>Watch your competitors</h3>
            <p>Add competitor accounts and compare their growth with yours.</p>
            <div className="mockp">
              <div className="mockp-head"><span className="side-mark sm">S</span> Competitors · followers vs you</div>
              <div className="mock-row"><span>@brand_a</span><span className="mock-sub">24.1K followers</span><b className="pos">+24%</b></div>
              <div className="mock-row"><span>@brand_b</span><span className="mock-sub">18.7K followers</span><b className="pos">+12%</b></div>
              <div className="mock-row"><span>@brand_c</span><span className="mock-sub">9.4K followers</span><b className="neg">-5%</b></div>
              <span className="mock-chip left"><small>Avg gap</small><b>+3.2%</b><em>vs competitors</em></span>
            </div>
          </section>
        </div>

        {profile?.niche && (
          <div className="panel-grid">
            <Link href="/niche" className="hub-card">
              <span className="hub-glyph">🔥</span>
              <h3>What&apos;s working in {profile.niche}</h3>
              <p>See the videos and formats performing best in your niche right now.</p>
              <span className="hub-link">Explore your niche →</span>
            </Link>
          </div>
        )}
      </AppShell>
    );
  }

  // Live synced Instagram data (auto-refreshes when stale). Falls back to the
  // demo dataset when nothing has synced yet.
  const snap = await getIgSnapshot(supabase, user.id);
  const media = snap?.media ?? [];
  const live = Boolean(snap && snap.followers_count != null);
  const { kpis, topRows } = live
    ? buildLiveData(snap!.followers_count, snap!.media_count, media)
    : {
        kpis: KPIS,
        topRows: TOP_CONTENT.map((c) => ({
          title: c.title,
          date: c.date,
          format: c.format,
          platform: c.platform,
          aVal: c.reach,
          aLabel: "Reach",
          bVal: c.eng,
          bLabel: "Eng.",
          mult: String(c.mult),
        })) as ContentRow[],
      };
  const brief = (live ? buildLiveBrief(media) : null) ?? AI_BRIEF;

  return (
    <AppShell active="dashboard" userEmail={user.email}>
      {justConnected && (
        <SyncCinematic username={snap?.username} followers={snap?.followers_count} />
      )}
      {/* Header */}
      <div className="dash-header db2-rise">
        <div>
          <h1 className="dash-greeting">
            {greeting}, {name} <span aria-hidden>👋</span>
          </h1>
          <p className="dash-context">
            {live
              ? <>Live data for <b>@{snap!.username}</b>, synced from Instagram.</>
              : <>Here&apos;s what&apos;s happening with your content.</>}
          </p>
        </div>
        <div className="dash-controls">
          {live && <LiveSync syncedAt={snap!.last_synced_at} />}
          <DateRangeSelector />
          <AccountSwitcher />
          <Link href="/chat" className="btn-primary db2-ask">
            <Sparkles size={15} /> Ask AI Strategist
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-row">
        {kpis.map((k, i) => (
          <MetricCard key={k.key} kpi={k} icon={KPI_ICON[k.key]} index={i} />
        ))}
      </div>

      {/* Content Score (brand signature) */}
      <ContentScoreCard />

      {/* AI Strategy Brief + Recommended Actions */}
      <div className="dash-2col brief">
        <section className="card ai-brief db2-rise" style={{ animationDelay: "420ms" }}>
          <div className="db2-orbit" aria-hidden>
            <i className="o1" />
            <i className="o2" />
            <span className="orbits">
              <span className="ob b1"><PlatformBadge platform="ig" /></span>
              <span className="ob b2"><PlatformBadge platform="yt" /></span>
              <span className="ob b3"><PlatformBadge platform="tt" /></span>
            </span>
          </div>
          <div className="ai-brief-badge">
            <Sparkles size={14} /> AI Strategy Brief
          </div>
          <h2 className="ai-brief-head">
            {brief.lead} <span className="accent-text">{brief.highlight}</span> {brief.tail}
          </h2>
          <p className="ai-brief-body">{brief.body}</p>
          <div className="ai-brief-insights">
            {brief.insights.map((ins, i) => (
              <div className="ai-insight" key={i}>
                <span className="ai-insight-ico">{INSIGHT_ICON[ins.icon]}</span>
                <span>{ins.text}</span>
              </div>
            ))}
          </div>
          <div className="ai-brief-actions">
            <Link href="/chat" className="btn-primary db2-ask">
              <Sparkles size={15} /> Ask AI Strategist
            </Link>
            <Link href="/analytics" className="btn-secondary db2-more">
              View full strategy <ArrowRight size={14} />
            </Link>
          </div>
        </section>

        <section className="card db2-rise" style={{ animationDelay: "500ms" }}>
          <div className="card-head">
            <h3>Recommended Actions</h3>
            <Link href="/analytics" className="link-mini">
              View all
            </Link>
          </div>
          <div className="actions">
            {ACTIONS.map((a, i) => (
              <div className="action" key={i}>
                <span className={`action-ico ${a.tone}`}>{ACTION_ICON[a.tone]}</span>
                <div className="action-body">
                  <span className={`action-tag ${a.tone}`}>{a.tag}</span>
                  <b>{a.title}</b>
                  <small>{a.body}</small>
                </div>
                <Link href={a.href} className="action-cta" aria-label={a.cta}>
                  <ArrowRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Performance + Top Content */}
      <div className="dash-2col perf-row">
        <section className="card">
          <div className="card-head">
            <h3>Performance Over Time</h3>
          </div>
          <PerformanceChart />
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Top Performing Content</h3>
            <Link href="/analytics" className="link-mini">
              View all
            </Link>
          </div>
          <div className="content-list">
            {topRows.length === 0 && (
              <p className="page-sub">No posts synced yet — they&apos;ll appear after your next post.</p>
            )}
            {topRows.map((c, i) => (
              <div className="content-row" key={i}>
                <span className="content-thumb" aria-hidden>
                  {i + 1}
                </span>
                <div className="content-meta">
                  <b>{c.title}</b>
                  <small>
                    {c.date} · {c.format} <PlatformBadge platform={c.platform} />
                  </small>
                </div>
                <div className="content-stats">
                  <span>
                    <b>{c.aVal}</b>
                    <small>{c.aLabel}</small>
                  </span>
                  <span>
                    <b>{c.bVal}</b>
                    <small>{c.bLabel}</small>
                  </span>
                  {c.mult && <span className="content-mult">▲ {c.mult}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Competitor Intelligence + Upcoming */}
      <div className="dash-2col">
        <section className="card">
          <div className="card-head">
            <h3>Competitor Intelligence</h3>
            <Link href="/competitors" className="link-mini">
              View all
            </Link>
          </div>
          <div className="intel-list">
            {COMPETITOR_INTEL.map((it, i) => (
              <div className="intel-row" key={i}>
                <span className="intel-ico">{INTEL_ICON[it.icon]}</span>
                <span>{it.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Upcoming Content</h3>
            <Link href="/calendar" className="link-mini">
              View calendar
            </Link>
          </div>
          <div className="upcoming-list">
            {UPCOMING.map((u, i) => (
              <div className="upcoming-row" key={i}>
                <PlatformBadge platform={u.platform} />
                <div className="upcoming-meta">
                  <b>{u.title}</b>
                  <small>
                    {u.date} · {u.time}
                  </small>
                </div>
                <span className="upcoming-status">{u.status}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
