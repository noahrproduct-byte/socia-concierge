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
  /** On the copy list: added by the person ("you") or found by SOCIA from one of theirs ("found", via copyVia). */
  copy?: "you" | "found";
  copyVia?: string | null;
};

export type DiscoverData = {
  now: string;
  /** Instagram competitor data can be read (a linked Page, or SOCIA's research account). */
  igEnabled: boolean;
  igReason: string | null;
  ytConfigured: boolean;
  main: Platform | null;
  ownStyle: string | null;
  /** Where the viral Reels group comes from (lib/discoverRules.ts viralSource): the same kind of business anywhere, or the video style. */
  viralFrom: "kind" | "style" | null;
  limit: number;
  tracked: Tracked[];
  competitors: DiscoverAccount[];
  suggestions: DiscoverAccount[];
  reelsToCopy: ProvenReel[];
  /** A few Reels from the niche: suggested accounts and SOCIA's niche research, never a competitor's. */
  nicheReels: ProvenReel[];
  /** Viral Reels made the way the brand's own are (its ownStyle), any topic: to copy the style, not the subject. */
  styleReels: ProvenReel[];
  /** "Reels to copy" accounts: the ones the person added, then the ones SOCIA found from them. */
  copyFrom: DiscoverAccount[];
  reelsRead: { reels: number; accounts: number };
  /** Something is missing or old: the page asks for a background read once. */
  needsRead: boolean;
  lastRun: string | null;
  niche: string | null;
  nicheAccess: boolean;
  nicheUpgrade: string | null;
};
