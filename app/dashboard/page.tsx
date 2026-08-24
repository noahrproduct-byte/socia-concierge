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
import BestTime from "@/components/BestTime";
import type { TimedPost } from "@/lib/bestTime";
import { getProfile } from "@/lib/profile";
import { igConfigured } from "@/lib/instagram";
import { getIgSnapshot, type IgMediaItem } from "@/lib/instagramSync";
import {
  getFollowers,
  getEngagementRate,
  getAverageLikes,
  getPostsPublished,
  getFollowerGrowth,
  getFollowersGained,
  getTopPosts,
  getBestPostingWindow,
  getLifetimePosts,
  ENGAGEMENT_RATE_FORMULA,
  type AccountInput,
  type DailySnapshot,
} from "@/lib/dashboardMetrics";
import type { Kpi } from "@/lib/demoData";
import AppShell from "@/components/AppShell";
import { MetricCard, PlatformBadge } from "@/components/ui";
import PerformanceChart from "@/components/PerformanceChart";
import DateRangeSelector from "@/components/DateRangeSelector";
import AccountSwitcher from "@/components/AccountSwitcher";
import ContentScoreCard from "@/components/ContentScoreCard";
import { computeContentScore } from "@/lib/contentScore";
import SyncCinematic from "@/components/SyncCinematic";
import LiveSync from "@/components/LiveSync";


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
const engOfPost = (m: IgMediaItem) => (m.like_count ?? 0) + (m.comments_count ?? 0);
function medianOf(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
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
  engagement?: number;
};

