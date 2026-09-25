import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements, clampDays } from "@/lib/entitlements";
import { getIgSnapshot, readDailySnapshots } from "@/lib/instagramSync";
import { computeContentScore } from "@/lib/contentScore";
import {
  getFollowers,
  getFollowerGrowth,
  getFollowersGained,
  getPostsPublished,
  getLifetimePosts,
  getAverageLikes,
  getEngagementRate,
  getPerformanceBaseline,
  getTopPosts,
  getBestPostingWindow,
  getReach,
  getCompetitorActivity,
  type AccountInput,
  type DailySnapshot,
} from "@/lib/dashboardMetrics";

export const runtime = "nodejs";
export const maxDuration = 60;

// Development data inspector: every dashboard value with its provenance,
// formula and sample size. Never returns tokens or secrets.
export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Same history window as every rendered page: the plan's limit, never the query string's.
  const ent = await getEntitlements(supabase, user.id);
  const requested = Number(new URL(req.url).searchParams.get("range") ?? 30);
  const days = clampDays(ent, Number.isFinite(requested) ? Math.max(1, Math.min(365, Math.floor(requested))) : 30);
  const snap = await getIgSnapshot(supabase, user.id).catch(() => null);

  let daily: DailySnapshot[] = [];
  try {
    daily = await readDailySnapshots<DailySnapshot>(
      supabase,
      user.id,
      snap?.ig_user_id ?? null,
      "day, followers, reach, views, followers_gained, source",
    );
  } catch {
    /* audit still reports the rest */
  }

  const acct: AccountInput = {
    followers: snap?.followers_count ?? null,
    lifetimePosts: snap?.media_count ?? null,
    posts: snap?.media ?? [],
    daily,
    syncedAt: snap?.last_synced_at ?? null,
    platform: "instagram",
    handle: snap?.username ?? null,
  };

  const top = getTopPosts(acct, 1);
  const score = computeContentScore(
    acct.posts,
    acct.followers,
    daily.filter((d) => d.reach != null).map((d) => d.reach!),
  );

  return NextResponse.json({
    account: { platform: "instagram", handle: acct.handle, synced_at: acct.syncedAt },
    period_days: days,
    metrics: {
      total_followers: getFollowers(acct),
      follower_growth_exact: getFollowerGrowth(acct, days),
      followers_gained: getFollowersGained(acct, days),
      posts_published_in_period: getPostsPublished(acct, days),
      lifetime_posts: getLifetimePosts(acct),
      avg_likes_per_post: getAverageLikes(acct),
      engagement_rate: getEngagementRate(acct),
      performance_baseline: getPerformanceBaseline(acct),
      reach: getReach(acct, days),
      best_posting_window: getBestPostingWindow(acct),
      competitor_activity: getCompetitorActivity(),
    },
    top_post: top.rows[0]
      ? {
          engagement: top.rows[0].engagement,
          multiplier: top.rows[0].multiplier,
          baseline: top.baseline.value,
          method: `${top.rows[0].engagement} ÷ ${top.baseline.value} (median) = ${top.rows[0].multiplier?.toFixed(4)}`,
          status: "CALCULATED",
        }
      : { status: "UNAVAILABLE", method: "no posts synced" },
    content_score: score
      ? { value: score.score, status: "CALCULATED", method: score.method, dims: score.dims, sample: score.sampleSize }
      : { status: "UNAVAILABLE", method: "fewer than 5 synced posts or no follower count" },
  });
}
