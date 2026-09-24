// The metric capability registry — the single honest source of truth for what
// each platform's API actually exposes for the signed-in user's OWN account.
//
// Every entry here is grounded in the platform's real behaviour as verified in
// the codebase's sync/data layer (lib/instagramSync, lib/youtubeData,
// lib/facebookSync) and official platform docs. If a platform does not return a
// metric, it is simply absent from that platform's `metrics` map — the UI then
// renders it UNAVAILABLE, never zero. Nothing here is aspirational: a metric
// appears only once the code can actually read it.
//
// The registry drives three things: which KPIs/series a platform's adapter is
// even allowed to emit, the platform-specific label (YouTube `followers` reads
// "Subscribers"), and the visualization selector's validity checks.

import type {
  ContentFormat,
  DemographicDimension,
  MetricKey,
  MetricLevel,
  MetricUnit,
  Platform,
} from "./types";

export type MetricCapability = {
  metric: MetricKey;
  /** Platform-specific display label, e.g. "Subscribers" for YouTube followers. */
  label: string;
  unit: MetricUnit;
  /** Levels the platform genuinely provides. Empty is expressed by omission. */
  levels: MetricLevel[];
  /** True when the platform returns a genuine per-day series for this metric
   *  (as opposed to content totals we could only stamp on a publish date). */
  trueSeries: boolean;
  /** Honesty note surfaced where the metric would otherwise look absent. */
  note?: string;
};

export type PlatformCapability = {
  platform: Platform;
  label: string;
  /** Whether connect is implemented AND can currently produce data. TikTok is
   *  false until its integration + credentials + approval land; the UI shows an
   *  honest "coming soon" rather than empty charts. */
  connectable: boolean;
  /** The platform's own word for audience size. */
  audienceLabel: string;
  /** Formats this platform produces (drives like-with-like baselines + filters). */
  formats: ContentFormat[];
  /** Demographic dimensions the platform exposes for the owner. Empty = none. */
  demographics: DemographicDimension[];
  /** Stated basis for demographics, shown verbatim. */
  demographicsBasis: string;
  metrics: Partial<Record<MetricKey, MetricCapability>>;
  /** One line explaining the platform's data depth, shown on its tile/empty state. */
  depthNote: string;
};

const cap = (
  metric: MetricKey,
  label: string,
  unit: MetricUnit,
  levels: MetricLevel[],
  trueSeries: boolean,
  note?: string,
): MetricCapability => ({ metric, label, unit, levels, trueSeries, note });

// ------------------------------------------------------------- Instagram ----
// Verified against lib/instagramSync + lib/overview: real daily views/reach/
// follower-gained series (source "instagram_api"), SOCIA daily follower
// snapshots, per-post likes/comments/views/reach/saves/shares (present only
// when Meta returns them), and age/gender/city demographics for current
// followers.
const INSTAGRAM: PlatformCapability = {
  platform: "instagram",
  label: "Instagram",
  connectable: true,
  audienceLabel: "Followers",
  formats: ["reel", "photo", "carousel"],
  demographics: ["age", "gender", "city"],
  demographicsBasis: "current followers",
  depthNote: "Full: daily series, per-post insights and follower demographics.",
  metrics: {
    followers: cap("followers", "Followers", "count", ["snapshot", "series"], true),
    net_followers: cap("net_followers", "New followers", "count", ["series", "derived"], true, "Instagram's daily follower_count series."),
    views: cap("views", "Views", "count", ["series", "content"], true, "Instagram's own daily views series; falls back to per-post totals when it isn't served."),
    reach: cap("reach", "Reach", "count", ["series"], true, "Accounts reached per day, Instagram's own daily series."),
    engagement: cap("engagement", "Engagement", "count", ["content", "derived"], false),
    engagement_rate: cap("engagement_rate", "Engagement rate", "percent", ["derived"], false),
    likes: cap("likes", "Likes", "count", ["content"], false),
    comments: cap("comments", "Comments", "count", ["content"], false),
    saves: cap("saves", "Saves", "count", ["content"], false, "Present only when Instagram returns it for the post."),
    shares: cap("shares", "Shares", "count", ["content"], false, "Present only when Instagram returns it for the post."),
    posts: cap("posts", "Posts", "count", ["derived"], false),
  },
};

