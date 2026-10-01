import { redirect } from "next/navigation";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { scopeToWorkspace } from "@/lib/workspaces";
import { getProfile } from "@/lib/profile";
import { igConfigured } from "@/lib/instagram";
import { getFbSnapshot } from "@/lib/facebookSync";
import { getIgSnapshot, readDailySnapshots } from "@/lib/instagramSync";
import { getYouTubeAnalytics } from "@/lib/youtubeData";
import type { DailySnapshot } from "@/lib/dashboardMetrics";
import { median } from "@/lib/metrics";
import { interactionsTotal } from "@/lib/engagement";
import AppShell from "@/components/AppShell";
import SyncCinematic from "@/components/SyncCinematic";
import DashboardV3, { type DashboardData } from "@/components/DashboardV3";
import DashboardMultiPlatform from "@/components/DashboardMultiPlatform";
import { buildFacebookAnalytics } from "@/lib/metrics/facebook";
import { buildTikTokAnalytics } from "@/lib/metrics/tiktok";
import type { PlatformSummary } from "@/lib/metrics/allPlatforms";
import {
  RANGES, rangeDays, clampRangeId, DAY_MS, postCards, rankPosts, buildKpis, buildSeries, buildInsights, buildFocus, buildGoals, buildUpcoming, formatOf,
  type PlatformRow,
} from "@/lib/overview";
import { getEntitlements, maxHistoryDays } from "@/lib/entitlements";
import type { Deliverable } from "@/lib/schema";
import type { ScheduledPost } from "@/lib/scheduling";

export const metadata = { title: "Dashboard — SOCIA" };

