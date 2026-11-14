import type { CompetitorRow } from "@/lib/competitorIntel";
import type { ProvenReel, Tracked } from "@/components/competitors/types";
import type { Platform } from "@/lib/discoverStyle";

/** An account on Discover: a competitor the person tracks, or one SOCIA suggests. */
export type DiscoverAccount = CompetitorRow & {
  /** "you" added it, "socia" picked it before suggestions-only, null for a suggestion. */
  addedBy: "you" | "socia" | null;
  /** The style of its videos in words, when SOCIA has looked. */
  style: string | null;
  /** Its videos are made the way the brand's own are. */
  sameStyle: boolean;
  /** Instagram hasn't been read for it yet, or the last read is old: the background read is fetching it. */
  reading: boolean;
  /** Why it was suggested or picked, in a sentence. */
  why: string | null;
};

export type DiscoverData = {
  now: string;
  /** Instagram competitor data can be read (a linked Page, or SOCIA's research account). */
  igEnabled: boolean;
  igReason: string | null;
  ytConfigured: boolean;
  main: Platform | null;
  ownStyle: string | null;
  limit: number;
  tracked: Tracked[];
  competitors: DiscoverAccount[];
  suggestions: DiscoverAccount[];
  reelsToCopy: ProvenReel[];
  /** A few Reels from the niche: suggested accounts and SOCIA's niche research, never a competitor's. */
  nicheReels: ProvenReel[];
  reelsRead: { reels: number; accounts: number };
  /** Something is missing or old: the page asks for a background read once. */
  needsRead: boolean;
  lastRun: string | null;
  niche: string | null;
  nicheAccess: boolean;
  nicheUpgrade: string | null;
};
