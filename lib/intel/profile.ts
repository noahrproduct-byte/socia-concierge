// The brand's intelligence profile (phase 1 of the intelligence engine,
// Noah 2026-11-24): one saved record of what SOCIA knows about a brand's niche
// and the accounts around it, so every feature reads the same thing instead
// of each rebuilding it on every request.
//
//   niche        the niche read (lib/trendSignalsLoad.ts): Reels and Shorts
//                from tracked and discovered accounts, each against its
//                creator's own median, grouped into hooks and topics
//   accounts     discovered accounts that passed the niche check, best first
//   content      discovered posts that passed it, by multiple of their usual
//   tracked      the competitors the person follows on Discover
//   inputs       what it was built from, so a refresh can tell whether
//                anything changed (new competitor reads, a discovery run,
//                a change to the tracked list) and skip the work when not
//
// Every number in it is one a platform published; nothing here is written by
// a model. Pure types and rules; lib/intel/profileLoad.ts reads and saves it.

import type { NicheRead } from "../trendSignalsLoad";
import type { Ranked } from "./rank";

export const PROFILE_VERSION = 1;

/** A live niche read is reused for this long by the features that want fresh data (plans, the rater). */
export const LIVE_FRESH_MS = 24 * 3_600_000;
/** Any saved read is good enough this long for features that never call a platform (Dashboard, Ask SOCIA). */
export const SAVED_USABLE_MS = 7 * 86_400_000;

export type DiscoveredAccountRow = {
  platform: string; platform_account_id?: string | null; handle: string | null; display_name: string | null;
  followers: number | null; location: string | null; category: string | null; classification: string;
  relevance_score: number | null; data_source?: string | null; relevance_reasons?: unknown;
};

export type DiscoveredContentRow = {
  platform: string; account_name: string | null; account_handle?: string | null; title: string | null; content_url?: string | null;
  thumbnail_url?: string | null; views: number | null; likes: number | null; comments: number | null; multiplier: number | null;
  trend_tags: string[] | null; why_recommended: string | null; published_at: string | null; content_type?: string | null;
  data_source?: string | null; relevance_reasons?: unknown;
};

/** What a profile was built from: when any of these change, it is out of date. */
export type ProfileInputs = {
  /** tracked competitors, "platform:handle", sorted */
  tracked: string[];
  /** the latest discovery run SOCIA saved for this brand */
  discoveryAt: string | null;
  /** the newest Instagram competitor read among the accounts it reads */
  igReadAt: string | null;
  /** the brand's location, which ranks local Reels first */
  location: string | null;
  /** the accounts the person marked as a priority (lib/intel/rank.ts); absent on profiles built before ranking */
  pins?: string[];
};

export type IntelProfile = {
  v: typeof PROFILE_VERSION;
  builtAt: string;
  inputs: ProfileInputs;
  niche: NicheRead | null;
  /** "live" read the platforms; "saved" only re-ranked what SOCIA had stored */
  nicheSource: "live" | "saved" | "none";
  nicheAt: string | null;
  accounts: DiscoveredAccountRow[];
  content: DiscoveredContentRow[];
  tracked: { platform: string; handle: string }[];
  /** the tracked accounts ranked best first, with reasons (lib/intel/rank.ts); absent on older profiles */
  roster?: Ranked[];
};

/** The key in niche_trends: it starts with the owner's id, which that table's row policy requires. */
export const profileKey = (ownerId: string, scopeId: string | null | undefined): string => `${ownerId}:${scopeId ?? "default"}:intel:v${PROFILE_VERSION}`;

export const sameInputs = (a: ProfileInputs, b: ProfileInputs): boolean =>
  a.discoveryAt === b.discoveryAt && a.igReadAt === b.igReadAt && (a.location ?? "") === (b.location ?? "") && a.tracked.join("|") === b.tracked.join("|")
  && (a.pins ?? []).join("|") === (b.pins ?? []).join("|");

export type NeedNiche = "live" | "saved";

/**
 * Whether a saved profile can answer a request as it is. "live" (plans, the
 * rater) needs a live read under a day old taken from the same inputs;
 * "saved" (pages that never call a platform) takes any read under a week old.
 */
export function profileServes(p: IntelProfile | null, need: NeedNiche, inputs: ProfileInputs | null, now: number): boolean {
  if (!p || p.v !== PROFILE_VERSION) return false;
  const age = p.nicheAt ? now - Date.parse(p.nicheAt) : Infinity;
  if (need === "saved") return p.nicheSource !== "none" && age < SAVED_USABLE_MS;
  return p.nicheSource === "live" && age < LIVE_FRESH_MS && (!inputs || sameInputs(p.inputs, inputs));
}

/** Shrinks a niche read for storage: the Reels' signed reference tokens belong to one viewer and are dropped. */
export function storableNiche(read: NicheRead | null): NicheRead | null {
  if (!read) return null;
  return { signals: read.signals, proven: read.proven.slice(0, 16).map((r) => { const { refToken: _t, ...rest } = r; return rest; }) };
}
