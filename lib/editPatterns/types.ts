// SOCIA's library of editing patterns: what proven short videos in a kind of
// content do with length, rhythm, the hook, on-screen text and the ask, each
// with the evidence behind it, how sure SOCIA is and what it couldn't see.
// Sources: the editing studies (seed.ts), the niche scan's measured Reels
// (fromScan.ts) and, later, this account's own published results.

export type PatternSource = "study" | "scan" | "results";
export type Confidence = "high" | "medium" | "low";
type Range = [number, number];

export type PatternEvidence = {
  url: string;
  account: string;
  platform: string;
  /** Against the account's own usual (views or likes); null when there was no baseline. */
  multiplier: number | null;
  views: number | null;
  likes?: number | null;
  /** What the multiplier compares, e.g. "views vs this account's median". */
  basis?: string;
  /** Measured editing of this video (lib/nicheScan/editing.ts), when its video could be read. */
  editing?: { durationSec: number | null; cutsPer10s: number; medianShotSec: number; firstCutSec: number | null } | null;
};

export type PatternCharacteristics = {
  lengthSec?: Range | null;
  medianShotSec?: Range | null;
  cutsPer10s?: Range | null;
  /** When the first cut comes, seconds (null range: one continuous take). */
  firstCutSec?: Range | null;
  /** The longest hold, usually on the payoff, seconds. */
  heroHoldSec?: Range | null;
  /** Opening lines seen in the evidence, real wording. */
  hooks?: string[];
  /** On-screen lines seen in the evidence, real wording. */
  onScreenText?: string[];
  /** Share of the evidence with words on screen. */
  textShare?: number | null;
  /** The asks seen ("comment a word", "follow", "send to a friend"). */
  ctas?: string[];
  /** How shots are joined, in words, when known. */
  joins?: string | null;
  /** Anything else observed, short sentences. */
  notes?: string[];
};

export type EditPattern = {
  /** Stable id within its scope: "study:food_reel", "scan:process". */
  key: string;
  source: PatternSource;
  /** The niche it was found in; null for patterns that hold across niches. */
  niche: string | null;
  /** The kind of content: a house genre (lib/studioClips/houseStyle.ts) or a Reel format (lib/nicheScan/playbook.ts). */
  category: string;
  platform: "instagram" | "youtube" | "any";
  /** The technique, in a few words. */
  technique: string;
  summary: string;
  characteristics: PatternCharacteristics;
  /** Content types it suits, lowercase words matched against the niche and the request. */
  appliesTo: string[];
  evidence: PatternEvidence[];
  observed: { reels: number; accounts: number; measured: number; medianMultiplier: number | null };
  confidence: Confidence;
  limitations: string[];
  /** When the evidence was last checked, ISO. */
  verifiedAt: string;
};
