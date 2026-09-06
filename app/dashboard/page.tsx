import { redirect } from "next/navigation";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { igConfigured } from "@/lib/instagram";
import { getIgSnapshot, readDailySnapshots } from "@/lib/instagramSync";
import { getPerformanceBaseline, type AccountInput, type DailySnapshot } from "@/lib/dashboardMetrics";
import { median, engagementOf } from "@/lib/metrics";
import AppShell from "@/components/AppShell";
import SyncCinematic from "@/components/SyncCinematic";
import DashboardV3, { type DashboardData } from "@/components/DashboardV3";
import {
  RANGES, rangeDays, DAY_MS, postCards, rankPosts, buildKpis, buildSeries, buildInsights, buildFocus, buildGoals, buildUpcoming,
  type PlatformRow,
} from "@/lib/overview";
import type { Deliverable } from "@/lib/schema";
import type { ScheduledPost } from "@/lib/scheduling";

export const metadata = { title: "Dashboard — SOCIA" };

// The dashboard answers: how am I doing, what changed, what's working, what
// needs attention, what should I do next. Every figure is computed in
// lib/overview from the account's own rows; nothing on this page is a sample.
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
  const snap = connected ? await getIgSnapshot(supabase, user.id) : null;
  const live = Boolean(snap && snap.followers_count != null);

  if (!connected || !live) {
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
            <Link href="/competitors#trends" className="hub-card">
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

  const rangeId = (RANGES.some((r) => r.id === rangeParam) ? rangeParam : "30") as string;
  const days = rangeDays(rangeId);
  const rangeLabel = RANGES.find((r) => r.id === rangeId)?.label ?? "Last 30 days";
  const media = snap!.media ?? [];

  let dailyRows: DailySnapshot[] = [];
  try {
    dailyRows = await readDailySnapshots<DailySnapshot>(supabase, user.id, snap?.ig_user_id ?? null, "day, followers, reach, views, followers_gained, source");
  } catch {
    // snapshots table may not exist yet — series render their empty states
  }
  const [schedRes, plansRes] = await Promise.all([
    supabase.from("scheduled_posts").select("*").eq("user_id", user.id).neq("status", "cancelled")
      .gte("scheduled_at", new Date(Date.now() - 30 * DAY_MS).toISOString()).order("scheduled_at", { ascending: true }).limit(200),
    supabase.from("plans").select("id, data, created_at, client_handle").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
  ]);
  const scheduled = (schedRes.data ?? []) as ScheduledPost[];
  const planRow = plansRes.data?.[0] as { id: string; data: Deliverable; created_at: string } | undefined;
  const latestPlan = planRow ? { id: planRow.id, data: planRow.data, created_at: planRow.created_at } : null;

  const acct: AccountInput = {
    followers: snap!.followers_count ?? null, lifetimePosts: snap!.media_count ?? null, posts: media, daily: dailyRows,
    syncedAt: snap!.last_synced_at ?? null, platform: "instagram", handle: snap!.username ?? null,
  };
  const baseline = getPerformanceBaseline(acct).value;
  const posts = postCards(media, baseline);
  const top = rankPosts(posts, "views", 8);
  const medianViews = median(posts.map((p) => p.views).filter((v): v is number => v != null));

  const kpisAll = buildKpis({ media, daily: dailyRows, followers: snap!.followers_count ?? null, days });
  const kpis = (["views", "engagement_rate", "followers", "posts"] as const).map((id) => kpisAll.find((k) => k.id === id)!);
  const series = {
    views: buildSeries("views", media, dailyRows, days),
    engagement: buildSeries("engagement", media, dailyRows, days),
    followers: buildSeries("followers", media, dailyRows, days),
  };
  const brand = profile?.brand_detail ?? null;
  const insights = buildInsights({ media, baseline, location: brand?.location ?? null, handle: snap!.username ?? null });
  const focus = buildFocus(latestPlan);
  const upcoming = buildUpcoming(scheduled);

  const follRows = dailyRows.filter((d) => d.followers != null && d.day >= new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10));
  const followerDelta30 = follRows.length >= 2 ? follRows[follRows.length - 1].followers! - follRows[0].followers! : null;
  const { goals, trackers } = buildGoals({
    goalsText: profile?.goals ?? null, plan: latestPlan, scheduled, media,
    frequency: brand?.strategist?.frequency ?? null, followerDelta30,
  });

  const platformMetric: "views" | "engagement" = series.views.total != null ? "views" : "engagement";
  const platformTotal = platformMetric === "views" ? series.views.total : series.engagement.total;
  const platforms: PlatformRow[] = [
    { id: "instagram", label: "Instagram", connected: true, value: platformTotal, deltaPct: kpisAll.find((k) => k.id === (platformMetric === "views" ? "views" : "engagement_rate"))?.deltaPct ?? null, share: platformTotal ? 1 : 0 },
    { id: "tiktok", label: "TikTok", connected: false, value: null, deltaPct: null, share: 0 },
    { id: "youtube", label: "YouTube", connected: false, value: null, deltaPct: null, share: 0 },
    { id: "facebook", label: "Facebook", connected: false, value: null, deltaPct: null, share: 0 },
  ];

  const d: DashboardData = {
    greeting, name, handle: snap!.username ?? null, rangeLabel, kpis, series, platforms, platformTotal, platformMetric,
    insights, top, posts, baseline, medianViews, focus, upcoming, goals, trackers,
    timed: media.filter((m) => m.timestamp).map((m) => ({ t: m.timestamp!, e: engagementOf(m) })),
  };

  return (
    <AppShell active="dashboard" userEmail={user.email}>
      {justConnected && <SyncCinematic username={snap?.username} followers={snap?.followers_count} />}
      <DashboardV3 d={d} />
    </AppShell>
  );
}
