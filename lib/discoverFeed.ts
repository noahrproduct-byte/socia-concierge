// Discover's Reels as two feeds (Noah, 2026-11-24): "Recommended for you", every Reel relevant to the brand in one
// ranked list (its competitors', its niche's, businesses like it anywhere, the accounts it copies, and related
// businesses when those run short), and "Trending", viral Reels from any industry to adapt. Ranking is plain
// code over the numbers the platforms published: nothing here calls the AI, and no number is made up.
// Pure and browser-safe.

import type { ProvenReel } from "./trendSignals";

/** Where a recommended Reel comes from, shown as a small badge on its card. */
export type FeedSource = "competitor" | "niche" | "similar" | "style" | "copy" | "related" | "trending";
/** A Reel in a feed. `fitStructure`: for Trending, the creative structure SOCIA judged transfers to the business (lib/trendFit.ts). */
export type FeedReel = ProvenReel & { source: FeedSource; fitStructure?: string };

export const FEED_BADGE: Record<FeedSource, string | null> = {
  competitor: "Competitor",
  niche: "Your niche",
  similar: "Business like yours",
  style: "Made like yours",
  copy: "Account you copy",
  related: "Related business",
  trending: null,
};

/** Reels shown at first in each feed, and per "Load more". */
export const FEED_PAGE = 12;
/** The most a recommended feed holds. */
export const RECOMMENDED_MAX = 60;
/** Reels from one account in a feed. */
export const PER_ACCOUNT = 2;

/** How much the source counts toward the ranking: the brand's own competitors first. */
const SOURCE_WEIGHT: Record<FeedSource, number> = { competitor: 3, copy: 2.5, niche: 2, similar: 1.5, style: 1.5, related: 1, trending: 0 };

const accountOf = (r: { accountHandle: string | null; accountName: string }) => (r.accountHandle ?? r.accountName).replace(/^@/, "").toLowerCase();
const lineOf = (r: { title: string | null }) => (r.title ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 60);

/**
 * A Reel's place in a feed: where it comes from, how far it went past its account's usual (capped, so one
 * outlier doesn't bury everything), how many views it has, and how recent it is. Pure.
 */
export function feedScore(r: Pick<FeedReel, "source" | "multiplier" | "views" | "publishedAt">, now: Date): number {
  const mult = r.multiplier != null && r.multiplier > 0 ? Math.min(Math.log2(Math.max(1, r.multiplier)), 5) : 0;
  const views = r.views != null && r.views > 0 ? Math.min(Math.log10(r.views) - 3, 4) / 2 : 0;
  const days = r.publishedAt ? (now.getTime() - Date.parse(r.publishedAt)) / 86_400_000 : 30;
  const fresh = Number.isFinite(days) ? Math.max(0, 1 - Math.max(0, days) / 30) : 0;
  return SOURCE_WEIGHT[r.source] + mult + Math.max(0, views) + fresh;
}

/**
 * One feed from several lists: each Reel once (by link, and by account and opening line, so an account that
 * posts the same video twice shows once), at most PER_ACCOUNT per account, best first. A Reel in more than
 * one list keeps the source that ranks highest. Pure.
 */
export function mergeFeed(lists: FeedReel[][], now: Date, opts: { max?: number; exclude?: Set<string>; perAccount?: number } = {}): FeedReel[] {
  const best = new Map<string, FeedReel>();
  for (const r of lists.flat()) {
    if (!r.url || opts.exclude?.has(r.url)) continue;
    const had = best.get(r.url);
    if (!had || SOURCE_WEIGHT[r.source] > SOURCE_WEIGHT[had.source]) best.set(r.url, r);
  }
  const ranked = [...best.values()].sort((a, b) => feedScore(b, now) - feedScore(a, now));
  const lines = new Set<string>();
  const per = new Map<string, number>();
  const out: FeedReel[] = [];
  for (const r of ranked) {
    if (out.length >= (opts.max ?? RECOMMENDED_MAX)) break;
    const acct = accountOf(r);
    const line = lineOf(r);
    if (line && lines.has(`${acct}|${line}`)) continue;
    if ((per.get(acct) ?? 0) >= (opts.perAccount ?? PER_ACCOUNT)) continue;
    if (line) lines.add(`${acct}|${line}`);
    per.set(acct, (per.get(acct) ?? 0) + 1);
    out.push(r);
  }
  return out;
}

/** Words that say what the brand is ("Pizza restaurant" gives pizza, restaurant). Pure. */
export function nicheWords(niche: string | null | undefined): string[] {
  const STOP = new Set(["and", "the", "for", "with", "your", "local", "business", "small", "brand", "shop", "company", "online", "services", "service"]);
  return [...new Set((niche ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)))].slice(0, 8);
}

/** Whether a Reel's caption or account names one of the brand's words (a word, not part of one). Pure. */
export function mentions(r: Pick<FeedReel, "title" | "accountName" | "accountHandle">, words: string[]): boolean {
  if (!words.length) return false;
  const text = `${r.title ?? ""} ${r.accountName} ${r.accountHandle ?? ""}`.toLowerCase();
  return words.some((w) => new RegExp(`(^|[^a-z])${w.replace(/[^a-z0-9]/g, "")}(s|es)?([^a-z]|$)`).test(text));
}

/**
 * Recommended Reels, topped up when they run short: Reels from SOCIA's wider pool whose caption or account
 * names what the brand is (a pizza place gets other pizza places' Reels), marked "Related business". Pure.
 */
export function withRelated(recommended: FeedReel[], pool: FeedReel[], niche: string | null | undefined, now: Date, want = FEED_PAGE * 2): FeedReel[] {
  if (recommended.length >= want) return recommended;
  const words = nicheWords(niche);
  const have = new Set(recommended.map((r) => r.url));
  const related = pool.filter((r) => !have.has(r.url) && mentions(r, words)).map((r) => ({ ...r, source: "related" as const }));
  return [...recommended, ...mergeFeed([related], now, { max: want - recommended.length })];
}

/** One page of a feed and whether more follow. Pure. */
export function feedPage<T>(list: T[], offset: number, size = FEED_PAGE): { reels: T[]; next: number | null } {
  const start = Math.max(0, Math.floor(offset));
  const reels = list.slice(start, start + size);
  return { reels, next: start + reels.length < list.length ? start + reels.length : null };
}