// --------------------------------------------------------------- YouTube ----
// Verified against lib/youtubeData: YouTube Analytics API gives a genuine daily
// series for views / estimatedMinutesWatched / subscribersGained, plus
// age+gender viewer share (range aggregate, not daily). Data API gives lifetime
// channel totals and per-video views/likes/comments. Shares and saves are not
// exposed for own videos on these scopes. Follower (subscriber) history is NOT
// stored today — `series` on `followers` becomes true only once SOCIA's
// snapshot job records it (persistence phase); the registry keeps it to
// snapshot until then.
const YOUTUBE: PlatformCapability = {
  platform: "youtube",
  label: "YouTube",
  connectable: true,
  audienceLabel: "Subscribers",
  formats: ["video", "short", "live"],
  // YouTube Analytics can return age AND gender (dimensions=ageGroup,gender),
  // but lib/youtubeData currently sums gender into the age buckets, so only age
  // is surfaced honestly today. Add "gender" here once the fetch splits it out.
  demographics: ["age"],
  demographicsBasis: "viewers in this period",
  depthNote: "Strong: real daily views, watch time and subscriber change, plus age/gender of viewers.",
  metrics: {
    followers: cap("followers", "Subscribers", "count", ["snapshot"], false, "YouTube reports the current subscriber total; SOCIA records it daily from connect onward for history."),
    net_followers: cap("net_followers", "Net subscribers", "count", ["series", "derived"], true, "YouTube Analytics daily subscribersGained series."),
    views: cap("views", "Views", "count", ["snapshot", "series", "content"], true, "YouTube Analytics daily views series (channel), plus lifetime and per-video totals."),
    watch_time: cap("watch_time", "Watch time", "minutes", ["series", "derived"], true, "Estimated minutes watched, YouTube Analytics daily series."),
    engagement: cap("engagement", "Engagement", "count", ["content", "derived"], false, "Likes + comments per video; YouTube doesn't expose shares or saves on these scopes."),
    likes: cap("likes", "Likes", "count", ["content"], false),
    comments: cap("comments", "Comments", "count", ["content"], false),
    posts: cap("posts", "Videos", "count", ["derived"], false),
  },
};

// -------------------------------------------------------------- Facebook ----
// Verified against lib/facebookSync: a Page follower total and per-post
// reactions/comments/shares only. No views (regular Page posts don't expose
// one — never faked), no reach without the advanced read_insights permission
// SOCIA doesn't request, no demographics, no history. Follower history begins
// only once the snapshot job records it (persistence phase).
const FACEBOOK: PlatformCapability = {
  platform: "facebook",
  label: "Facebook",
  connectable: true,
  audienceLabel: "Followers",
  formats: ["photo", "video", "reel", "link", "text"],
  demographics: [],
  demographicsBasis: "",
  depthNote: "Shallow: follower count and per-post reactions, comments and shares. Facebook exposes no post views, reach or demographics on these permissions.",
  metrics: {
    followers: cap("followers", "Followers", "count", ["snapshot"], false, "Facebook reports the current follower total; SOCIA records it daily from connect onward for history."),
    engagement: cap("engagement", "Engagement", "count", ["content", "derived"], false, "Reactions + comments + shares per post."),
    likes: cap("likes", "Reactions", "count", ["content"], false),
    comments: cap("comments", "Comments", "count", ["content"], false),
    shares: cap("shares", "Shares", "count", ["content"], false),
    posts: cap("posts", "Posts", "count", ["derived"], false),
  },
};