function buildLiveData(acct: AccountInput, days: number) {
  const chronological = [...acct.posts].reverse(); // API returns newest first
  const engSpark = chronological.map((m) => (m.like_count ?? 0) + (m.comments_count ?? 0));
  const likesSpark = chronological.map((m) => m.like_count ?? 0);
  const dateLabels = chronological.map((m) => fmtDate(m.timestamp));

  const followers = getFollowers(acct);
  const engRate = getEngagementRate(acct);
  const avgLikes = getAverageLikes(acct);
  const published = getPostsPublished(acct, days);
  const growth = getFollowerGrowth(acct, days);
  const gained = getFollowersGained(acct, days);

  // Follower change: exact snapshots when they exist, otherwise Instagram's
  // real gains series, otherwise nothing at all (never invented).
  const followerNote =
    growth.value != null
      ? `${growth.value >= 0 ? "+" : ""}${growth.value.toLocaleString("en-US")} vs ${days}d ago`
      : gained.value != null
        ? `+${gained.value.toLocaleString("en-US")} new · last ${days}d`
        : "history collecting";

  const kpis: Kpi[] = [
    {
      key: "followers",
      label: "Total Followers",
      value: followers.value != null ? fmtNum(followers.value) : "–",
      change: null,
      up: true,
      compare: followerNote,
      spark: [],
    },
    {
      key: "engagement",
      label: "Engagement Rate",
      value: engRate.value != null ? engRate.value.toFixed(1) + "%" : "–",
      change: null,
      up: true,
      compare: engRate.value != null ? `${ENGAGEMENT_RATE_FORMULA}` : "unavailable",
      spark: engSpark,
      sparkLabels: dateLabels,
    },
    {
      key: "reach",
      label: "Avg Likes / Post",
      value: avgLikes.value != null ? fmtNum(avgLikes.value) : "–",
      change: null,
      up: true,
      compare: avgLikes.period,
      spark: likesSpark,
      sparkLabels: dateLabels,
    },
    {
      key: "posts",
      label: "Posts Published",
      value: String(published.value ?? 0),
      change: null,
      up: true,
      compare: `last ${days} days`,
      spark: engSpark,
      sparkLabels: dateLabels,
      variant: "bar",
    },
  ];

  // Top content — one ranking metric (engagement), one baseline (median).
  const { rows, baseline } = getTopPosts(acct, 4);
  const topRows: ContentRow[] = rows.map(({ post, engagement, multiplier }) => {
    const firstLine = (post.caption || "").split("\n")[0].trim();
    return {
      title: firstLine ? firstLine.slice(0, 46) : "(no caption)",
      date: fmtDate(post.timestamp),
      format: formatLabel(post.media_type),
      platform: "ig" as const,
      aVal: fmtNum(post.like_count ?? 0),
      aLabel: "Likes",
      bVal: fmtNum(post.comments_count ?? 0),
      bLabel: "Com.",
      mult: multiplier && multiplier >= 1.05 ? multiplier.toFixed(1) + "×" : null,
      engagement,
    };
  });

  return { kpis, topRows, baseline, followers, engRate, avgLikes, published, growth, gained };
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

  // Weekday/hour must be bucketed in the viewer's time zone, so the text is
  // completed on the client (see BestTime).

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
    body: "Posting more consistently inside your strongest engagement window could increase reach.",
    insights: [
      {
        icon: "trend",
        text:
          reelMult && reelMult >= 1.1
            ? `Reels drive ${reelMult.toFixed(1)}× more engagement than your average post.`
            : `You average ${Math.round(overall).toLocaleString("en-US")} engagements per post right now.`,
      },
      { icon: "clock", text: "", bestTime: true as const },
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
  searchParams: Promise<{ ig?: string; range?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { ig, range: rangeParam } = await searchParams;
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
  // Date range drives every period metric on the page (?range=7|30|90).
  const rangeDays = rangeParam === "7" ? 7 : rangeParam === "90" ? 90 : 30;

  let dailyRows: DailySnapshot[] = [];
  try {
    const { data } = await supabase
      .from("account_snapshots")
      .select("day, followers, reach, views, followers_gained")
      .eq("user_id", user.id)
      .order("day", { ascending: true })
      .limit(400);
    dailyRows = (data ?? []) as DailySnapshot[];
  } catch {
    // snapshots table may not exist yet — period metrics degrade to unavailable
  }

  const acct: AccountInput = {
    followers: snap?.followers_count ?? null,
    lifetimePosts: snap?.media_count ?? null,
    posts: media,
    daily: dailyRows,
    syncedAt: snap?.last_synced_at ?? null,
    platform: "instagram",
    handle: snap?.username ?? null,
  };
  const built = live ? buildLiveData(acct, rangeDays) : null;
  const kpis = built?.kpis ?? [];
  const topRows = built?.topRows ?? [];
  const lifetime = getLifetimePosts(acct);
  const bestWin = getBestPostingWindow(acct);
  const reachSeries = dailyRows
    .filter((d) => d.reach != null)
    .slice(-rangeDays)
    .map((d) => ({ day: d.day, v: d.reach! }));
  const contentScore = live
    ? computeContentScore(
        media,
        snap!.followers_count,
        dailyRows.filter((d) => d.reach != null).map((d) => d.reach!),
      )
    : null;

  // Recommendations are only emitted when the evidence behind them exists.
  type LiveAction = { tone: "impact" | "opportunity" | "consistency"; tag: string; title: string; body: string; href: string };
  const liveActions: LiveAction[] = [];
  if (built) {
    const base = built.baseline.value;
    const reels = media.filter((m) => m.media_type === "VIDEO");
    const reelMed = reels.length >= 3 ? medianOf(reels.map(engOfPost)) : null;
    if (base && base > 0 && reelMed && reelMed / base >= 1.2) {
      liveActions.push({
        tone: "impact",
        tag: "High impact",
        title: `Reels run ${(reelMed / base).toFixed(1)}× your median`,
        body: `Median engagement across your ${reels.length} Reels vs your ${media.length}-post median. Publish another this week.`,
        href: "/tool",
      });
    }
    const perWeek = built.published.value != null ? (built.published.value / rangeDays) * 7 : null;
    if (perWeek != null && perWeek < 3) {
      liveActions.push({
        tone: "consistency",
        tag: "Consistency",
        title: `You're posting ${perWeek.toFixed(1)}× per week`,
        body: `${built.published.value} post${built.published.value === 1 ? "" : "s"} in the last ${rangeDays} days. More frequent publishing gives SOCIA more signal to work with.`,
        href: "/calendar",
      });
    }
    if (bestWin.value) {
      liveActions.push({
        tone: "opportunity",
        tag: "Opportunity",
        title: bestWin.value.confident
          ? `Post around ${bestWin.value.short}`
          : `Early signal: ${bestWin.value.short}`,
        body: bestWin.value.confident
          ? `Your highest-engagement window across ${bestWin.sampleSize} dated posts.`
          : `Based on limited history (${bestWin.sampleSize} posts) — treat as a hint, not a rule.`,
        href: "/calendar",
      });
    }
  }
  const timedPosts: TimedPost[] = live
    ? media
        .filter((m) => m.timestamp)
        .map((m) => ({ t: m.timestamp!, e: (m.like_count ?? 0) + (m.comments_count ?? 0) }))
    : [];
  const brief = live ? buildLiveBrief(media) : null;

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
      <ContentScoreCard score={contentScore} />

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
          {brief ? (
            <>
              <h2 className="ai-brief-head">
                {brief.lead} <span className="accent-text">{brief.highlight}</span> {brief.tail}
              </h2>
              <p className="ai-brief-body">{brief.body}</p>
              <div className="ai-brief-insights">
                {brief.insights.map((ins, i) => (
                  <div className="ai-insight" key={i}>
                    <span className="ai-insight-ico">{INSIGHT_ICON[ins.icon]}</span>
                    <span>
                      {"bestTime" in ins && ins.bestTime && bestWin.value ? (
                        <>
                          {bestWin.value.confident ? "Your audience responds best on " : "Early signal: your best window looks like "}
                          <BestTime posts={timedPosts} variant="long" fallback={bestWin.value.long} />.
                          {!bestWin.value.confident && ` Based on ${bestWin.sampleSize} dated posts.`}
                        </>
                      ) : (
                        ins.text
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2 className="ai-brief-head">
                Connect your account and SOCIA writes this brief from{" "}
                <span className="accent-text">your real numbers</span>.
              </h2>
              <p className="ai-brief-body">
                Every sentence here is generated from your synced posts — nothing is shown until
                there is data behind it.
              </p>
            </>
          )}
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
            {liveActions.length > 0 ? (
              liveActions.map((a, i) => (
                <div className="action" key={i}>
                  <span className={`action-ico ${a.tone}`}>{ACTION_ICON[a.tone]}</span>
                  <div className="action-body">
                    <span className={`action-tag ${a.tone}`}>{a.tag}</span>
                    <b>{a.title}</b>
                    <small>{a.body}</small>
                  </div>
                  <Link href={a.href} className="action-cta" aria-label={a.title}>
                    <ArrowRight size={16} />
                  </Link>
                </div>
              ))
            ) : (
              <p className="dash-empty">
                Connect your account and publish a few posts — recommendations appear once SOCIA can
                measure something real.
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Performance + Top Content */}
      <div className="dash-2col perf-row">
        <section className="card">
          <div className="card-head">
            <h3>Performance Over Time</h3>
            <Link href="/analytics" className="link-mini">Full analytics</Link>
          </div>
          {reachSeries.length >= 3 ? (
            <PerformanceChart
              series={reachSeries}
              label="Accounts reached per day"
              note={`Real daily reach from Instagram · last ${reachSeries.length} days`}
            />
          ) : (
            <p className="dash-empty">
              Daily performance history is still building. SOCIA records Instagram&apos;s real daily
              series on every sync — nothing is drawn until it exists.
            </p>
          )}
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
            <p className="dash-empty">
              Not enough competitor data yet. Instagram&apos;s API can&apos;t read other accounts, so
              SOCIA shows real viral posts from your niche instead of invented competitor stats.
            </p>
            <Link href="/competitors" className="link-mini">
              See what&apos;s viral in your niche <ArrowRight size={12} />
            </Link>
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
            <p className="dash-empty">
              Nothing scheduled yet. SOCIA shows only real scheduled posts here — plan your week and
              they&apos;ll appear.
            </p>
            <Link href="/tool" className="link-mini">
              Build a content plan <ArrowRight size={12} />
            </Link>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
