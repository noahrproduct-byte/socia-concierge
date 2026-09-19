import { redirect } from "next/navigation";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { igConfigured } from "@/lib/instagram";
import { getFbSnapshot } from "@/lib/facebookSync";
import { getIgSnapshot, readDailySnapshots, getActiveConnection } from "@/lib/instagramSync";
import type { DailySnapshot } from "@/lib/dashboardMetrics";
import { median } from "@/lib/metrics";
import { interactionsTotal } from "@/lib/engagement";
import AppShell from "@/components/AppShell";
import SyncCinematic from "@/components/SyncCinematic";
import DashboardV3, { type DashboardData } from "@/components/DashboardV3";
import Greeting from "@/components/ov/Greeting";
import SyncPending from "@/components/ov/SyncPending";
import {
  RANGES, rangeDays, DAY_MS, postCards, rankPosts, buildKpis, buildSeries, buildInsights, buildFocus, buildGoals, buildUpcoming, formatOf,
  type PlatformRow,
} from "@/lib/overview";
import type { Deliverable } from "@/lib/schema";
import type { ScheduledPost } from "@/lib/scheduling";

export const metadata = { title: "Dashboard | SOCIA" };

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
  // The time-of-day greeting is the viewer's, so <Greeting> computes it after
  // mount; the server never renders text that depends on local time.
  const raw = (user.email?.split("@")[0] ?? "there").replace(/[._-]+/g, " ");
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);

  const profile = await getProfile(supabase, user.id);
  const connected = profile?.account_connected ?? false;
  const snap = connected ? await getIgSnapshot(supabase, user.id) : null;
  const live = Boolean(snap && snap.followers_count != null);

  if (!live) {
    // A connection row without a usable snapshot means the OAuth step is done
    // but the first sync hasn't completed (or failed): offer the sync itself,
    // not a second OAuth round.
    const conn = (await getActiveConnection(supabase, user.id, "username")) as { username?: string | null } | null;
    const pending = Boolean(conn);
    const igHref = igConfigured() ? "/api/auth/instagram/start" : "/settings";
    return (
      <AppShell active="dashboard" userEmail={user.email}>
        <div className="dash-header">
          <div>
            <h1 className="dash-greeting">
              <Greeting name={name} />
            </h1>
            <p className="dash-context">{pending ? "One more step: sync your Instagram account." : "Let's get your account set up."}</p>
          </div>
        </div>

        {pending ? (
          <SyncPending username={conn?.username ?? snap?.username ?? null} />
        ) : (
          /* tinted connect banner */
          <div className="db-connect">
            <span className="db-connect-ico"><Link2 size={22} /></span>
            <div className="db-connect-copy">
              <h2>Connect your Instagram account</h2>
              <p>See how your community grows, what content performs best, and how you compare to your competitors.</p>
            </div>
            {/* plain anchor: /api/auth routes must not be Link-prefetched */}
            <a href={igHref} className="db-connect-cta">Connect Instagram</a>
          </div>
        )}

        {/* what you get, illustrated */}
        <div className="db-feats">
          <section className="db-feat">
            <h3>Know your audience</h3>
            <p>Track your follower growth and discover who actually watches you.</p>
            <div className="mockp">
              <div className="mockp-head"><span className="side-mark sm">S</span> Audience · top segments <em className="mock-example">Example</em></div>
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
              <div className="mockp-head"><span className="side-mark sm">S</span> Engagement · by format <em className="mock-example">Example</em></div>
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
              <div className="mockp-head"><span className="side-mark sm">S</span> Competitors · followers vs you <em className="mock-example">Example</em></div>
              <div className="mock-row"><span>@brand_a</span><span className="mock-sub">24.1K followers</span><b className="pos">+24%</b></div>
              <div className="mock-row"><span>@brand_b</span><span className="mock-sub">18.7K followers</span><b className="pos">+12%</b></div>
              <div className="mock-row"><span>@brand_c</span><span className="mock-sub">9.4K followers</span><b className="neg">-5%</b></div>
              <span className="mock-chip left"><small>Avg gap</small><b>+3.2%</b><em>vs competitors</em></span>
            </div>
          </section>
        </div>
        <p className="db-feats-note">These panels show example numbers. Your real data replaces them {pending ? "as soon as the first sync completes" : "the moment you connect"}: nothing on the live dashboard is ever a sample.</p>

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
  const now = new Date();
  const since = now.getTime() - days * DAY_MS;

  // None of these reads depends on another, so they run together. The daily
  // snapshots table may not exist yet, in which case its series render their
  // empty states; a Facebook failure only empties that platform row.
  const [dailyRows, schedRes, plansRes, fb] = await Promise.all([
    readDailySnapshots<DailySnapshot>(supabase, user.id, snap?.ig_user_id ?? null, "day, followers, reach, views, followers_gained, source").catch(() => [] as DailySnapshot[]),
    supabase.from("scheduled_posts").select("*").eq("user_id", user.id).neq("status", "cancelled")
      .gte("scheduled_at", new Date(now.getTime() - 30 * DAY_MS).toISOString()).order("scheduled_at", { ascending: true }).limit(200),
    supabase.from("plans").select("id, data, created_at, client_handle").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
    getFbSnapshot(supabase, user.id).catch(() => null),
  ]);
  const scheduled = (schedRes.data ?? []) as ScheduledPost[];
  const planRow = plansRes.data?.[0] as { id: string; data: Deliverable; created_at: string } | undefined;
  const latestPlan = planRow ? { id: planRow.id, data: planRow.data, created_at: planRow.created_at } : null;

  // Baseline = the median post's interactions, the same reference Analytics uses.
  const baseline = median(media.map(interactionsTotal));
  const posts = postCards(media, baseline);
  // Top content honours the selected range; the baseline and median views stay
  // account-wide so a post's multiplier means the same thing everywhere.
  const inRangePosts = posts.filter((p) => new Date(p.published).getTime() >= since);
  const top = rankPosts(inRangePosts, "views", 8);
  const medianViews = median(posts.map((p) => p.views).filter((v): v is number => v != null));

  const kpisAll = buildKpis({ media, daily: dailyRows, followers: snap!.followers_count ?? null, days, now });
  const kpis = (["views", "engagement_rate", "followers", "posts"] as const).map((id) => kpisAll.find((k) => k.id === id)!);
  const series = {
    views: buildSeries("views", media, dailyRows, days, now),
    engagement: buildSeries("engagement", media, dailyRows, days, now),
    followers: buildSeries("followers", media, dailyRows, days, now),
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
  // Facebook: the connected Page's own engagement (reactions + comments +
  // shares on posts inside the range), as Meta reports it. Facebook exposes
  // no view count for regular Page posts, so under the views metric the row
  // is connected but unmeasured, never zero.
  const fbConnected = fb?.status === "connected";
  const fbPosts = fbConnected ? fb!.posts.filter((p) => p.created_time && new Date(p.created_time).getTime() >= since) : [];
  const fbCounted = fbPosts.some((p) => p.reactions != null || p.comments != null || p.shares != null);
  const fbEngagement = fbCounted ? fbPosts.reduce((a, p) => a + (p.reactions ?? 0) + (p.comments ?? 0) + (p.shares ?? 0), 0) : null;
  const fbValue = platformMetric === "engagement" ? fbEngagement : null;
  const fbRow: PlatformRow = { id: "facebook", label: "Facebook", connected: fbConnected, value: fbValue, deltaPct: null, share: 0 };
  const platforms: PlatformRow[] = [
    { id: "instagram", label: "Instagram", connected: true, value: platformTotal, deltaPct: kpisAll.find((k) => k.id === (platformMetric === "views" ? "views" : "engagement_rate"))?.deltaPct ?? null, share: platformTotal ? 1 : 0 },
    { id: "tiktok", label: "TikTok", connected: false, value: null, deltaPct: null, share: 0 },
    { id: "youtube", label: "YouTube", connected: false, value: null, deltaPct: null, share: 0 },
    fbRow,
  ];
  {
    const total = platforms.reduce((a, r) => a + (r.connected && r.value ? r.value : 0), 0);
    for (const r of platforms) r.share = total > 0 && r.connected && r.value ? r.value / total : 0;
  }

  const d: DashboardData = {
    name, handle: snap!.username ?? null, rangeLabel, kpis, series, platforms, platformTotal, platformMetric,
    insights, top, posts, baseline, medianViews, focus, upcoming, goals, trackers,
    timed: media.filter((m) => m.timestamp).map((m) => ({ id: m.id ?? m.timestamp!, t: m.timestamp!, e: interactionsTotal(m), format: formatOf(m) })),
  };

  return (
    <AppShell active="dashboard" userEmail={user.email}>
      {justConnected && <SyncCinematic username={snap?.username} followers={snap?.followers_count} />}
      <DashboardV3 d={d} />
    </AppShell>
  );
}