// ---------------------------------------------------------------- TikTok ----
// COMING SOON. Capabilities are now VERIFIED against official TikTok for
// Developers docs (see memory: socia-tiktok-integration), but the registry
// stays empty + connectable:false until the connect/adapter code and Noah's
// approved app credentials exist — a metric appears here only once SOCIA can
// actually read it. When the TikTok adapter lands, populate metrics with EXACTLY
// this verified truth, no more:
//   • followers      snapshot only (user.info.stats: follower_count) — a single
//                    current value; SOCIA can build daily history by snapshotting
//                    it, labeled SOCIA-recorded, never as a TikTok series.
//   • views          content only (video.list: view_count) — cumulative per-video
//                    total as of the call; NO daily series.  trueSeries:false.
//   • likes/comments/shares  content (TikTok DOES expose share_count).
//   • engagement     content/derived (likes+comments+shares).
//   • posts          "Videos" (video_count / video.list).
//   NOT available (do NOT add): watch_time, reach, and audience demographics —
//   the developer API exposes none of these. A per-account daily time-series is
//   only on the separate TikTok API for Business (business account + its own
//   approval); do not promise it here. Publishing needs the Content Posting audit.
const TIKTOK: PlatformCapability = {
  platform: "tiktok",
  label: "TikTok",
  connectable: false,
  audienceLabel: "Followers",
  formats: ["video", "photo"],
  demographics: [],
  demographicsBasis: "",
  depthNote: "Coming soon — SOCIA is building the TikTok connection.",
  metrics: {},
};

export const CAPABILITIES: Record<Platform, PlatformCapability> = {
  instagram: INSTAGRAM,
  youtube: YOUTUBE,
  facebook: FACEBOOK,
  tiktok: TIKTOK,
};

// ------------------------------------------------------------- accessors ----

export function platformCapability(platform: Platform): PlatformCapability {
  return CAPABILITIES[platform];
}

export function metricCapability(platform: Platform, metric: MetricKey): MetricCapability | null {
  return CAPABILITIES[platform].metrics[metric] ?? null;
}

/** Whether a platform exposes a metric at all (optionally at a specific level). */
export function isMetricAvailable(platform: Platform, metric: MetricKey, level?: MetricLevel): boolean {
  const c = CAPABILITIES[platform].metrics[metric];
  if (!c || !c.levels.length) return false;
  return level ? c.levels.includes(level) : true;
}

/** The platform's display label for a metric, or the generic key title. */
export function metricLabel(platform: Platform, metric: MetricKey): string {
  return CAPABILITIES[platform].metrics[metric]?.label ?? metric;
}

/** Whether the platform reports a genuine per-day series for this metric — the
 *  gate for putting it on a TREND time axis. */
export function hasTrueSeries(platform: Platform, metric: MetricKey): boolean {
  return CAPABILITIES[platform].metrics[metric]?.trueSeries ?? false;
}

/** All metrics a platform provides, optionally filtered to one level. */
export function availableMetrics(platform: Platform, level?: MetricLevel): MetricKey[] {
  const m = CAPABILITIES[platform].metrics;
  return (Object.keys(m) as MetricKey[]).filter((k) => {
    const c = m[k];
    return c && c.levels.length > 0 && (!level || c.levels.includes(level));
  });
}

/** Platforms SOCIA can actually pull analytics from today. */
export function connectablePlatforms(): Platform[] {
  return (Object.keys(CAPABILITIES) as Platform[]).filter((p) => CAPABILITIES[p].connectable);
}

/** Whether a metric can be aggregated across platforms in All-Accounts view.
 *  Only additive counts are defensible; ratios (engagement_rate) and levels
 *  that mean different things per platform are not summed. */
export function isCrossPlatformAdditive(metric: MetricKey): boolean {
  return metric === "views" || metric === "watch_time" || metric === "likes" || metric === "comments" || metric === "shares" || metric === "saves" || metric === "engagement" || metric === "posts" || metric === "net_followers";
}
