import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles, Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { igConfigured } from "@/lib/instagram";
import { getIgSnapshot, type IgMediaItem } from "@/lib/instagramSync";
import DashboardClient, {
  type DashMetric,
  type DashPost,
  type DashDaily,
  type DashInsight,
} from "@/components/DashboardClient";
import {
  getFollowers,
  getReach,
  getPerformanceBaseline,
  changeVsPrevious,
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
import AppShell from "@/components/AppShell";
import DateRangeSelector from "@/components/DateRangeSelector";
import AccountSwitcher from "@/components/AccountSwitcher";
import SyncCinematic from "@/components/SyncCinematic";
import LiveSync from "@/components/LiveSync";


export const metadata = { title: "Dashboard — SOCIA" };


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
function agoLabel(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
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

  // Date range drives every period metric on the page (?range=7|30|90|...).
  const RANGE_DAYS: Record<string, number> = { "7": 7, "30": 30, "90": 90, "180": 180, "365": 365 };
  const rangeId = rangeParam && (RANGE_DAYS[rangeParam] || rangeParam === "all") ? rangeParam : "30";

  const snap = await getIgSnapshot(supabase, user.id);
  const media = snap?.media ?? [];
  const live = Boolean(snap && snap.followers_count != null);

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
    // snapshots table may not exist yet — series render their empty states
  }

  const oldestPost = media.length
    ? Math.min(...media.filter((m) => m.timestamp).map((m) => new Date(m.timestamp!).getTime()))
    : null;
  const oldestSnap = dailyRows.length ? new Date(dailyRows[0].day + "T00:00:00").getTime() : null;
  const allDays = Math.max(
    7,
    Math.ceil((Date.now() - Math.min(oldestPost ?? Infinity, oldestSnap ?? Infinity)) / 86400000) || 30,
  );
  const rangeDays = rangeId === "all" ? allDays : RANGE_DAYS[rangeId];

  const acct: AccountInput = {
    followers: snap?.followers_count ?? null,
    lifetimePosts: snap?.media_count ?? null,
    posts: media,
    daily: dailyRows,
    syncedAt: snap?.last_synced_at ?? null,
    platform: "instagram",
    handle: snap?.username ?? null,
  };

  // --- metrics strip (every value from the central service) ---
  const followersM = getFollowers(acct);
  const growthM = getFollowerGrowth(acct, rangeDays);
  const gainedM = getFollowersGained(acct, rangeDays);
  const reachM = getReach(acct, rangeDays);
  const engRateM = getEngagementRate(acct);
  const publishedM = getPostsPublished(acct, rangeDays);
  const baselineM = getPerformanceBaseline(acct);

  const since = Date.now() - rangeDays * 86400000;
  const prevSince = since - rangeDays * 86400000;
  const inRange = media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= since);
  const prevRange = media.filter(
    (m) => m.timestamp && new Date(m.timestamp).getTime() >= prevSince && new Date(m.timestamp).getTime() < since,
  );
  const engIn = inRange.reduce((s2, m) => s2 + engOfPost(m), 0);
  const engPrev = prevRange.length ? prevRange.reduce((s2, m) => s2 + engOfPost(m), 0) : null;
  const engDelta = changeVsPrevious(engIn, engPrev);
  const postsDelta = prevRange.length || oldestPost != null && oldestPost <= prevSince
    ? inRange.length - prevRange.length
    : null;

  const reachRows = dailyRows.filter((d) => d.reach != null);
  const reachPrev = dailyRows.filter(
    (d) => d.reach != null && d.day < new Date(since).toISOString().slice(0, 10) &&
      d.day >= new Date(prevSince).toISOString().slice(0, 10),
  );
  const reachPrevTotal = reachPrev.length ? reachPrev.reduce((s2, d) => s2 + (d.reach ?? 0), 0) : null;
  const reachDelta = reachM.value != null ? changeVsPrevious(reachM.value, reachPrevTotal) : null;

  const periodNote = `vs previous ${rangeDays} days`;
  const metricsStrip: DashMetric[] = live
    ? [
        {
          key: "followers",
          label: "Followers",
          value: followersM.value != null ? followersM.value.toLocaleString("en-US") : "—",
          raw: followersM.value,
          delta: growthM.value != null ? `${growthM.value >= 0 ? "+" : ""}${growthM.value.toLocaleString("en-US")}`
            : gainedM.value != null ? `+${gainedM.value.toLocaleString("en-US")} new` : null,
          deltaPct: null,
          positive: (growthM.value ?? gainedM.value ?? 0) >= 0,
          note: growthM.value != null ? periodNote : gainedM.value != null ? `Instagram gains · last ${rangeDays}d` : "history collecting",
          spark: dailyRows.filter((d) => d.followers_gained != null).slice(-30).map((d) => d.followers_gained!),
          tooltip: `${followersM.source} · ${followersM.method}`,
        },
        {
          key: "reach",
          label: "Reach",
          value: reachM.value != null ? fmtNum(reachM.value) : "—",
          raw: reachM.value,
          delta: null,
          deltaPct: reachDelta?.value != null ? `${reachDelta.value >= 0 ? "+" : ""}${reachDelta.value.toFixed(1)}%` : null,
          positive: (reachDelta?.value ?? 0) >= 0,
          note: reachM.value != null ? (reachDelta?.value != null ? periodNote : `last ${rangeDays} days`) : "collecting history",
          spark: reachRows.slice(-30).map((d) => d.reach!),
          tooltip: `${reachM.source} · ${reachM.method}`,
        },
        {
          key: "engagements",
          label: "Engagements",
          value: engIn.toLocaleString("en-US"),
          raw: engIn,
          delta: engPrev != null ? `${engIn - engPrev >= 0 ? "+" : ""}${(engIn - engPrev).toLocaleString("en-US")}` : null,
          deltaPct: engDelta.value != null ? `${engDelta.value >= 0 ? "+" : ""}${engDelta.value.toFixed(1)}%` : null,
          positive: engPrev == null || engIn >= engPrev,
          note: engPrev != null ? periodNote : "on posts published this period",
          spark: [],
          tooltip: "Likes + comments on posts published in the selected period (current totals from Instagram).",
        },
        {
          key: "engrate",
          label: "Engagement rate",
          value: engRateM.value != null ? engRateM.value.toFixed(2) + "%" : "—",
          raw: engRateM.value,
          delta: null,
          deltaPct: null,
          positive: true,
          note: engRateM.value != null ? engRateM.period : "unavailable",
          spark: [],
          tooltip: `${ENGAGEMENT_RATE_FORMULA} · ${engRateM.method}`,
        },
        {
          key: "posts",
          label: "Posts",
          value: String(publishedM.value ?? 0),
          raw: publishedM.value,
          delta: postsDelta != null ? `${postsDelta >= 0 ? "+" : ""}${postsDelta}` : null,
          deltaPct: null,
          positive: (postsDelta ?? 0) >= 0,
          note: postsDelta != null ? periodNote : `last ${rangeDays} days`,
          spark: [],
          tooltip: publishedM.method,
        },
      ]
    : [];

  // --- per-post rows (real insights only) ---
  const base = baselineM.value;
  const dashPosts: DashPost[] = media
    .filter((m) => m.timestamp)
    .sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime())
    .slice(0, 12)
    .map((m, i) => {
      const e = engOfPost(m);
      const reach = m.insights?.reach ?? null;
      return {
        id: m.id ?? String(i),
        caption: (m.caption || "").split("\n")[0].trim(),
        published: m.timestamp!,
        format: formatLabel(m.media_type),
        views: m.insights?.views ?? null,
        reach,
        engagements: e,
        engRate: reach && reach > 0 ? (e / reach) * 100 : null,
        multiplier: base && base > 0 ? e / base : null,
        thumb: m.thumbnail_url || m.media_url || null,
        permalink: m.permalink ?? null,
      };
    });

  // --- daily series for the chart ---
  const dayCounts = new Map<string, number>();
  for (const m of media) {
    if (!m.timestamp) continue;
    const d = new Date(m.timestamp);
    const key = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
  }
  const cutoffDay = new Date(since).toISOString().slice(0, 10);
  const dashDaily: DashDaily[] = dailyRows
    .filter((d) => d.day >= cutoffDay)
    .map((d) => ({
      day: d.day,
      followers: d.followers,
      followersGained: d.followers_gained,
      reach: d.reach,
      views: d.views,
      posts: dayCounts.get(d.day) ?? 0,
    }));

  // --- insight: only when a format genuinely outperforms the baseline ---
  let insight: DashInsight | null = null;
  if (base && base > 0) {
    const byFormat = new Map<string, number[]>();
    for (const m of media) {
      const t = m.media_type ?? "IMAGE";
      byFormat.set(t, [...(byFormat.get(t) ?? []), engOfPost(m)]);
    }
    let bestFmt: { type: string; ratio: number; n: number } | null = null;
    for (const [t, xs] of byFormat) {
      if (xs.length < 3) continue;
      const med = medianOf(xs)!;
      const ratio = med / base;
      if (!bestFmt || ratio > bestFmt.ratio) bestFmt = { type: t, ratio, n: xs.length };
    }
    if (bestFmt && bestFmt.ratio >= 1.15) {
      const topOfFormat = media
        .filter((m) => (m.media_type ?? "IMAGE") === bestFmt!.type)
        .sort((a, b) => engOfPost(b) - engOfPost(a))[0];
      insight = {
        title: `${formatLabel(bestFmt.type)}s are your strongest format`,
        body: `more engagement than your median post, measured across ${bestFmt.n} ${formatLabel(bestFmt.type).toLowerCase()}s.`,
        multiplier: `${bestFmt.ratio.toFixed(1)}×`,
        thumb: topOfFormat?.thumbnail_url || topOfFormat?.media_url || null,
      };
    }
  }

  const historyStart = dailyRows.length ? fmtDate(dailyRows[0].day + "T00:00:00") : null;
  const syncedAgo = snap?.last_synced_at ? agoLabel(snap.last_synced_at) : null;

  return (
    <AppShell active="dashboard" userEmail={user.email}>
      {justConnected && (
        <SyncCinematic username={snap?.username} followers={snap?.followers_count} />
      )}

      <div className="dsh-head">
        <div>
          <h1>
            {greeting}, {name} <span aria-hidden>👋</span>
          </h1>
          <p>Here&apos;s how your content is performing.</p>
          {live && (
            <div className="dsh-account">
              {snap?.profile_picture_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={snap.profile_picture_url} alt="" width={40} height={40} />
              ) : (
                <span className="ph" aria-hidden />
              )}
              <div className="dsh-account-meta">
                <b>@{snap!.username}</b>
                <small>
                  Instagram
                  {syncedAgo && (
                    <>
                      <span className="live"><i /> Live</span>
                      Last synced {syncedAgo}
                    </>
                  )}
                </small>
              </div>
            </div>
          )}
        </div>
        <div className="dsh-controls">
          <DateRangeSelector />
          <AccountSwitcher />
          <Link href="/chat" className="btn-primary db2-ask">
            <Sparkles size={15} /> Ask AI Strategist
          </Link>
        </div>
      </div>

      {live ? (
        <DashboardClient
          metrics={metricsStrip}
          daily={dashDaily}
          posts={dashPosts}
          insight={insight}
          range={rangeId}
          rangeBase="/dashboard"
          followersNow={snap?.followers_count ?? null}
          historyStart={historyStart}
        />
      ) : (
        <div className="dsh-panel">
          <p className="dsh-empty">
            Your account is registered but hasn&apos;t synced yet. Open Settings and hit Sync now to
            pull your real numbers.
          </p>
        </div>
      )}

      <div className="dsh-foot">
        <span>Times shown in your device&apos;s time zone</span>
      </div>
    </AppShell>
  );
}
