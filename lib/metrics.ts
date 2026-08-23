// Centralized metric calculations. Every number SOCIA displays about an
// account traces back to one of these functions — components display results,
// they never reinvent the math. All functions return null when the input
// can't support an honest answer (empty samples, zero denominators);
// callers render "not enough data" states instead of fake values.
//
// Precision: full precision internally; round only at presentation time.

export type PostLike = {
  id?: string;
  media_type?: string;
  like_count?: number;
  comments_count?: number;
  timestamp?: string;
  caption?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
};

/** Engagement of a post = likes + comments (the only interaction metrics the
 *  Instagram Login API exposes; views/saves/shares are not available). */
export const engagementOf = (p: PostLike): number =>
  (p.like_count ?? 0) + (p.comments_count ?? 0);

/** Statistical median. null for an empty sample. */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** value ÷ baseline, or null when the baseline can't support division. */
export function outlierMultiplier(value: number, baseline: number | null): number | null {
  if (baseline == null || baseline <= 0) return null;
  return value / baseline;
}

/** Percent change from prev to cur. null when prev is missing/zero. */
export function pctChange(cur: number, prev: number | null): number | null {
  if (prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

/** Average posts per week over the trailing window. null without timestamps. */
export function postsPerWeek(
  timestamps: (string | undefined)[],
  windowDays = 30,
  now = Date.now(),
): number | null {
  const cutoff = now - windowDays * 86400000;
  const valid = timestamps.filter((t): t is string => {
    if (!t) return false;
    const ms = new Date(t).getTime();
    return !isNaN(ms) && ms >= cutoff && ms <= now;
  });
  if (!valid.length) return null;
  return valid.length / (windowDays / 7);
}

/** Direction of a metric between an older and a more recent sample of the
 *  same kind. Compares medians; ±threshold (fraction) counts as flat.
 *  null when either sample is empty. */
export function trendDirection(
  recent: number[],
  older: number[],
  threshold = 0.15,
): "up" | "down" | "flat" | null {
  const r = median(recent);
  const o = median(older);
  if (r == null || o == null) return null;
  if (o === 0) return r > 0 ? "up" : "flat";
  const change = (r - o) / o;
  if (change > threshold) return "up";
  if (change < -threshold) return "down";
  return "flat";
}

/** Engagement rate = average per-post engagement ÷ followers × 100.
 *  null when followers are unknown/zero or there are no posts. */
export function engagementRate(posts: PostLike[], followers: number | null): number | null {
  if (!followers || followers <= 0 || !posts.length) return null;
  const avg = posts.reduce((a, p) => a + engagementOf(p), 0) / posts.length;
  return (avg / followers) * 100;
}

/** Presentation helper: 4.1× style multiplier formatting. */
export const fmtMult = (x: number): string => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;
