import { redirect } from "next/navigation";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { igConfigured } from "@/lib/instagram";
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
import type { LibraryPost } from "@/components/ContentLibrary";
import {
  RANGES, rangeDays, postCards, buildKpis, buildSeries, buildInsights, formatBreakdown, formatOf, DAY_MS, type PlatformRow, type MetricId,
} from "@/lib/overview";

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

  const { range: rangeParam } = await searchParams;
  const rangeId = (RANGES.some((r) => r.id === rangeParam) ? rangeParam : "30") as string;
  const days = rangeDays(rangeId);
  const rangeLabel = RANGES.find((r) => r.id === rangeId)?.label ?? "Last 30 days";

  const [profile, snap] = await Promise.all([getProfile(supabase, user.id), getIgSnapshot(supabase, user.id)]);
  const live = Boolean(snap && snap.followers_count != null);

  if (!live) {
    const igHref = igConfigured() ? "/api/auth/instagram/start" : "/settings";
    return (
      <AppShell active="analytics" userEmail={user.email}>
        <PageHeader title="Analytics" sub="See what happened, understand why, and find what your strategy is missing." />
        <div className="db-connect">
          <span className="db-connect-ico"><Link2 size={22} /></span>
          <div className="db-connect-copy">
            <h2>Connect your Instagram account</h2>
            <p>Analytics fills with your real views, reach, engagement and audience the moment an account is connected, and SOCIA starts recording your follower count daily from that moment. Nothing here is estimated.</p>
          </div>
          <Link href={igHref} className="db-connect-cta">Connect Instagram</Link>
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
  const gaps = buildGaps({ media, followers, goals: profile?.goals ?? null, location, frequencyTarget: Number.isFinite(frequencyTarget) ? frequencyTarget : null, now });
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
  const platforms: PlatformRow[] = [
    { id: "instagram", label: "Instagram", connected: true, value: platformTotal, deltaPct: kpisAll.find((k) => k.id === "views")?.deltaPct ?? null, share: platformTotal ? 1 : 0 },
    { id: "tiktok", label: "TikTok", connected: false, value: null, deltaPct: null, share: 0 },
    { id: "facebook", label: "Facebook", connected: false, value: null, deltaPct: null, share: 0 },
    { id: "youtube", label: "YouTube", connected: false, value: null, deltaPct: null, share: 0 },
  ];

  const d: AnalyticsData = {
    handle: snap!.username ?? null, rangeLabel, rangeDays: days, today, firstDataDay, kpis, series, gains, insights, gaps, posts, library, baseline, medianViews, breakdown, platforms, demo,
    timed, followers, followerPoints: fPoints, engagement, formats,
  };

  return (
    <AppShell active="analytics" userEmail={user.email}>
      <AnalyticsV3 d={d} />
    </AppShell>
  );
}
