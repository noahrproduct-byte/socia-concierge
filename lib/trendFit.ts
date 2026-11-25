// Which Trending Reels a business can really adapt (Noah, 2026-11-24): a viral Reel from another industry is
// shown only when its creative structure transfers to this business (a clothing reveal can become a new pizza
// reveal; a GTA tutorial can't become anything for a pizza place). Two passes keep it cheap:
//   1. code drops Reels from narrow technical worlds (gaming, software, trading) unless the brand is in one;
//   2. one fast, text-only model call scores the most promising of the rest for this business (0 to 100) and
//      names the structure that transfers. Scores are kept on the brand row by business profile, so each Reel is
//      judged once per profile, and only new Reels are judged on later visits.
// Ranking then weighs adaptability, performance against the creator's usual and recency, after a minimum
// adaptability that no view count can buy past. Pure and browser-safe.

import type { FeedReel } from "./discoverFeed";
import { reelKey } from "./discoverStyle";

/** Starting weights for Trending's order; adaptability first. */
export const TREND_WEIGHTS = { adapt: 0.5, perf: 0.3, recency: 0.2 } as const;
/** Below this adaptability (0 to 100) a Reel is never shown, whatever its views. */
export const MIN_FIT = 45;
/** Reels judged per call. */
export const FIT_PER_CALL = 36;
/** A judgment is kept this long, then the Reel is judged again. */
export const FIT_TTL_DAYS = 21;
/** Judgments kept per brand. */
export const FIT_KEPT = 500;

export type TrendJudgment = { fit: number; structure: string; at: string };
export type TrendFitStore = { profile: string; reels: Record<string, TrendJudgment> };

/** Worlds whose Reels rarely transfer to other businesses: technical, platform-bound or regulated. */
const NARROW: { word: RegExp; world: string }[] = [
  { word: /\b(gta|fortnite|minecraft|roblox|valorant|warzone|call of duty|cod|ps5|xbox|nintendo|gameplay|gamer|gaming|speedrun|twitch|esports?)\b/i, world: "gaming" },
  { word: /\b(code|coding|python|javascript|typescript|react|api|sql|devs?|developer|programming|saas|no-?code|chatgpt|prompt|plugin|figma|notion|excel|spreadsheet)\b/i, world: "software" },
  { word: /\b(crypto|bitcoin|btc|eth|forex|stocks?|options|day ?trad\w*|trading|nft|airdrop)\b/i, world: "trading" },
  { word: /\b(supplements?|steroids?|peptides?|sarms)\b/i, world: "supplements" },
];

/** The narrow world a Reel belongs to, from its caption and account, or null. Pure. */
export function narrowWorld(r: Pick<FeedReel, "title" | "accountName" | "accountHandle" | "topics">): string | null {
  const text = `${r.title ?? ""} ${r.accountName} ${r.accountHandle ?? ""} ${r.topics.join(" ")}`;
  return NARROW.find((n) => n.word.test(text))?.world ?? null;
}

/** First pass: drop Reels from a narrow world the business isn't in. `business` is its profile lines. Pure. */
export function cheapPass(list: FeedReel[], business: string[]): FeedReel[] {
  const own = business.join(" ");
  const inWorld = new Set(NARROW.filter((n) => n.word.test(own)).map((n) => n.world));
  return list.filter((r) => { const w = narrowWorld(r); return !w || inWorld.has(w); });
}

const keyOf = (r: { url: string }) => reelKey(r.url) ?? r.url;

