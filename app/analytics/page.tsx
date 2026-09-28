import { redirect } from "next/navigation";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getProfile } from "@/lib/profile";
import { igConfigured } from "@/lib/instagram";
import { getFbSnapshot } from "@/lib/facebookSync";
import { getIgSnapshot, readDailySnapshots, getActiveConnection, type IgMediaItem } from "@/lib/instagramSync";
import type { DailySnapshot } from "@/lib/dashboardMetrics";
import { median } from "@/lib/metrics";
import { interactionsTotal, engagementRateOf, engagementBreakdown, engagementQuality } from "@/lib/engagement";
import { followerPoints } from "@/lib/followers";
import { buildGaps } from "@/lib/gaps";
import { fetchDemographics } from "@/lib/igDemographics";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";
import AnalyticsV3, { type AnalyticsData } from "@/components/AnalyticsV3";
import YouTubeAnalytics from "@/components/YouTubeAnalytics";
import { getYouTubeAnalytics, type YtDaily } from "@/lib/youtubeData";
import { ytAuthConfigured } from "@/lib/youtubeAuth";
import type { LibraryPost } from "@/components/ContentLibrary";
import {
  RANGES, rangeDays, clampRangeId, postCards, buildKpis, buildSeries, buildInsights, formatBreakdown, formatOf, DAY_MS, type PlatformRow, type MetricId, type Series, type SeriesPoint, type GraphAccount, type GraphSeries,
} from "@/lib/overview";
import { canUseFeature, getEntitlements, maxHistoryDays } from "@/lib/entitlements";

export const metadata = { title: "Analytics — SOCIA" };

