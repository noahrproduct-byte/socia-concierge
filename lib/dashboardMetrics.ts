// Central analytics service. Every dashboard/analytics number comes from here
// so the same metric can never be computed two different ways in two places.
//
// Each value carries provenance:
//   VERIFIED    — returned directly by the platform API
//   CALCULATED  — derived mathematically from verified data
//   AI_DERIVED  — scored by SOCIA from verified inputs
//   UNAVAILABLE — platform doesn't provide it / not enough data
//
// null is never coerced to 0. "Unavailable" and "confirmed zero" are distinct.

import { engagementOf, pctChange, type PostLike } from "./metrics";
import { bestWindow, type TimedPost } from "./bestTime";

export type Status = "VERIFIED" | "CALCULATED" | "AI_DERIVED" | "UNAVAILABLE";

export type Metric<T = number> = {
  value: T | null;
  status: Status;
  /** Where it came from, e.g. "Instagram Graph API: me.followers_count". */
  source: string;
  /** Exact arithmetic, for the debug inspector and tooltips. */
  method: string;
  /** Human period description shown next to the value. */
  period: string;
  /** How many observations back it. */
  sampleSize: number | null;
};

const M = <T,>(
  value: T | null,
  status: Status,
  source: string,
  method: string,
  period: string,
  sampleSize: number | null = null,
): Metric<T> => ({ value, status, source, method, period, sampleSize });

export const UNAVAILABLE = <T,>(source: string, why: string): Metric<T> =>
  M<T>(null, "UNAVAILABLE", source, why, "—", null);

export type DailySnapshot = {
  day: string;
  followers: number | null;
  reach: number | null;
  views: number | null;
  followers_gained: number | null;
  /** `instagram_api` = Meta's finalised daily series. Anything else is a
   *  point-in-time observation and must not be charted as a daily value. */
  source: string | null;
};

export type AccountInput = {
  followers: number | null;
  /** Instagram's lifetime media_count — NOT posts in a period. */
  lifetimePosts: number | null;
  posts: PostLike[];
  daily: DailySnapshot[];
  syncedAt: string | null;
  platform: string;
  handle: string | null;
};

const inPeriod = (p: PostLike, days: number, now = Date.now()) => {
  if (!p.timestamp) return false;
  const t = new Date(p.timestamp).getTime();
  return !isNaN(t) && t >= now - days * 86400000 && t <= now;
};

/** Followers — verified straight from the platform. */
export function getFollowers(a: AccountInput): Metric {
  if (a.followers == null) return UNAVAILABLE("Instagram API", "followers_count not returned");
  return M(
    a.followers,
    "VERIFIED",
    `Instagram API · ${a.handle ? "@" + a.handle : "connected account"}`,
    "followers_count as returned by the platform",
    "current",
    null,
  );
}

/** Follower growth — real snapshots only; gains history is a separate metric. */
export function getFollowerGrowth(a: AccountInput, days: number): Metric {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const withTotals = a.daily.filter((d) => d.followers != null);
  const before = withTotals.filter((d) => d.day <= cutoff);
  if (!before.length || a.followers == null) {
    return UNAVAILABLE(
      "SOCIA daily snapshots",
      `no exact follower snapshot from ${days}+ days ago yet — history is still building`,
    );
  }
  const baseline = before[before.length - 1].followers!;
  return M(
    a.followers - baseline,
    "CALCULATED",
    "SOCIA daily snapshots",
    `${a.followers} (today) − ${baseline} (${before[before.length - 1].day})`,
    `last ${days} days`,
    withTotals.length,
  );
}

/** New followers from Instagram's daily follower_count series (gains only). */
export function getFollowersGained(a: AccountInput, days: number): Metric {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = a.daily.filter((d) => d.day >= cutoff && d.followers_gained != null);
  if (!rows.length) return UNAVAILABLE("Instagram API: follower_count/day", "no daily series stored yet");
  const total = rows.reduce((s, r) => s + (r.followers_gained ?? 0), 0);
  return M(
    total,
    "VERIFIED",
    "Instagram API: follower_count (period=day)",
    `sum of ${rows.length} daily values (gains only — unfollows are not published)`,
    `last ${days} days`,
    rows.length,
  );
}

/** Posts actually published inside the period (never lifetime media_count). */
export function getPostsPublished(a: AccountInput, days: number): Metric {
  const n = a.posts.filter((p) => inPeriod(p, days)).length;
  return M(
    n,
    "CALCULATED",
    "Instagram API: me/media timestamps",
    `count of synced posts with timestamp inside the last ${days} days; Instagram's media list omits stories and collab posts published by a partner account`,
    `last ${days} days`,
    a.posts.length,
  );
}

/** Instagram's lifetime post count — a different metric, labeled as such. */
export function getLifetimePosts(a: AccountInput): Metric {
  if (a.lifetimePosts == null) return UNAVAILABLE("Instagram API", "media_count not returned");
  return M(
    a.lifetimePosts,
    "VERIFIED",
    "Instagram API: me.media_count",
    "lifetime count of media on the profile",
    "all time",
    null,
  );
}