/** The store made safe: judgments for one profile, bounded, newest kept. Pure. */
export function sanitizeTrendFit(v: unknown): TrendFitStore | null {
  const o = (v && typeof v === "object" ? v : null) as Record<string, unknown> | null;
  if (!o || typeof o.profile !== "string") return null;
  const raw = o.reels && typeof o.reels === "object" ? (o.reels as Record<string, unknown>) : {};
  const reels = Object.entries(raw)
    .map(([k, j]) => {
      const x = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
      const fit = Math.round(Number(x.fit));
      const at = typeof x.at === "string" && !Number.isNaN(Date.parse(x.at)) ? x.at : null;
      return [k, Number.isFinite(fit) && at ? { fit: Math.max(0, Math.min(100, fit)), structure: typeof x.structure === "string" ? x.structure.slice(0, 140) : "", at } : null] as const;
    })
    .filter((e): e is readonly [string, TrendJudgment] => /^[A-Za-z0-9_:./-]{4,200}$/.test(e[0]) && e[1] != null)
    .sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at))
    .slice(0, FIT_KEPT);
  return { profile: o.profile.slice(0, 20), reels: Object.fromEntries(reels) };
}

/** A judgment that still counts for this profile, or null. Pure. */
export function judgmentOf(store: TrendFitStore | null, profile: string, r: { url: string }, now: Date): TrendJudgment | null {
  if (!store || store.profile !== profile) return null;
  const j = store.reels[keyOf(r)];
  return j && now.getTime() - Date.parse(j.at) < FIT_TTL_DAYS * 86_400_000 ? j : null;
}

/** How a Reel did against its creator's usual, 0 to 1 (views when there's no baseline). Pure. */
export function perfScore(r: Pick<FeedReel, "multiplier" | "views">): number {
  if (r.multiplier != null && r.multiplier > 0) return Math.min(1, Math.log2(Math.max(1, r.multiplier)) / 5);
  return r.views != null && r.views > 0 ? Math.min(1, Math.max(0, Math.log10(r.views) - 4) / 2) / 2 : 0;
}

/** How recent, 0 to 1 over 30 days. Pure. */
export function recencyScore(publishedAt: string | null, now: Date): number {
  if (!publishedAt) return 0;
  const days = (now.getTime() - Date.parse(publishedAt)) / 86_400_000;
  return Number.isFinite(days) ? Math.max(0, Math.min(1, 1 - days / 30)) : 0;
}

/** A judged Reel's place: adaptability, then performance, then recency. Pure. */
export function trendScore(fit: number, r: Pick<FeedReel, "multiplier" | "views" | "publishedAt">, now: Date, w: { adapt: number; perf: number; recency: number } = TREND_WEIGHTS): number {
  return w.adapt * (fit / 100) + w.perf * perfScore(r) + w.recency * recencyScore(r.publishedAt, now);
}

/**
 * Trending in its final order. Judged Reels under MIN_FIT are dropped and the rest ranked by trendScore, each
 * carrying the structure that transfers (used by "Adapt to my business"). Reels not judged yet wait until the
 * next background read judges them; while nothing at all is judged for this profile, the first pass's order
 * stands (`judged` is false) so the section isn't empty on a first visit. Pure.
 */
export function rankTrending(list: FeedReel[], business: string[], store: TrendFitStore | null, profile: string, now: Date): { reels: FeedReel[]; judged: boolean; waiting: number } {
  const first = cheapPass(list, business);
  const scored = first.map((r) => ({ r, j: judgmentOf(store, profile, r, now) }));
  const judged = scored.some((x) => x.j);
  if (!judged) return { reels: first, judged: false, waiting: first.length };
  const reels = scored
    .filter((x): x is { r: FeedReel; j: TrendJudgment } => x.j != null && x.j.fit >= MIN_FIT)
    .sort((a, b) => trendScore(b.j.fit, b.r, now) - trendScore(a.j.fit, a.r, now))
    .map(({ r, j }) => ({ ...r, fitStructure: j.structure || undefined }));
  return { reels, judged: true, waiting: scored.filter((x) => !x.j).length };
}

