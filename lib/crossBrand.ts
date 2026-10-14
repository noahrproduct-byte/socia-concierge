// Cross-brand analytics (Pro): every Brand Workspace the person owns, side by
// side, for one window. Per brand and per connected platform:
//
//   audience     followers or subscribers now
//   growth       net change over the window where SOCIA has daily counts
//                (Instagram, Facebook); subscribers GAINED where that is all
//                YouTube reports; nothing for TikTok, which gives no history
//   posts        published in the window
//   typical post the median post published in the window against the
//                brand's own median post on that platform (1.0× = usual)
//   best post    the post furthest above its brand's median
//
// Brands are compared through their OWN medians, never raw totals, so a
// small brand isn't "worse" for being small. Every number comes from the
// same builders as each brand's own Analytics tab; what a platform doesn't
// report stays null with a note. Pure, tested.
import { median } from "./metrics";
import type { PostCard } from "./overview";
import type { FacebookAnalyticsData } from "./metrics/facebook";
import type { YouTubeAnalytics } from "./youtubeData";
import type { TtVideo } from "./tiktokAuth";

export type BrandPlatformKey = "instagram" | "facebook" | "youtube" | "tiktok";

export type BrandPlatform = {
  platform: BrandPlatformKey;
  account: string;
  audience: number | null;
  audienceLabel: "followers" | "subscribers";
  growth: { value: number | null; kind: "net" | "gained"; note: string | null };
  posts: number | null;
  postsNote: string | null;
  typical: { multiplier: number | null; metric: "interactions" | "engagement" | "views"; note: string | null };
};

export type BestPost = { platform: BrandPlatformKey; title: string; url: string | null; multiplier: number; metric: "interactions" | "engagement" | "views"; publishedAt: string | null };

export type BrandRow = {
  id: string;
  name: string;
  active: boolean;
  platforms: BrandPlatform[];
  postsTotal: number;
  best: BestPost | null;
};

/** Posts in the window before a "typical post" is worth stating. */
export const MIN_IN_RANGE = 3;
/** Posts behind a brand's own median before anything is compared with it. */
export const MIN_BASELINE = 5;

const DAY = 86_400_000;
const round2 = (x: number) => Math.round(x * 100) / 100;

function typicalOf(multipliers: (number | null)[], baselineSample: number, metric: BrandPlatform["typical"]["metric"]): BrandPlatform["typical"] {
  const xs = multipliers.filter((m): m is number => m != null && Number.isFinite(m));
  if (baselineSample < MIN_BASELINE) return { multiplier: null, metric, note: `Needs at least ${MIN_BASELINE} posts to know this brand's usual.` };
  if (xs.length < MIN_IN_RANGE) return { multiplier: null, metric, note: `Fewer than ${MIN_IN_RANGE} posts in this window.` };
  const m = median(xs);
  return { multiplier: m == null ? null : round2(m), metric, note: null };
}

export type BrandInput = {
  id: string;
  name: string;
  active: boolean;
  now: number;
  days: number;
  instagram: { handle: string | null; followers: number | null; posts: PostCard[]; baselineSample: number; daily: { day: string; followers: number | null }[] } | null;
  facebook: { name: string | null; followers: number | null; data: FacebookAnalyticsData } | null;
  youtube: YouTubeAnalytics | null;
  tiktok: { username: string | null; followers: number | null; videos: TtVideo[]; videosInRange: number } | null;
};

