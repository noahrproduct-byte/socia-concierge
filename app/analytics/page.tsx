import { redirect } from "next/navigation";
import { Link2 } from "lucide-react";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { scopeToWorkspace } from "@/lib/workspaces";
import { getProfile } from "@/lib/profile";
import { igConfigured } from "@/lib/instagram";
import { getFbSnapshot } from "@/lib/facebookSync";
import { getFacebookInsights } from "@/lib/facebookInsights";
import { getIgSnapshot, readDailySnapshots, getActiveConnection, type IgMediaItem } from "@/lib/instagramSync";
import { readPlatformSnapshots } from "@/lib/platformSnapshots";
import type { DailySnapshot } from "@/lib/dashboardMetrics";
import { median } from "@/lib/metrics";
import { interactionsTotal, engagementRateOf, engagementBreakdown, engagementQuality } from "@/lib/engagement";
import { followerPoints } from "@/lib/followers";
import { buildGaps } from "@/lib/gaps";
import { fetchDemographics } from "@/lib/igDemographics";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import AnalyticsV3, { type AnalyticsData, type AnalyticsGate } from "@/components/AnalyticsV3";
import YouTubeAnalytics from "@/components/YouTubeAnalytics";
import FacebookAnalytics from "@/components/FacebookAnalytics";
import TikTokAnalytics from "@/components/TikTokAnalytics";
import AnalyticsShell from "@/components/AnalyticsShell";
import type { PlatformTab } from "@/components/PlatformTabs";
import type { OverlayLine } from "@/components/ov/MultiLineChart";
import { getYouTubeAnalytics, type YtDaily } from "@/lib/youtubeData";
import { ytAuthConfigured } from "@/lib/youtubeAuth";
import { buildFacebookAnalytics } from "@/lib/metrics/facebook";
import { buildTikTokAnalytics } from "@/lib/metrics/tiktok";
import { buildAllPlatforms, type PlatformSummary } from "@/lib/metrics/allPlatforms";
import type { LibraryPost } from "@/components/ContentLibrary";
import {
  RANGES, rangeDays, clampRangeId, postCards, buildKpis, buildSeries, buildInsights, formatBreakdown, formatOf, DAY_MS, type PlatformRow, type MetricId, type Series, type SeriesPoint, type GraphAccount, type GraphSeries,
} from "@/lib/overview";
import { canUseFeature, getEntitlements, maxHistoryDays } from "@/lib/entitlements";
import { minPlanWithFeature, type PlanId } from "@/lib/plans";

export const metadata = { title: "Analytics — SOCIA" };