/** The next Reels to judge: past the first pass, not judged for this profile, best performers first. Pure. */
export function toJudge(list: FeedReel[], business: string[], store: TrendFitStore | null, profile: string, now: Date, max = FIT_PER_CALL): FeedReel[] {
  return cheapPass(list, business)
    .filter((r) => !judgmentOf(store, profile, r, now))
    .sort((a, b) => perfScore(b) + recencyScore(b.publishedAt, now) - (perfScore(a) + recencyScore(a.publishedAt, now)))
    .slice(0, max);
}

/** The store with new judgments (a new profile starts afresh). Pure. */
export function withJudgments(store: TrendFitStore | null, profile: string, add: Record<string, TrendJudgment>): TrendFitStore {
  const base = store && store.profile === profile ? store.reels : {};
  return sanitizeTrendFit({ profile, reels: { ...base, ...add } })!;
}

// ---------------------------------------------------------------------------
// The judging call
// ---------------------------------------------------------------------------

export const FIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reels"],
  properties: {
    reels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "fit", "structure"],
        properties: { id: { type: "string" }, fit: { type: "integer" }, structure: { type: "string" } },
      },
    },
  },
} as const;

export const FIT_SYSTEM = `You judge which viral Reels from other industries one business could adapt into its own video. You see each Reel's caption, its account and what SOCIA recognised about it, never the video.
For each Reel give:
- fit: 0 to 100, how well its creative structure transfers to THIS business, made with what it has (its products, place, people, customers, the way it already films). 80 to 100: a structure the business could film this week and that suits its audience (a clothing brand's three-outfit reveal for a restaurant's three new dishes; a fitness transformation for a dish from raw to plated). 50 to 79: transfers with some work. 20 to 49: only a loose idea. 0 to 19: it only works in its own world (a game tutorial, a software walkthrough, trading tips) or needs things the business can't have. Never invent a connection to save a viral Reel; a score under 45 is fine and common.
- structure: the creative structure that transfers, in at most 12 words, said generally ("Three-option reveal with quick cuts", "Before and after transformation in one take"). Empty when nothing transfers.
Plain text, no em dashes.`;

/** The call's input: the business, then the Reels as T1, T2... with only what SOCIA knows. Pure. */
export function fitInput(business: string[], ownStyle: string | null, reels: FeedReel[]): string {
  const n = (v: number | null) => (v == null ? null : v.toLocaleString("en-US"));
  return [
    "# The business",
    business.length ? business.join("\n") : "Only its name is known.",
    ownStyle ? `How its own videos are made: ${ownStyle}` : "",
    "# Reels to judge",
    ...reels.map((r, i) => `T${i + 1}: @${(r.accountHandle ?? r.accountName).replace(/^@/, "")} | ${r.format} | ${(r.title ?? "no caption").replace(/\s+/g, " ").slice(0, 160)}${r.structures.length ? ` | hook: ${r.structures.join(", ")}` : ""}${r.topics.length ? ` | about: ${r.topics.join(", ")}` : ""}${n(r.views) ? ` | ${n(r.views)} views` : ""}`),
  ].filter(Boolean).join("\n");
}

/** The model's judgments as store entries, by Reel key (unknown ids dropped). Pure. */
export function judgmentsFrom(raw: unknown, reels: FeedReel[], now: Date): Record<string, TrendJudgment> {
  const list = Array.isArray((raw as { reels?: unknown })?.reels) ? (raw as { reels: unknown[] }).reels : [];
  const out: Record<string, TrendJudgment> = {};
  for (const x of list) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const m = /^T(\d{1,3})$/.exec(String(o.id ?? "").trim());
    const r = m ? reels[Number(m[1]) - 1] : null;
    const fit = Math.round(Number(o.fit));
    if (!r || !Number.isFinite(fit)) continue;
    out[keyOf(r)] = {
      fit: Math.max(0, Math.min(100, fit)),
      structure: typeof o.structure === "string" ? o.structure.replace(/\s+/g, " ").replace(/\s*[\u2014\u2013]\s*/g, ", ").trim().slice(0, 120) : "",
      at: now.toISOString(),
    };
  }
  return out;
}