// Analytics. The pipeline is fixed: platform rows → normalized posts and daily
// snapshots → deterministic aggregation (medians, buckets, gaps) → rendered →
// AI only ever explains. Nothing on this page is estimated.
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Everything below reads the ACTIVE Brand Workspace: the viewer's own data,
  // or the owner's when they were invited into someone else's workspace.
  const ctx = await resolveContext(supabase, user.id);

  const { range: rangeParam } = await searchParams;
  const [profile, snap, ent] = await Promise.all([
    getProfile(ctx.client, ctx.ownerId),
    getIgSnapshot(ctx.client, ctx.ownerId),
    getEntitlements(ctx.client, ctx.ownerId),
  ]);
  // History is limited per plan here, on the server: a ?range= beyond the
  // plan's window is served as the longest range the plan includes.
  const maxDays = maxHistoryDays(ent);
  const requestedId = RANGES.some((r) => r.id === rangeParam) ? (rangeParam as string) : "30";
  const rangeId: string = clampRangeId(requestedId, maxDays);
  const days = rangeDays(rangeId);
  const rangeLabel = RANGES.find((r) => r.id === rangeId)?.label ?? "Last 30 days";
  const live = Boolean(snap && snap.followers_count != null);
  // The connected user's own YouTube channel, when they have linked one. Null
  // when no YouTube connection exists, so the page stays multi-platform aware.
  const yt = await getYouTubeAnalytics(ctx.client, ctx.ownerId, days).catch(() => null);

  if (!live) {
    // No Instagram, but a YouTube channel is connected: show its analytics
    // instead of forcing an Instagram connection.
    if (yt) {
      return (
        <AppShell active="analytics" userEmail={user.email}>
          <PageHeader title="Analytics" sub="See what happened, understand why, and find what your strategy is missing." />
          <YouTubeAnalytics data={yt} rangeLabel={rangeLabel} />
        </AppShell>
      );
    }
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
          {/* plain anchors: /api/auth routes must not be Link-prefetched */}
          <span className="db-connect-actions">
            <a href={igHref} className="db-connect-cta">Connect Instagram</a>
            <a href={ytHref} className="db-connect-cta ghost">Connect YouTube</a>
          </span>
        </div>
      </AppShell>
    );
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const media: IgMediaItem[] = snap!.media ?? [];
  const followers = snap!.followers_count ?? null;
  type Row = DailySnapshot & { followers_gained: number | null };
  const [dailyRows, tokenRow] = await Promise.all([
    readDailySnapshots<Row>(ctx.client, ctx.ownerId, snap?.ig_user_id ?? null, "day, followers, reach, views, followers_gained, source").catch(() => [] as Row[]),
    getActiveConnection(ctx.client, ctx.ownerId, "access_token") as Promise<{ access_token?: string } | null>,
  ]);
  const demo = await fetchDemographics(tokenRow?.access_token ?? null);

  // Baseline = the median post's interactions (likes + comments + saves + shares).
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
  // Without the deeper-insights feature (Free) the person sees their top gap in
  // full; the rest stay on the server and only their real count travels to the
  // client. Plans with the feature get every gap.
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
  // Facebook: the connected Page's own engagement (reactions + comments +
  // shares on posts inside the range), as Meta reports it. Facebook exposes
  // no view count for regular Page posts, so under the views metric the row
  // is connected but unmeasured, never zero.
  const fb = await getFbSnapshot(ctx.client, ctx.ownerId).catch(() => null);
  const fbConnected = fb?.status === "connected";
  const fbSince = Date.now() - (days) * 86400000;
  const fbPosts = fbConnected ? fb!.posts.filter((p) => p.created_time && new Date(p.created_time).getTime() >= fbSince) : [];
  const fbCounted = fbPosts.some((p) => p.reactions != null || p.comments != null || p.shares != null);
  const fbEngagement = fbCounted ? fbPosts.reduce((a, p) => a + (p.reactions ?? 0) + (p.comments ?? 0) + (p.shares ?? 0), 0) : null;
  const fbValue = platformMetric === "engagement" ? fbEngagement : null;
  const fbRow: PlatformRow = { id: "facebook", label: "Facebook", connected: fbConnected, value: fbValue, deltaPct: null, share: 0 };
  const platforms: PlatformRow[] = [
    { id: "instagram", label: "Instagram", connected: true, value: platformTotal, deltaPct: kpisAll.find((k) => k.id === "views")?.deltaPct ?? null, share: platformTotal ? 1 : 0 },
    { id: "tiktok", label: "TikTok", connected: false, value: null, deltaPct: null, share: 0 },
    fbRow,
    { id: "youtube", label: "YouTube", connected: Boolean(yt), value: yt && platformMetric === "views" ? (yt.range?.views ?? null) : null, deltaPct: null, share: 0 },
  ];
  {
    const total = platforms.reduce((a, r) => a + (r.connected && r.value ? r.value : 0), 0);
    for (const r of platforms) r.share = total > 0 && r.connected && r.value ? r.value / total : 0;
  }

  // Connected accounts the Performance Over Time graph can overlay. Only
  // Instagram and YouTube carry real per-day series; Facebook/TikTok are listed
  // (so they're selectable) but with no series — the graph says "no daily trend"
  // rather than inventing a line. Built from data already fetched above.
  const gs = (s: Series): GraphSeries => ({ points: s.current, label: s.label, provenance: s.provenance, trueSeries: s.provenance === "instagram_daily" || s.provenance === "snapshot", mode: s.metric === "followers" ? "last" : "sum", note: s.note });
  const igHasGains = gains.some((g) => g.value != null);
  const graphAccounts: GraphAccount[] = [
    {
      id: `instagram:${snap!.ig_user_id ?? "me"}`,
      platform: "instagram",
      label: snap!.username ? `@${snap!.username}` : "Instagram",
      series: {
        views: gs(series.views), engagement: gs(series.engagement), followers: gs(series.followers), reach: gs(series.reach),
        net_followers: { points: gains, label: "New followers", provenance: igHasGains ? "instagram_daily" : "unavailable", trueSeries: igHasGains, mode: "sum", note: "New followers per day, as Instagram reports it." },
      },
    },
  ];
  if (yt && yt.series?.length) {
    const mk = (pick: (row: YtDaily) => number, label: string, note: string): GraphSeries => ({ points: yt.series.map((dd) => ({ day: dd.day, value: pick(dd), postIds: [] })), label, provenance: "youtube_daily", trueSeries: true, mode: "sum", note });
    graphAccounts.push({
      id: "youtube:me", platform: "youtube", label: yt.channel.title ?? "YouTube",
      series: { views: mk((dd) => dd.views, "Views", "Daily views, YouTube Analytics."), watch_time: mk((dd) => dd.minutes, "Watch time", "Daily watch time (minutes), YouTube Analytics."), net_followers: mk((dd) => dd.subs, "New subscribers", "Subscribers gained per day, YouTube Analytics.") },
    });
  }
  if (fbConnected) {
    // Facebook has no daily series, but its per-post engagement (reactions +
    // comments + shares) can be plotted by publish date — content totals on the
    // day posted, exactly like Instagram's Engagement series. Unknown post
    // metrics are excluded (a day with only unknown counts stays null, not 0).
    const fbDayEng = new Map<string, number>();
    for (const p of fb!.posts) {
      if (!p.created_time) continue;
      const parts = [p.reactions, p.comments, p.shares].filter((v): v is number => v != null);
      if (!parts.length) continue;
      const day = new Date(p.created_time).toISOString().slice(0, 10);
      fbDayEng.set(day, (fbDayEng.get(day) ?? 0) + parts.reduce((a, b) => a + b, 0));
    }
    const fbEngPoints: SeriesPoint[] = series.engagement.current.map((pt) => ({ day: pt.day, value: fbDayEng.has(pt.day) ? fbDayEng.get(pt.day)! : null, postIds: [] }));
    const fbHasEng = fbEngPoints.some((p) => p.value != null);
    graphAccounts.push({
      id: "facebook:me", platform: "facebook", label: fb!.page_name ?? "Facebook",
      series: fbHasEng
        ? { engagement: { points: fbEngPoints, label: "Engagement", provenance: "publish_totals", trueSeries: false, mode: "sum", note: "Reactions + comments + shares on each Facebook post, placed on the day it was published." } }
        : {},
    });
  }
  try {
    const { data: tt } = await ctx.client.from("tiktok_connections").select("username, display_name").eq("user_id", ctx.ownerId).maybeSingle();
    if (tt) graphAccounts.push({ id: "tiktok:me", platform: "tiktok", label: tt.username ? `@${tt.username}` : (tt.display_name || "TikTok"), series: {} });
  } catch { /* tiktok_connections may not exist yet */ }

  const d: AnalyticsData = {
    handle: snap!.username ?? null, rangeLabel, rangeDays: days, maxDays, today, firstDataDay, kpis, series, gains, insights, gaps, lockedGaps, posts, library, baseline, medianViews, breakdown, platforms, demo,
    timed, followers, followerPoints: fPoints, engagement, formats, graphAccounts,
  };

  return (
    <AppShell active="analytics" userEmail={user.email}>
      <AnalyticsV3 d={d} />
      {yt && <YouTubeAnalytics data={yt} rangeLabel={rangeLabel} />}
    </AppShell>
  );
}
