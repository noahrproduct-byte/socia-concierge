// The Competitors page contract: everything the server computed, typed so
// the client only lays it out. Every number here has provenance (see
// lib/competitorRollup Cell states) or an explicit reason for its absence.

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
};
