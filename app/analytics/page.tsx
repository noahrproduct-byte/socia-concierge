import { redirect } from "next/navigation";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
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
import { getYouTubeAnalytics } from "@/lib/youtubeData";
import { ytAuthConfigured } from "@/lib/youtubeAuth";
import type { LibraryPost } from "@/components/ContentLibrary";
import {
  RANGES, rangeDays, clampRangeId, postCards, buildKpis, buildSeries, buildInsights, formatBreakdown, formatOf, DAY_MS, type PlatformRow, type MetricId,
} from "@/lib/overview";
import { canUseFeature, getEntitlements, maxHistoryDays } from "@/lib/entitlements";
import { assembleAnalytics } from "@/lib/analytics/assemble";
import UniversalAnalytics from "@/components/analytics/UniversalAnalytics";

export const metadata = { title: "Analytics — SOCIA" };

// Analytics. The pipeline is fixed: platform rows → normalized posts and daily
// snapshots → deterministic aggregation (medians, buckets, gaps) → rendered →
// AI only ever explains. Nothing on this page is estimated.
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string; v?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { range: rangeParam, v: version } = await searchParams;
  const [profile, snap, ent] = await Promise.all([
    getProfile(supabase, user.id),
    getIgSnapshot(supabase, user.id),
    getEntitlements(supabase, user.id),
  ]);
  // History is limited per plan here, on the server: a ?range= beyond the
  // plan's window is served as the longest range the plan includes.
  const maxDays = maxHistoryDays(ent);
  const requestedId = RANGES.some((r) => r.id === rangeParam) ? (rangeParam as string) : "30";
  const rangeId: string = clampRangeId(requestedId, maxDays);
  const days = rangeDays(rangeId);
  const rangeLabel = RANGES.find((r) => r.id === rangeId)?.label ?? "Last 30 days";

  // Universal Analytics shell (dev preview behind ?v=2). Renders every connected
  // platform through the normalized adapter bundle. The live 5-tab Instagram
  // page below is untouched until the shell reaches parity.
  if (version === "2") {
    const { accounts } = await assembleAnalytics(supabase, user.id, days);
    if (!accounts.length) {
      return (
        <AppShell active="analytics" userEmail={user.email}>
          <PageHeader title="Analytics" sub="See what happened, understand why, and find what your strategy is missing." />
          <div className="db-connect">
            <span className="db-connect-ico"><Link2 size={22} /></span>
            <div className="db-connect-copy">
              <h2>Connect an account to see your analytics</h2>
              <p>Analytics fills with your real numbers the moment you connect a platform. Nothing here is estimated.</p>
            </div>
            <span className="db-connect-actions">
              <a href={igConfigured() ? "/api/auth/instagram/start" : "/settings"} className="db-connect-cta">Connect Instagram</a>
              <a href={ytAuthConfigured() ? "/api/auth/youtube/start" : "/settings"} className="db-connect-cta ghost">Connect YouTube</a>
            </span>
          </div>
        </AppShell>
      );
    }
    return (
      <AppShell active="analytics" userEmail={user.email}>
        <UniversalAnalytics
          accounts={accounts}
          rangeLabel={rangeLabel}
          rangeDays={days}
          maxDays={maxDays}
          canCrossPlatform={canUseFeature(ent, "cross_platform_analytics")}
        />
      </AppShell>
    );
  }

  const live = Boolean(snap && snap.followers_count != null);
  // The connected user's own YouTube channel, when they have linked one. Null
  // when no YouTube connection exists, so the page stays multi-platform aware.
  const yt = await getYouTubeAnalytics(supabase, user.id, days).catch(() => null);

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
    readDailySnapshots<Row>(supabase, user.id, snap?.ig_user_id ?? null, "day, followers, reach, views, followers_gained, source").catch(() => [] as Row[]),
    getActiveConnection(supabase, user.id, "access_token") as Promise<{ access_token?: string } | null>,
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
  // Free sees its top gap in full; the rest stay on the server and only their
  // real count travels to the client. Paid plans get every gap, as before.
  const holdBack = ent.plan === "free" && allGaps.length > 1;
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
  const fb = await getFbSnapshot(supabase, user.id).catch(() => null);
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

  const d: AnalyticsData = {
    handle: snap!.username ?? null, rangeLabel, rangeDays: days, maxDays, today, firstDataDay, kpis, series, gains, insights, gaps, lockedGaps, posts, library, baseline, medianViews, breakdown, platforms, demo,
    timed, followers, followerPoints: fPoints, engagement, formats,
  };

  return (
    <AppShell active="analytics" userEmail={user.email}>
      <AnalyticsV3 d={d} />
      {yt && <YouTubeAnalytics data={yt} rangeLabel={rangeLabel} />}
    </AppShell>
  );
}