// Analytics. One experience, switched by platform. Each platform's panel is
// built from the data that platform actually provides (Instagram keeps its full
// view; Facebook/YouTube/TikTok are honest to their own APIs). "All Platforms"
// combines only what is mathematically valid. The pipeline stays fixed: real
// rows → deterministic aggregation → rendered → AI only ever explains.
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; platform?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const ctx = await resolveContext(supabase, user.id);

  const { range: rangeParam, platform: platformParam } = await searchParams;
  const [profile, snap, ent] = await Promise.all([
    getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)),
    getIgSnapshot(ctx.client, ctx.ownerId),
    getEntitlements(ctx.client, ctx.ownerId),
  ]);
  const maxDays = maxHistoryDays(ent);
  const requestedId = RANGES.some((r) => r.id === rangeParam) ? (rangeParam as string) : "30";
  const rangeId: string = clampRangeId(requestedId, maxDays);
  const days = rangeDays(rangeId);
  const rangeLabel = RANGES.find((r) => r.id === rangeId)?.label ?? "Last 30 days";

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const live = Boolean(snap && snap.followers_count != null);

  // Fetch every platform the workspace might have, in parallel. Each resolves to
  // null/absent when not connected, so the page stays multi-platform aware.
  const [yt, fb] = await Promise.all([
    getYouTubeAnalytics(ctx.client, ctx.ownerId, days).catch(() => null),
    getFbSnapshot(ctx.client, ctx.ownerId).catch(() => null),
  ]);
  const fbConnected = fb?.status === "connected";

  // TikTok: the active workspace's account row (counts + videos), if any.
  let ttRow: Record<string, unknown> | null = null;
  try {
    const { data } = await scopeToWorkspace(
      ctx.client.from("tiktok_connections").select("username, display_name, avatar_url, is_verified, follower_count, likes_count, video_count, videos, last_synced_at").eq("user_id", ctx.ownerId),
      ctx.workspace?.id,
    ).limit(1);
    ttRow = (data ?? [])[0] ?? null;
  } catch { /* tiktok_connections may not exist yet */ }
  const ttConnected = Boolean(ttRow);

  const connectedCount = [live, fbConnected, Boolean(yt), ttConnected].filter(Boolean).length;

  // Nothing connected: the connect wall (unchanged).
  if (connectedCount === 0) {
    const igHref = igConfigured() ? "/api/auth/instagram/start" : "/settings";
    const ytHref = ytAuthConfigured() ? "/api/auth/youtube/start" : "/settings";
    return (
      <AppShell active="analytics" userEmail={user.email}>
        <PageHeader title="Analytics" sub="See what happened, understand why, and find what your strategy is missing." />
        <div className="db-connect">
          <span className="db-connect-ico"><Link2 size={22} /></span>
          <div className="db-connect-copy">
            <h2>Connect an account to see your analytics</h2>
            <p>Analytics fills with your real numbers the moment you connect a platform, and SOCIA starts recording your growth from that moment. Nothing here is estimated.</p>
          </div>
          <span className="db-connect-actions">
            <a href={igHref} className="db-connect-cta">Connect Instagram</a>
            <a href={ytHref} className="db-connect-cta ghost">Connect YouTube</a>
          </span>
        </div>
      </AppShell>
    );
  }

  // Accounts the Performance graph can overlay. Only platforms with a real
  // per-day series contribute a line; the rest are honest gaps.
  const graphAccounts: GraphAccount[] = [];

  // ---- Instagram panel + summary (full existing experience, only when live) ----
  let igPanel: ReactNode = null;
  const igSummary: PlatformSummary = { platform: "instagram", connected: false, label: "Instagram", audience: null, audienceLabel: "followers", views: null, viewsNote: null, engagement: null, contentPublished: null };

  if (live) {
    const media: IgMediaItem[] = snap!.media ?? [];
    const followers = snap!.followers_count ?? null;
    type Row = DailySnapshot & { followers_gained: number | null };
    const [dailyRows, tokenRow] = await Promise.all([
      readDailySnapshots<Row>(ctx.client, ctx.ownerId, snap?.ig_user_id ?? null, "day, followers, reach, views, followers_gained, source").catch(() => [] as Row[]),
      getActiveConnection(ctx.client, ctx.ownerId, "access_token") as Promise<{ access_token?: string } | null>,
    ]);
    const demo = await fetchDemographics(tokenRow?.access_token ?? null);

    const baseline = median(media.map(interactionsTotal));
    const posts = postCards(media, baseline);
    const medianViews = median(posts.map((p) => p.views).filter((v): v is number => v != null));

    const kpisAll = buildKpis({ media, daily: dailyRows, followers, days, now });
    const kpis = (["views", "engagement_rate", "followers", "reach"] as const).map((id) => kpisAll.find((k) => k.id === id)!);
    const metrics: MetricId[] = ["views", "engagement", "followers", "reach"];
    const series = Object.fromEntries(metrics.map((m) => [m, buildSeries(m, media, dailyRows, days, now)])) as AnalyticsData["series"];
    const rows = new Map(dailyRows.map((r) => [r.day, r]));
    const gains = series.views.current.map((p) => { const r = rows.get(p.day); return { day: p.day, value: r && r.source === "instagram_api" ? (r.followers_gained ?? null) : null, postIds: [] }; });

    const location = profile?.brand_detail?.location ?? null;
    const insights = buildInsights({ media, baseline, location, handle: snap!.username ?? null });
    const freq = profile?.brand_detail?.strategist?.frequency ?? null;
    const frequencyTarget = freq ? parseInt(freq.match(/\d+/)?.[0] ?? "", 10) : NaN;
    const allGaps = buildGaps({ media, followers, goals: profile?.goals ?? null, location, frequencyTarget: Number.isFinite(frequencyTarget) ? frequencyTarget : null, now });
    const holdBack = !canUseFeature(ent, "deeper_insights") && allGaps.length > 1;
    const gaps = holdBack ? allGaps.slice(0, 1) : allGaps;
    const lockedGaps = holdBack ? allGaps.length - 1 : undefined;
    const breakdown = formatBreakdown(media, days, now);

    const since = now.getTime() - days * DAY_MS;
    const inRange = media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= since);
    const engagement = { rate: engagementRateOf(inRange, followers), breakdown: engagementBreakdown(inRange), quality: engagementQuality(media, formatOf) };

    const fPoints = followerPoints(dailyRows);
    const oldestPost = media.filter((m) => m.timestamp).map((m) => m.timestamp!.slice(0, 10)).sort()[0] ?? null;
    const firstSnap = dailyRows[0]?.day ?? null;
    const firstDataDay = [oldestPost, firstSnap].filter((d): d is string => Boolean(d)).sort()[0] ?? null;

    const timed = media.filter((m) => m.timestamp).map((m) => ({ id: m.id ?? m.timestamp!, t: m.timestamp!, e: interactionsTotal(m), format: formatOf(m) }));
    const formats: Record<string, number> = {};
    for (const p of posts) formats[p.format] = (formats[p.format] ?? 0) + 1;
    const library: LibraryPost[] = posts.map((p) => ({
      id: p.id, caption: p.caption, published: p.published, format: p.format, views: p.views, reach: p.reach, likes: p.likes, comments: p.comments, saves: p.saves, shares: p.shares,
      engagements: p.engagements, engRate: p.reach ? (p.engagements / p.reach) * 100 : followers ? (p.engagements / followers) * 100 : null, multiplier: p.multiplier, thumb: p.thumb, permalink: p.permalink,
    }));

    const platformMetric = series.views.total != null ? "views" : "engagement";
    const platformTotal = platformMetric === "views" ? series.views.total : series.engagement.total;
    const fbSince = Date.now() - days * 86400000;
    const fbPosts = fbConnected ? fb!.posts.filter((p) => p.created_time && new Date(p.created_time).getTime() >= fbSince) : [];
    const fbCounted = fbPosts.some((p) => p.reactions != null || p.comments != null || p.shares != null);
    const fbEngagement = fbCounted ? fbPosts.reduce((a, p) => a + (p.reactions ?? 0) + (p.comments ?? 0) + (p.shares ?? 0), 0) : null;
    const fbValue = platformMetric === "engagement" ? fbEngagement : null;
    const platforms: PlatformRow[] = [
      { id: "instagram", label: "Instagram", connected: true, value: platformTotal, deltaPct: kpisAll.find((k) => k.id === "views")?.deltaPct ?? null, share: platformTotal ? 1 : 0 },
      { id: "tiktok", label: "TikTok", connected: ttConnected, value: null, deltaPct: null, share: 0 },
      { id: "facebook", label: "Facebook", connected: fbConnected, value: fbValue, deltaPct: null, share: 0 },
      { id: "youtube", label: "YouTube", connected: Boolean(yt), value: yt && platformMetric === "views" ? (yt.range?.views ?? null) : null, deltaPct: null, share: 0 },
    ];
    {
      const total = platforms.reduce((a, r) => a + (r.connected && r.value ? r.value : 0), 0);
      for (const r of platforms) r.share = total > 0 && r.connected && r.value ? r.value / total : 0;
    }

    const gs = (s: Series): GraphSeries => ({ points: s.current, label: s.label, provenance: s.provenance, trueSeries: s.provenance === "instagram_daily" || s.provenance === "snapshot", mode: s.metric === "followers" ? "last" : "sum", note: s.note });
    const igHasGains = gains.some((g) => g.value != null);
    graphAccounts.push({
      id: `instagram:${snap!.ig_user_id ?? "me"}`,
      platform: "instagram",
      label: snap!.username ? `@${snap!.username}` : "Instagram",
      series: {
        views: gs(series.views), engagement: gs(series.engagement), followers: gs(series.followers), reach: gs(series.reach),
        net_followers: { points: gains, label: "New followers", provenance: igHasGains ? "instagram_daily" : "unavailable", trueSeries: igHasGains, mode: "sum", note: "New followers per day, as Instagram reports it." },
      },
    });

    const lockedTo = (feature: Parameters<typeof canUseFeature>[1]): PlanId | null =>
      canUseFeature(ent, feature) ? null : (minPlanWithFeature(feature) ?? "starter");
    const gate: AnalyticsGate = {
      postingTimes: lockedTo("posting_time_analysis"),
      growth: lockedTo("growth_analysis"),
      comparison: lockedTo("period_comparison"),
      deeperInsights: lockedTo("deeper_insights"),
      crossPlatform: lockedTo("cross_platform_analytics"),
    };

    const d: AnalyticsData = {
      handle: snap!.username ?? null, rangeLabel, rangeDays: days, maxDays, today, firstDataDay, kpis, series, gains, insights, gaps, lockedGaps, posts, library, baseline, medianViews, breakdown, platforms, demo,
      timed, followers, followerPoints: fPoints, engagement, formats, graphAccounts, gate,
    };
    igPanel = <AnalyticsV3 d={d} />;

    igSummary.connected = true;
    igSummary.label = snap!.username ? `@${snap!.username}` : "Instagram";
    igSummary.audience = followers;
    igSummary.views = series.views.total;
    igSummary.engagement = series.engagement.total;
    igSummary.contentPublished = inRange.length;
  }

  // ---- YouTube overlay + summary ----
  const ytSummary: PlatformSummary = { platform: "youtube", connected: Boolean(yt), label: yt?.channel.title ?? "YouTube", audience: yt?.channel.subscribers ?? null, audienceLabel: "subscribers", views: yt?.range?.views ?? null, viewsNote: null, engagement: null, contentPublished: null };
  if (yt && yt.series?.length) {
    const mk = (pick: (row: YtDaily) => number, label: string, note: string): GraphSeries => ({ points: yt.series.map((dd) => ({ day: dd.day, value: pick(dd), postIds: [] })), label, provenance: "youtube_daily", trueSeries: true, mode: "sum", note });
    graphAccounts.push({
      id: "youtube:me", platform: "youtube", label: yt.channel.title ?? "YouTube",
      series: { views: mk((dd) => dd.views, "Views", "Daily views, YouTube Analytics."), watch_time: mk((dd) => dd.minutes, "Watch time", "Daily watch time (minutes), YouTube Analytics."), net_followers: mk((dd) => dd.subs, "New subscribers", "Subscribers gained per day, YouTube Analytics.") },
    });
  }

  // ---- Facebook panel + summary ----
  let fbPanel: ReactNode = null;
  const fbSummary: PlatformSummary = { platform: "facebook", connected: Boolean(fbConnected), label: fb?.page_name ?? "Facebook", audience: fb?.followers_count ?? null, audienceLabel: "followers", views: null, viewsNote: "Facebook doesn't report post views", engagement: null, contentPublished: null };
  if (fbConnected && fb) {
    // Snapshots (SOCIA's own follower history) and Page Insights (read_insights:
    // views / video views / daily follows) in parallel. Insights degrade to
    // "unavailable" when the permission isn't granted — never to zeros.
    const [fbSnaps, fbInsights] = await Promise.all([
      fb.page_id ? readPlatformSnapshots(ctx.client, ctx.ownerId, "facebook", fb.page_id).catch(() => []) : Promise.resolve([]),
      getFacebookInsights(ctx.client, ctx.ownerId, days).catch(() => null),
    ]);
    const fbData = buildFacebookAnalytics({ snap: fb, snapshots: fbSnaps, days, rangeLabel, now, insights: fbInsights });
    fbPanel = <FacebookAnalytics data={fbData} />;
    fbSummary.engagement = fbData.engagement.total;
    fbSummary.contentPublished = fbData.postsInRange;
    if (fbData.views && fbData.views.total != null) {
      fbSummary.views = fbData.views.total;
      fbSummary.viewsNote = null;
    }
    // The overlay: engagement by publish date (content totals) and, when
    // Insights serve it, a genuine daily Page-views series.
    const fbSeries: GraphAccount["series"] = {};
    if (fbData.engagement.provenance === "publish_totals") {
      fbSeries.engagement = { points: fbData.engagement.current, label: "Engagement", provenance: "publish_totals", trueSeries: false, mode: "sum", note: fbData.engagement.note };
    }
    if (fbData.views && fbData.views.provenance !== "unavailable") {
      fbSeries.views = { points: fbData.views.current, label: "Views", provenance: "platform_daily", trueSeries: true, mode: "sum", note: fbData.views.note };
    }
    graphAccounts.push({ id: "facebook:me", platform: "facebook", label: fb.page_name ?? "Facebook", series: fbSeries });
  }

  // ---- TikTok panel + summary ----
  let ttPanel: ReactNode = null;
  const ttSummary: PlatformSummary = { platform: "tiktok", connected: ttConnected, label: "TikTok", audience: null, audienceLabel: "followers", views: null, viewsNote: "TikTok reports per-video totals, not a range view count", engagement: null, contentPublished: null };
  if (ttConnected && ttRow) {
    const ttData = buildTikTokAnalytics({ row: ttRow, days, rangeLabel, now });
    ttPanel = <TikTokAnalytics data={ttData} />;
    ttSummary.label = ttData.profile.username ? `@${ttData.profile.username}` : (ttData.profile.name || "TikTok");
    ttSummary.audience = (ttRow.follower_count as number | null) ?? null;
    ttSummary.contentPublished = ttData.videosInRange;
    graphAccounts.push({ id: "tiktok:me", platform: "tiktok", label: ttSummary.label, series: {} });
  }

  // ---- Tabs, panels, All-Platforms overlay ----
  const connectedTabs: PlatformTab[] = [];
  if (live) connectedTabs.push({ id: "instagram", label: "Instagram" });
  if (fbConnected) connectedTabs.push({ id: "facebook", label: "Facebook" });
  if (yt) connectedTabs.push({ id: "youtube", label: "YouTube" });
  if (ttConnected) connectedTabs.push({ id: "tiktok", label: "TikTok" });
  const multi = connectedTabs.length >= 2;
  const tabs: PlatformTab[] = multi ? [{ id: "all", label: "All Platforms" }, ...connectedTabs] : connectedTabs;
  const validIds = new Set(tabs.map((t) => t.id));
  const initial = platformParam && validIds.has(platformParam) ? platformParam : multi ? "all" : connectedTabs[0]?.id ?? "all";

  const panels: Record<string, ReactNode> = {
    instagram: igPanel,
    facebook: fbPanel,
    youtube: yt ? <YouTubeAnalytics data={yt} rangeLabel={rangeLabel} /> : null,
    tiktok: ttPanel,
  };

  const allData = multi ? buildAllPlatforms([igSummary, fbSummary, ytSummary, ttSummary]) : null;
  const overlayLines: OverlayLine[] = graphAccounts
    .filter((a) => a.series.views && a.series.views.trueSeries)
    .map((a) => ({ id: a.id, platform: a.platform, label: a.label, points: a.series.views!.points, mode: "sum", trueSeries: true }));
  const overlay = {
    lines: overlayLines,
    note: "Daily views from the platforms that report a real daily series — Instagram and YouTube. Facebook and TikTok don't provide a daily views trend, so they aren't drawn here.",
  };

  return (
    <AppShell active="analytics" userEmail={user.email}>
      <PageHeader title="Analytics" sub="See what happened, understand why, and find what your strategy is missing." />
      <AnalyticsShell tabs={tabs} initial={initial} panels={panels} allData={allData} overlay={overlay} today={today} />
    </AppShell>
  );
}
