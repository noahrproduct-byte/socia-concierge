import { redirect } from "next/navigation";
import { Link2 } from "lucide-react";
import type { ReactNode } from "react";
import { getViewer } from "@/lib/supabase/server";
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
import PageHeader from "@/components/PageHeader";
import AnalyticsV3, { type AnalyticsData, type AnalyticsGate } from "@/components/AnalyticsV3";
import YouTubeAnalytics from "@/components/YouTubeAnalytics";
import FacebookAnalytics from "@/components/FacebookAnalytics";
import TikTokAnalytics from "@/components/TikTokAnalytics";
import AnalyticsShell from "@/components/AnalyticsShell";
import UpdatedAgo from "@/components/UpdatedAgo";
import { cachedLive, oldestFetch } from "@/lib/liveCache";
import type { PlatformTab } from "@/components/PlatformTabs";
import type { OverlayLine } from "@/components/ov/MultiLineChart";
import { getYouTubeAnalytics, type YtDaily } from "@/lib/youtubeData";
import { ytAuthConfigured } from "@/lib/youtubeAuth";
import { buildFacebookAnalytics } from "@/lib/metrics/facebook";
import { buildTikTokAnalytics } from "@/lib/metrics/tiktok";
import { buildYouTubeAnalytics } from "@/lib/metrics/youtube";
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
  const { supabase, user } = await getViewer();
  if (!user) redirect("/login");
  const ctx = await resolveContext(supabase, user.id);

  const { range: rangeParam, platform: platformParam } = await searchParams;

  // Loads are started as early as their inputs allow and awaited together, so
  // the page waits for the slowest platform rather than for each in turn.
  // Range-independent reads start now.
  const profileSnapP = Promise.all([
    getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)),
    getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null),
  ]);
  profileSnapP.catch(() => {}); // surfaced when awaited below
  const fbP = getFbSnapshot(ctx.client, ctx.ownerId).catch(() => null);
  // TikTok: the active workspace's account row (counts + videos), if any.
  const ttP: Promise<Record<string, unknown> | null> = (async () => {
    try {
      const { data } = await scopeToWorkspace(
        ctx.client.from("tiktok_connections").select("username, display_name, avatar_url, is_verified, follower_count, likes_count, video_count, videos, last_synced_at").eq("user_id", ctx.ownerId),
        ctx.workspace?.id,
      ).limit(1);
      return ((data ?? [])[0] as Record<string, unknown> | undefined) ?? null;
    } catch {
      return null; // tiktok_connections may not exist yet
    }
  })();

  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  const maxDays = maxHistoryDays(ent);
  const requestedId = RANGES.some((r) => r.id === rangeParam) ? (rangeParam as string) : "30";
  const rangeId: string = clampRangeId(requestedId, maxDays);
  const days = rangeDays(rangeId);
  const rangeLabel = RANGES.find((r) => r.id === rangeId)?.label ?? "Last 30 days";

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Live platform reads, reused for a few minutes per workspace and range
  // (lib/liveCache.ts). A guest sees the owner's data through a different
  // client, so their reads are kept apart from the owner's.
  const scope = [ctx.workspace?.id, ctx.isOwner ? "owner" : `guest:${ctx.viewerId}`];
  const ytP = cachedLive(
    ctx.ownerId, ["yt-deep", ...scope, days],
    () => getYouTubeAnalytics(ctx.client, ctx.ownerId, days, { deep: true }),
    (v) => v.note == null, // a degraded read (live call failed) is not reused
  ).catch(() => null);
  // Facebook: snapshots (SOCIA's own follower history) and Page Insights
  // (read_insights), only for a connected Page. Insights degrade to
  // "unavailable" when the permission isn't granted — never to zeros.
  const fbSnapsP = fbP.then((f) => (f?.status === "connected" && f.page_id ? readPlatformSnapshots(ctx.client, ctx.ownerId, "facebook", f.page_id).catch(() => []) : []));
  const fbInsightsP = fbP.then((f) =>
    f?.status === "connected"
      ? cachedLive(ctx.ownerId, ["fb-insights", ...scope, f.page_id, days], () => getFacebookInsights(ctx.client, ctx.ownerId, days), (v) => v.available).catch(() => null)
      : null,
  );

  const [profile, snap] = await profileSnapP;
  const live = Boolean(snap && snap.followers_count != null);

  // Instagram's stored daily rows and its (live) follower demographics.
  type IgRow = DailySnapshot & { followers_gained: number | null };
  const igExtraP = live
    ? Promise.all([
        readDailySnapshots<IgRow>(ctx.client, ctx.ownerId, snap?.ig_user_id ?? null, "day, followers, reach, views, followers_gained, source").catch(() => [] as IgRow[]),
        (getActiveConnection(ctx.client, ctx.ownerId, "access_token", ctx.workspace?.id ?? null) as Promise<{ access_token?: string } | null>).then((row) =>
          cachedLive(ctx.ownerId, ["ig-demo", ...scope, snap?.ig_user_id], () => fetchDemographics(row?.access_token ?? null), (v) => v.status === "ok"),
        ),
      ])
    : null;

  const [ytC, fb, ttRow, fbSnapsLoaded, fbInsightsC, igExtra] = await Promise.all([ytP, fbP, ttP, fbSnapsP, fbInsightsP, igExtraP]);
  const yt = ytC?.value ?? null;
  const fbConnected = fb?.status === "connected";
  const ttConnected = Boolean(ttRow);
  // How old the reused live reads on this page are (null when none were used).
  const updatedAt = oldestFetch(ytC, fbInsightsC, igExtra?.[1]);

  const connectedCount = [live, fbConnected, Boolean(yt), ttConnected].filter(Boolean).length;

  // Nothing connected: the connect wall (unchanged).
  if (connectedCount === 0) {
    const igHref = igConfigured() ? "/api/auth/instagram/start" : "/settings";
    const ytHref = ytAuthConfigured() ? "/api/auth/youtube/start" : "/settings";
    return (
      <>
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
      </>
    );
  }

  // Which analytics sections the plan unlocks — the same gates on every
  // platform's page. A locked section names the plan that opens it.
  const lockedTo = (feature: Parameters<typeof canUseFeature>[1]): PlanId | null =>
    canUseFeature(ent, feature) ? null : (minPlanWithFeature(feature) ?? "starter");
  const gate: AnalyticsGate = {
    postingTimes: lockedTo("posting_time_analysis"),
    growth: lockedTo("growth_analysis"),
    comparison: lockedTo("period_comparison"),
    deeperInsights: lockedTo("deeper_insights"),
    crossPlatform: lockedTo("cross_platform_analytics"),
  };

  // Every overlay line is laid on the SAME day axis (the range ending today), so
  // lines from platforms that report with a delay line up by date instead of by
  // position. A day a platform hasn't reported is a gap (null), never a zero.
  const axisEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const axisDays = Array.from({ length: days }, (_, i) => new Date(axisEnd - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10));
  const onAxis = (pts: SeriesPoint[]): SeriesPoint[] => {
    const m = new Map(pts.map((p) => [p.day, p]));
    return axisDays.map((d) => m.get(d) ?? { day: d, value: null, postIds: [] });
  };

  // Accounts the Performance graph can overlay. Only platforms with a real
  // per-day series contribute a line; the rest are honest gaps.
  const graphAccounts: GraphAccount[] = [];

  // ---- Instagram panel + summary (full existing experience, only when live) ----
  let igPanel: ReactNode = null;
  const igSummary: PlatformSummary = { platform: "instagram", connected: false, label: "Instagram", audience: null, audienceLabel: "followers", views: null, viewsNote: null, engagement: null, contentPublished: null };

  if (live) {
    const media: IgMediaItem[] = snap!.media ?? [];
    const followers = snap!.followers_count ?? null;
    const dailyRows = igExtra?.[0] ?? [];
    const demo = igExtra?.[1]?.value ?? (await fetchDemographics(null));

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

    // "What changed": the period's headline numbers against the one before,
    // from totals already computed above. No previous period → no delta shown.
    const pctChg = (cur: number | null, prev: number | null) => {
      if (cur == null || prev == null || prev <= 0) return { delta: null as string | null, positive: null as boolean | null };
      const p = ((cur - prev) / prev) * 100;
      if (Math.abs(p) < 0.05) return { delta: null, positive: null };
      return { delta: `${p >= 0 ? "↑" : "↓"} ${Math.abs(p).toFixed(Math.abs(p) >= 100 ? 0 : 1)}%`, positive: p >= 0 };
    };
    const fmtN = (n: number) => (n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}K` : n.toLocaleString("en-US"));
    const prevSince = since - days * DAY_MS;
    const prevPosts = media.filter((m) => m.timestamp && new Date(m.timestamp).getTime() >= prevSince && new Date(m.timestamp).getTime() < since);
    const oldestTs = media.filter((m) => m.timestamp).map((m) => new Date(m.timestamp!).getTime()).sort((a, b) => a - b)[0];
    const prevPostsKnown = oldestTs != null && (oldestTs <= prevSince || prevPosts.length > 0);
    const rangeStartDay = new Date(since).toISOString().slice(0, 10);
    const follInRange = fPoints.filter((p) => p.day >= rangeStartDay);
    const follNet = follInRange.length >= 2 ? follInRange[follInRange.length - 1].followers - follInRange[0].followers : null;
    const changes: NonNullable<AnalyticsData["changes"]> = [];
    for (const m of ["views", "reach", "engagement"] as const) {
      const s = series[m];
      if (s.total == null) continue;
      changes.push({ key: m, label: m === "engagement" ? "Interactions" : s.label, current: fmtN(s.total), previous: s.prevTotal != null ? fmtN(s.prevTotal) : null, ...pctChg(s.total, s.prevTotal) });
    }
    if (follNet != null) changes.push({ key: "followers", label: "Followers (net)", current: `${follNet >= 0 ? "+" : "−"}${Math.abs(follNet).toLocaleString("en-US")}`, previous: null, delta: null, positive: null });
    {
      const diff = prevPostsKnown ? inRange.length - prevPosts.length : null;
      changes.push({ key: "posts", label: "Posts published", current: String(inRange.length), previous: prevPostsKnown ? String(prevPosts.length) : null, delta: diff != null && diff !== 0 ? `${diff > 0 ? "↑" : "↓"} ${Math.abs(diff)}` : null, positive: diff != null && diff !== 0 ? diff > 0 : null });
    }
    // One plain "do this next": the top-ranked gap's action, else the first
    // insight's recommendation. Both are already tied to this account's data.
    const nextStep = gaps[0]?.action ?? insights[0]?.recommendation ?? null;

    const d: AnalyticsData = {
      handle: snap!.username ?? null, rangeLabel, rangeDays: days, maxDays, today, firstDataDay, kpis, series, gains, insights, gaps, lockedGaps, posts, library, baseline, medianViews, breakdown, platforms, demo,
      timed, followers, followerPoints: fPoints, engagement, formats, graphAccounts, gate, changes, nextStep,
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
    const mk = (pick: (row: YtDaily) => number, label: string, note: string): GraphSeries => ({ points: onAxis(yt.series.map((dd) => ({ day: dd.day, value: pick(dd), postIds: [] }))), label, provenance: "youtube_daily", trueSeries: true, mode: "sum", note });
    graphAccounts.push({
      id: "youtube:me", platform: "youtube", label: yt.channel.title ?? "YouTube",
      series: { views: mk((dd) => dd.views, "Views", "Daily views, YouTube Analytics."), watch_time: mk((dd) => dd.minutes, "Watch time", "Daily watch time (minutes), YouTube Analytics."), net_followers: mk((dd) => dd.subs, "New subscribers", "Subscribers gained per day, YouTube Analytics.") },
    });
  }

  // ---- Facebook panel + summary ----
  let fbPanel: ReactNode = null;
  const fbSummary: PlatformSummary = { platform: "facebook", connected: Boolean(fbConnected), label: fb?.page_name ?? "Facebook", audience: fb?.followers_count ?? null, audienceLabel: "followers", views: null, viewsNote: "Facebook doesn't report post views", engagement: null, contentPublished: null };
  if (fbConnected && fb) {
    const fbSnaps = fbSnapsLoaded;
    const fbInsights = fbInsightsC?.value ?? null;
    const fbData = buildFacebookAnalytics({ snap: fb, snapshots: fbSnaps, days, rangeLabel, now, insights: fbInsights });
    fbPanel = <FacebookAnalytics data={fbData} gate={gate} maxDays={maxDays} />;
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
      fbSeries.views = { points: onAxis(fbData.views.current), label: "Views", provenance: "platform_daily", trueSeries: true, mode: "sum", note: fbData.views.note };
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
    youtube: yt ? <YouTubeAnalytics data={buildYouTubeAnalytics({ yt, days, rangeLabel, now })} gate={gate} maxDays={maxDays} /> : null,
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
    <>
      <PageHeader title="Analytics" sub="See what happened, understand why, and find what your strategy is missing." status={<UpdatedAgo at={updatedAt} />} />
      <AnalyticsShell tabs={tabs} initial={initial} panels={panels} allData={allData} overlay={overlay} today={today} />
    </>
  );
}