/** Average likes across the synced sample (scope always stated). */
export function getAverageLikes(a: AccountInput): Metric {
  const withLikes = a.posts.filter((p) => p.like_count != null);
  if (!withLikes.length) return UNAVAILABLE("Instagram API: me/media", "no like counts available");
  const total = withLikes.reduce((s, p) => s + (p.like_count ?? 0), 0);
  return M(
    Math.round(total / withLikes.length),
    "CALCULATED",
    "Instagram API: me/media",
    `${total} total likes ÷ ${withLikes.length} posts`,
    `last ${withLikes.length} synced posts`,
    withLikes.length,
  );
}

/** ONE engagement-rate definition for the whole product:
 *  average (likes + comments) per post ÷ followers × 100. */
export const ENGAGEMENT_RATE_FORMULA =
  "avg(likes + comments) per post ÷ followers × 100";

export function getEngagementRate(a: AccountInput): Metric {
  if (!a.followers || a.followers <= 0)
    return UNAVAILABLE("Instagram API", "follower count unavailable, cannot divide");
  if (!a.posts.length) return UNAVAILABLE("Instagram API: me/media", "no posts synced");
  const avgEng = a.posts.reduce((s, p) => s + engagementOf(p), 0) / a.posts.length;
  return M(
    Math.round((avgEng / a.followers) * 1000) / 10,
    "CALCULATED",
    "Instagram API: me/media + followers_count",
    `${ENGAGEMENT_RATE_FORMULA} → ${avgEng.toFixed(1)} ÷ ${a.followers} × 100`,
    `last ${a.posts.length} synced posts`,
    a.posts.length,
  );
}

/** The performance baseline every multiplier is measured against: the MEAN
 *  engagement of the synced posts ("your average"). Chosen deliberately —
 *  the median on this account sits near the floor because most synced posts
 *  are old and quiet, which made multipliers read as 90×+. */
export function getPerformanceBaseline(a: AccountInput): Metric {
  if (!a.posts.length) return UNAVAILABLE("Instagram API: me/media", "no posts to compute a baseline");
  const mean = a.posts.reduce((s, p) => s + engagementOf(p), 0) / a.posts.length;
  return M(
    Math.round(mean * 100) / 100,
    "CALCULATED",
    "Instagram API: me/media",
    `average engagement (likes + comments) across ${a.posts.length} synced posts`,
    `last ${a.posts.length} synced posts`,
    a.posts.length,
  );
}

export type RankedPost = {
  post: PostLike;
  engagement: number;
  multiplier: number | null;
};

/** Top posts, always ranked by the same metric: engagement. */
export function getTopPosts(a: AccountInput, limit = 4): { rows: RankedPost[]; baseline: Metric } {
  const baseline = getPerformanceBaseline(a);
  const base = baseline.value;
  const rows = [...a.posts]
    .sort((x, y) => engagementOf(y) - engagementOf(x))
    .slice(0, limit)
    .map((post) => {
      const engagement = engagementOf(post);
      return { post, engagement, multiplier: base && base > 0 ? engagement / base : null };
    });
  return { rows, baseline };
}

/** Best posting window — requires a real sample before claiming confidence. */
export function getBestPostingWindow(a: AccountInput): Metric<{
  short: string;
  long: string;
  confident: boolean;
}> {
  const timed: TimedPost[] = a.posts
    .filter((p) => p.timestamp)
    .map((p) => ({ t: p.timestamp!, e: engagementOf(p) }));
  const win = bestWindow(timed, 5);
  if (!win)
    return UNAVAILABLE("Instagram API: me/media timestamps", "fewer than 5 dated posts — not enough history");
  // Confidence needs more than one post in the winning bucket's weekday.
  const sameDay = timed.filter((p) => new Date(p.t).getDay() === win.day).length;
  return M(
    { short: win.short, long: win.long, confident: sameDay >= 3 },
    "CALCULATED",
    "Instagram API: me/media timestamps + engagement",
    `weekday+hour bucket with the highest total engagement, computed in the viewer's time zone (${sameDay} posts on that weekday)`,
    `last ${timed.length} dated posts`,
    timed.length,
  );
}

/** Reach over the period, from Instagram's real daily series. */
export function getReach(a: AccountInput, days: number): Metric {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const rows = a.daily.filter((d) => d.day >= cutoff && d.reach != null);
  if (!rows.length) return UNAVAILABLE("Instagram API: reach (period=day)", "no daily reach recorded yet");
  const total = rows.reduce((s, r) => s + (r.reach ?? 0), 0);
  return M(
    total,
    "VERIFIED",
    "Instagram API: reach (period=day)",
    `sum of ${rows.length} real daily values`,
    `last ${days} days`,
    rows.length,
  );
}

/** Competitor activity — SOCIA has no competitor data source today. */
export function getCompetitorActivity(): Metric {
  return UNAVAILABLE(
    "none",
    "Instagram's Login API cannot read other accounts; SOCIA has no tracked-competitor records",
  );
}

/** Period-over-period change for any pair of numbers, honest about zero. */
export function changeVsPrevious(cur: number, prev: number | null): Metric {
  if (prev == null) return UNAVAILABLE("period comparison", "no comparable previous period");
  if (prev === 0)
    return M<number>(null, "UNAVAILABLE", "period comparison", "previous period was zero — percentage undefined", "—", null);
  return M(
    Math.round(pctChange(cur, prev)! * 10) / 10,
    "CALCULATED",
    "period comparison",
    `(${cur} − ${prev}) ÷ ${prev} × 100`,
    "vs previous equal period",
    null,
  );
}