// The dashboard answers: how am I doing, what changed, what's working, what
// needs attention, what should I do next — across EVERY connected platform, not
// just Instagram. Every figure is computed from the account's own rows; nothing
// here is a sample.
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
  const ctx = await resolveContext(supabase, user.id);

  const { ig, range: rangeParam } = await searchParams;
  const justConnected = ig === "connected";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const raw = (user.email?.split("@")[0] ?? "there").replace(/[._-]+/g, " ");
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);

  const [profile, ent] = await Promise.all([getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)), getEntitlements(ctx.client, ctx.ownerId)]);
  const igConnected = profile?.account_connected ?? false;
  const snap = igConnected ? await getIgSnapshot(ctx.client, ctx.ownerId) : null;
  const live = Boolean(snap && snap.followers_count != null);

  // Range (per-plan clamp), needed before fetching platform data.
  const maxDays = maxHistoryDays(ent);
  const requestedId = RANGES.some((r) => r.id === rangeParam) ? (rangeParam as string) : "30";
  const rangeId: string = clampRangeId(requestedId, maxDays);
  const days = rangeDays(rangeId);
  const rangeLabel = RANGES.find((r) => r.id === rangeId)?.label ?? "Last 30 days";
  const now = new Date();
  const wsId = ctx.workspace?.id ?? null;

  // Every other platform, in parallel. null/absent when not connected.
  const [fb, yt, ttRow] = await Promise.all([
    getFbSnapshot(ctx.client, ctx.ownerId).catch(() => null),
    getYouTubeAnalytics(ctx.client, ctx.ownerId, days).catch(() => null),
    scopeToWorkspace(
      ctx.client.from("tiktok_connections").select("username, display_name, avatar_url, is_verified, follower_count, likes_count, video_count, videos").eq("user_id", ctx.ownerId),
      wsId,
    ).limit(1).then((r) => (r.data ?? [])[0] ?? null, () => null),
  ]);
  const fbConnected = fb?.status === "connected";
  const ytConnected = Boolean(yt);
  const ttConnected = Boolean(ttRow);
  const connectedCount = [live, fbConnected, ytConnected, ttConnected].filter(Boolean).length;

  // Nothing connected at all: the connect wall (Instagram-first, since it's the
  // deepest integration), with the illustrated feature preview.
  if (connectedCount === 0) {
    const igHref = igConfigured() ? "/api/auth/instagram/start" : "/settings";
    return (
      <AppShell active="dashboard" userEmail={user.email}>
        <div className="dash-header">
          <div>
            <h1 className="dash-greeting">{greeting}, {name} <span aria-hidden>👋</span></h1>
            <p className="dash-context">Let&apos;s get your account set up.</p>
          </div>
        </div>
        <div className="db-connect">
          <span className="db-connect-ico"><Link2 size={22} /></span>
          <div className="db-connect-copy">
            <h2>Connect your Instagram account</h2>
            <p>See how your community grows, what content performs best, and how you compare to your competitors.</p>
          </div>
          <a href={igHref} className="db-connect-cta">Connect Instagram</a>
        </div>
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
        <p className="db-feats-note">These panels show example numbers. Your real data replaces them the moment you connect — nothing on the live dashboard is ever a sample.</p>
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

  // Per-platform summaries (used by the platform snapshot and the no-Instagram
  // dashboard). Each uses the platform's OWN native metrics; nothing is faked.
  const since = now.getTime() - days * DAY_MS;

  const fbSummary: PlatformSummary = { platform: "facebook", connected: fbConnected, label: fb?.page_name ?? "Facebook", audience: fb?.followers_count ?? null, audienceLabel: "followers", views: null, viewsNote: "Facebook doesn't report post views", engagement: null, contentPublished: null };
  if (fbConnected && fb) {
    const fd = buildFacebookAnalytics({ snap: fb, snapshots: [], days, rangeLabel, now });
    fbSummary.engagement = fd.engagement.total;
    fbSummary.contentPublished = fd.postsInRange;
  }
  const ytSummary: PlatformSummary = { platform: "youtube", connected: ytConnected, label: yt?.channel.title ?? "YouTube", audience: yt?.channel.subscribers ?? null, audienceLabel: "subscribers", views: yt?.range?.views ?? null, viewsNote: null, engagement: null, contentPublished: null };
  const ttSummary: PlatformSummary = { platform: "tiktok", connected: ttConnected, label: "TikTok", audience: null, audienceLabel: "followers", views: null, viewsNote: "TikTok reports per-video totals, not a range view count", engagement: null, contentPublished: null };
  if (ttConnected && ttRow) {
    const td = buildTikTokAnalytics({ row: ttRow, days, rangeLabel, now });
    ttSummary.label = td.profile.username ? `@${td.profile.username}` : (td.profile.name || "TikTok");
    ttSummary.audience = (ttRow.follower_count as number | null) ?? null;
    ttSummary.contentPublished = td.videosInRange;
  }

  // Scheduled posts (used by both dashboard views).
  const [schedRes, plansRes] = await Promise.all([
    scopeToWorkspace(
      ctx.client.from("scheduled_posts").select("*").eq("user_id", ctx.ownerId).neq("status", "cancelled")
        .gte("scheduled_at", new Date(Date.now() - 30 * DAY_MS).toISOString()),
      wsId,
    ).order("scheduled_at", { ascending: true }).limit(200),
    scopeToWorkspace(
      ctx.client.from("plans").select("id, data, created_at, client_handle").eq("user_id", ctx.ownerId),
      wsId,
    ).order("created_at", { ascending: false }).limit(1),
  ]);
  const scheduled = (schedRes.data ?? []) as ScheduledPost[];
  const upcoming = buildUpcoming(scheduled);

  // No live Instagram, but another platform is connected: a real multi-platform
  // home instead of the old Instagram-only wall.
  if (!live) {
    const igSummary: PlatformSummary = { platform: "instagram", connected: false, label: "Instagram", audience: null, audienceLabel: "followers", views: null, viewsNote: null, engagement: null, contentPublished: null };
    return (
      <AppShell active="dashboard" userEmail={user.email}>
        <DashboardMultiPlatform greeting={greeting} name={name} summaries={[igSummary, fbSummary, ytSummary, ttSummary]} upcoming={upcoming} />
      </AppShell>
    );
  }

  // ---- Instagram-live dashboard (full existing experience) ----
  const media = snap!.media ?? [];

  let dailyRows: DailySnapshot[] = [];
  try {
    dailyRows = await readDailySnapshots<DailySnapshot>(ctx.client, ctx.ownerId, snap?.ig_user_id ?? null, "day, followers, reach, views, followers_gained, source");
  } catch {
    // snapshots table may not exist yet — series render their empty states
  }
  const planRow = plansRes.data?.[0] as { id: string; data: Deliverable; created_at: string } | undefined;
  const latestPlan = planRow ? { id: planRow.id, data: planRow.data, created_at: planRow.created_at } : null;

  const baseline = median(media.map(interactionsTotal));
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

  const follRows = dailyRows.filter((d) => d.followers != null && d.day >= new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10));
  const followerDelta30 = follRows.length >= 2 ? follRows[follRows.length - 1].followers! - follRows[0].followers! : null;
  const { goals, trackers } = buildGoals({
    goalsText: profile?.goals ?? null, plan: latestPlan, scheduled, media,
    frequency: brand?.strategist?.frequency ?? null, followerDelta30,
  });

  const platformMetric: "views" | "engagement" = series.views.total != null ? "views" : "engagement";
  const platformTotal = platformMetric === "views" ? series.views.total : series.engagement.total;
  const fbPosts = fbConnected ? fb!.posts.filter((p) => p.created_time && new Date(p.created_time).getTime() >= since) : [];
  const fbCounted = fbPosts.some((p) => p.reactions != null || p.comments != null || p.shares != null);
  const fbEngagement = fbCounted ? fbPosts.reduce((a, p) => a + (p.reactions ?? 0) + (p.comments ?? 0) + (p.shares ?? 0), 0) : null;
  const fbValue = platformMetric === "engagement" ? fbEngagement : null;
  const platforms: PlatformRow[] = [
    { id: "instagram", label: "Instagram", connected: true, value: platformTotal, deltaPct: kpisAll.find((k) => k.id === (platformMetric === "views" ? "views" : "engagement_rate"))?.deltaPct ?? null, share: platformTotal ? 1 : 0 },
    { id: "tiktok", label: "TikTok", connected: ttConnected, value: null, deltaPct: null, share: 0 },
    { id: "youtube", label: "YouTube", connected: ytConnected, value: yt && platformMetric === "views" ? (yt.range?.views ?? null) : null, deltaPct: null, share: 0 },
    { id: "facebook", label: "Facebook", connected: fbConnected, value: fbValue, deltaPct: null, share: 0 },
  ];
  {
    const total = platforms.reduce((a, r) => a + (r.connected && r.value ? r.value : 0), 0);
    for (const r of platforms) r.share = total > 0 && r.connected && r.value ? r.value / total : 0;
  }

  const igSummary: PlatformSummary = {
    platform: "instagram", connected: true, label: snap!.username ? `@${snap!.username}` : "Instagram",
    audience: snap!.followers_count ?? null, audienceLabel: "followers",
    views: series.views.total, viewsNote: null, engagement: series.engagement.total,
    contentPublished: media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= since).length,
  };

  const d: DashboardData = {
    greeting, name, handle: snap!.username ?? null, rangeLabel, maxDays, kpis, series, platforms, platformTotal, platformMetric,
    insights, top, posts, baseline, medianViews, focus, upcoming, goals, trackers,
    timed: media.filter((m) => m.timestamp).map((m) => ({ id: m.id ?? m.timestamp!, t: m.timestamp!, e: interactionsTotal(m), format: formatOf(m) })),
    platformSummaries: [igSummary, fbSummary, ytSummary, ttSummary],
  };

  return (
    <AppShell active="dashboard" userEmail={user.email}>
      {justConnected && <SyncCinematic username={snap?.username} followers={snap?.followers_count} />}
      <DashboardV3 d={d} />
    </AppShell>
  );
}
