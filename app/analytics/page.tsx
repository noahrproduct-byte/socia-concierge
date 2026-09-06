import { redirect } from "next/navigation";
import Link from "next/link";
import { Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { igConfigured } from "@/lib/instagram";
import { getIgSnapshot, readDailySnapshots, getActiveConnection } from "@/lib/instagramSync";
import { getPerformanceBaseline, type AccountInput, type DailySnapshot } from "@/lib/dashboardMetrics";
import { median, engagementOf } from "@/lib/metrics";
import { fetchDemographics } from "@/lib/igDemographics";
import AppShell from "@/components/AppShell";
import AnalyticsV3, { type AnalyticsData } from "@/components/AnalyticsV3";
import {
  RANGES, rangeDays, postCards, buildKpis, buildSeries, buildInsights, formatBreakdown, type PlatformRow, type MetricId,
} from "@/lib/overview";

export const metadata = { title: "Analytics — SOCIA" };

// Analytics: investigate performance. Deeper than the dashboard, same rule —
// every figure computed from the account's own rows, labelled with its source.
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
        <div className="dv-head">
          <div>
            <h1>Analytics</h1>
            <p>Understand what&apos;s working, what&apos;s not, and where to grow.</p>
          </div>
        </div>
        <div className="db-connect">
          <span className="db-connect-ico"><Link2 size={22} /></span>
          <div className="db-connect-copy">
            <h2>Connect your Instagram account</h2>
            <p>Analytics fills with your real views, reach, engagement and audience the moment an account is connected. Nothing here is estimated.</p>
          </div>
          <Link href={igHref} className="db-connect-cta">Connect Instagram</Link>
        </div>
      </AppShell>
    );
  }

  const media = snap!.media ?? [];
  const [dailyRows, tokenRow] = await Promise.all([
    readDailySnapshots<DailySnapshot>(supabase, user.id, snap?.ig_user_id ?? null, "day, followers, reach, views, followers_gained, source").catch(() => [] as DailySnapshot[]),
    getActiveConnection(supabase, user.id, "access_token") as Promise<{ access_token?: string } | null>,
  ]);
  const demo = await fetchDemographics(tokenRow?.access_token ?? null);

  const acct: AccountInput = {
    followers: snap!.followers_count ?? null, lifetimePosts: snap!.media_count ?? null, posts: media, daily: dailyRows,
    syncedAt: snap!.last_synced_at ?? null, platform: "instagram", handle: snap!.username ?? null,
  };
  const baseline = getPerformanceBaseline(acct).value;
  const posts = postCards(media, baseline);
  const medianViews = median(posts.map((p) => p.views).filter((v): v is number => v != null));

  const kpisAll = buildKpis({ media, daily: dailyRows, followers: snap!.followers_count ?? null, days });
  const kpis = (["views", "engagement_rate", "followers", "reach"] as const).map((id) => kpisAll.find((k) => k.id === id)!);
  const metrics: MetricId[] = ["views", "engagement", "followers", "reach"];
  const series = Object.fromEntries(metrics.map((m) => [m, buildSeries(m, media, dailyRows, days)])) as AnalyticsData["series"];

  const insights = buildInsights({ media, baseline, location: profile?.brand_detail?.location ?? null, handle: snap!.username ?? null });
  const breakdown = formatBreakdown(media, days);

  const fs = series.followers.current.filter((p) => p.value != null);
  const followerDelta = fs.length >= 2 ? fs[fs.length - 1].value! - fs[0].value! : null;

  const platformMetric = series.views.total != null ? "views" : "engagement";
  const platformTotal = platformMetric === "views" ? series.views.total : series.engagement.total;
  const platforms: PlatformRow[] = [
    { id: "instagram", label: "Instagram", connected: true, value: platformTotal, deltaPct: kpisAll.find((k) => k.id === "views")?.deltaPct ?? null, share: platformTotal ? 1 : 0 },
    { id: "tiktok", label: "TikTok", connected: false, value: null, deltaPct: null, share: 0 },
    { id: "facebook", label: "Facebook", connected: false, value: null, deltaPct: null, share: 0 },
    { id: "youtube", label: "YouTube", connected: false, value: null, deltaPct: null, share: 0 },
  ];

  const d: AnalyticsData = {
    handle: snap!.username ?? null, rangeLabel, rangeDays: days, kpis, series, insights, posts, baseline, medianViews, breakdown, platforms, demo,
    timed: media.filter((m) => m.timestamp).map((m) => ({ t: m.timestamp!, e: engagementOf(m) })),
    followerDelta, followers: snap!.followers_count ?? null,
  };

  return (
    <AppShell active="analytics" userEmail={user.email}>
      <AnalyticsV3 d={d} />
    </AppShell>
  );
}