export function buildBrandRow(b: BrandInput): BrandRow {
  const since = b.now - b.days * DAY;
  const startDay = new Date(since).toISOString().slice(0, 10);
  const platforms: BrandPlatform[] = [];
  const bests: BestPost[] = [];

  if (b.instagram) {
    const ig = b.instagram;
    const pts = ig.daily.filter((d): d is { day: string; followers: number } => d.followers != null && d.day >= startDay).sort((x, y) => x.day.localeCompare(y.day));
    const inRange = ig.posts.filter((p) => new Date(p.published).getTime() >= since);
    platforms.push({
      platform: "instagram", account: ig.handle ? `@${ig.handle}` : "Instagram", audience: ig.followers, audienceLabel: "followers",
      growth: pts.length >= 2 ? { value: pts[pts.length - 1].followers - pts[0].followers, kind: "net", note: null } : { value: null, kind: "net", note: "SOCIA has fewer than two daily follower counts in this window." },
      posts: inRange.length, postsNote: null,
      typical: typicalOf(inRange.map((p) => p.multiplier), ig.baselineSample, "interactions"),
    });
    for (const p of inRange) if (p.multiplier != null && ig.baselineSample >= MIN_BASELINE) bests.push({ platform: "instagram", title: p.title, url: p.permalink, multiplier: p.multiplier, metric: "interactions", publishedAt: p.published });
  }

  if (b.facebook) {
    const fb = b.facebook;
    const inRange = fb.data.posts.filter((p) => new Date(p.published).getTime() >= since);
    const sample = fb.data.posts.filter((p) => p.engagement != null).length;
    platforms.push({
      platform: "facebook", account: fb.name ?? "Facebook", audience: fb.followers, audienceLabel: "followers",
      growth: fb.data.followerStats.net != null ? { value: fb.data.followerStats.net, kind: "net", note: null } : { value: null, kind: "net", note: "SOCIA's daily follower counts for this Page don't cover the window yet." },
      posts: fb.data.postsInRange, postsNote: null,
      typical: typicalOf(inRange.map((p) => p.multiplier), sample, "engagement"),
    });
    for (const p of inRange) if (p.multiplier != null) bests.push({ platform: "facebook", title: p.title, url: p.permalink, multiplier: p.multiplier, metric: "engagement", publishedAt: p.published });
  }

  if (b.youtube) {
    const yt = b.youtube;
    platforms.push({
      platform: "youtube", account: yt.channel.title ?? "YouTube", audience: yt.channel.subscribers ?? null, audienceLabel: "subscribers",
      growth: yt.range ? { value: yt.range.subs, kind: "gained", note: "Subscribers gained, as YouTube reports it (not net of those lost)." } : { value: null, kind: "gained", note: "YouTube didn't report this window." },
      posts: null, postsNote: "Uploads per window are on the YouTube tab.",
      typical: { multiplier: null, metric: "views", note: "The per-video comparison is on the YouTube tab." },
    });
  }

  if (b.tiktok) {
    const tt = b.tiktok;
    const counted = tt.videos.filter((v) => v.views != null && v.createdAt);
    const base = counted.length >= MIN_BASELINE ? median(counted.map((v) => v.views as number)) : null;
    const inRange = counted.filter((v) => new Date(v.createdAt!).getTime() >= since);
    const mult = (v: TtVideo) => (base && base > 0 ? (v.views as number) / base : null);
    platforms.push({
      platform: "tiktok", account: tt.username ? `@${tt.username}` : "TikTok", audience: tt.followers, audienceLabel: "followers",
      growth: { value: null, kind: "net", note: "TikTok doesn't provide follower history." },
      posts: tt.videosInRange, postsNote: null,
      typical: typicalOf(inRange.map(mult), counted.length, "views"),
    });
    for (const v of inRange) {
      const m = mult(v);
      if (m != null) bests.push({ platform: "tiktok", title: (v.caption ?? "").split("\n")[0].trim().slice(0, 80) || "Your video", url: v.url, multiplier: m, metric: "views", publishedAt: v.createdAt });
    }
  }

  const best = bests.sort((x, y) => y.multiplier - x.multiplier)[0] ?? null;
  return {
    id: b.id, name: b.name, active: b.active, platforms,
    postsTotal: platforms.reduce((n, p) => n + (p.posts ?? 0), 0),
    best: best ? { ...best, multiplier: round2(best.multiplier) } : null,
  };
}
