// The Competitors page contract: everything the server computed, typed so
// the client only lays it out. Every number here has provenance (see
// lib/competitorRollup Cell states) or an explicit reason for its absence.

import type { FormatsDoc } from "@/lib/nicheFormats";
import type { LeaderRow } from "@/lib/competitorRollup";
import type { CompetitorRow } from "@/lib/competitorIntel";
import type { NichePost, OwnPost } from "@/lib/nicheTrends";

export type Tracked = { platform: string; handle: string; added_at: string };

/** One of the user's own posts, for the trajectory chart. All real. */
export type YouSeriesPoint = { t: string; interactions: number; views: number | null };
/** One daily follower snapshot recorded by SOCIA. */
export type FollowerPoint = { day: string; followers: number };
export type PlatformFilter = "all" | "instagram" | "youtube" | "facebook";
export type NicheRange = 30 | 90 | 0;

export type CompetitorsData = {
  /** Instagram connected for the user's own numbers. */
  connected: boolean;
  igConnectHref: string;
  you: LeaderRow | null;
  rows: CompetitorRow[];
  tracked: Tracked[];
  days: number;
  /** Longest range the plan may look back over; ranges above it render locked. */
  maxDays: number;
  platform: PlatformFilter;
  lastRun: string | null;
  sources: { youtube: string; web: string } | null;
  /** Instagram Business Discovery: available only through a linked Facebook Page. */
  ig: { enabled: boolean; reason: string | null };
  ytConfigured: boolean;
  niche: string | null;
  subNiche: string | null;
  nicheRange: NicheRange;
  content: NichePost[];
  saved: NichePost[];
  own: OwnPost[];
  /** Your posts in range as chartable points; empty when not connected. */
  youSeries: YouSeriesPoint[];
  /** Your daily follower counts inside the range; empty until snapshots exist. */
  followerSeries: FollowerPoint[];
  goalKeywords: string[];
  goalText: string | null;
  location: string | null;
  /** Server clock, ISO; the client never re-derives "now" on first paint. */
  now: string;
  /** How many trending niche accounts the plan shows (its competitor limit, at most 10). */
  trendingLimit: number;
  /** Recent Reels and Shorts in the niche, ranked against each account's own median. */
  trendingReels: TrendingReel[];
  /** Niche intelligence is on the owner's plan. */
  nicheAccess: boolean;
  /** The plan that unlocks it, when it is not on this one. */
  nicheUpgrade: string | null;
  /** What a research run searches for, from the Growth Profile, and what would sharpen it. */
  basis: { searches: string[]; missing: string[] };
  /** Winning formats from the last research run (lib/nicheFormats.ts); stale when a newer run exists. */
  formats: { doc: FormatsDoc | null; stale: boolean };
};

/** One recent Reel or Short from an account in the niche. Every number is what the platform published. */
export type TrendingReel = {
  url: string;
  platform: string;
  accountName: string;
  accountHandle: string | null;
  accountAvatar: string | null;
  title: string | null;
  thumb: string | null;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  /** Against the account's own median for the same measure; null when no baseline exists. */
  multiplier: number | null;
  /** The measure the multiplier compares. */
  basis: "views" | "likes and comments";
  format: string;
};
