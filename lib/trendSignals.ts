// Trending in the niche: recent Reels and Shorts from accounts in the niche,
// ranked against each account's own usual, and what the ones that beat it
// share: the hook structure of their opening line and the topic.
//
// Everything is counted from real posts. A post's result is its published
// number over its own creator's median for the same measure (views on
// YouTube; on Instagram views where Meta returned them for at least three of
// the account's posts, otherwise likes plus comments). A hook structure or
// topic is kept only with TREND_MIN_POSTS posts from TREND_MIN_ACCOUNTS
// accounts, and it "leads" only when the median result of the posts with a
// baseline is at least TREND_LEADS_AT. Opening lines are quoted as other
// accounts wrote them, so they are shown as patterns to learn from and never
// handed to a model to reuse word for word. Pure and browser-safe.

import type { CompPost } from "./competitorIntel";
import type { NichePost } from "./nicheTrends";
import { detectTrendTags, tagGroup } from "./discovery";
import { tagsFor } from "./competitorPatterns";

export const TREND_MIN_POSTS = 3;
export const TREND_MIN_ACCOUNTS = 2;
export const TREND_LEADS_AT = 1.3;
/** A single opening line is shown as a strong example from this result up. */
export const STRONG_HOOK_AT = 1.5;
export const TREND_WINDOW_DAYS = 60;

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

/** An account on the Discover page with the posts SOCIA read for it. */
export type TrendAccount = {
  platform: string;
  name: string;
  handle: string;
  avatar: string | null;
  posts: CompPost[];
};

const SHORT = new Set(["Reel", "Short"]);

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Every recent Reel and Short from the accounts and from what discovery
 * found, best first. Instagram posts are measured against the account's own
 * median: views once Meta returned views for three or more of its posts,
 * otherwise likes plus comments. YouTube and discovery posts keep the
 * multiplier they were read with.
 */
export function rankTrendingReels(accounts: TrendAccount[], content: NichePost[], now: Date): TrendingReel[] {
  const cutoff = now.getTime() - TREND_WINDOW_DAYS * 86400000;
  const recent = (iso: string | null) => !iso || new Date(iso).getTime() >= cutoff;
  const reels = new Map<string, TrendingReel>();
  const inter = (p: { likes: number | null; comments: number | null }) => (p.likes != null || p.comments != null ? (p.likes ?? 0) + (p.comments ?? 0) : null);
  for (const r of accounts) {
    const shorts = r.posts.filter((p) => p.format && SHORT.has(p.format) && p.url);
    const base = r.platform === "instagram" ? median(r.posts.map(inter).filter((v): v is number => v != null)) : null;
    const igViews = r.platform === "instagram" ? r.posts.map((p) => p.views).filter((v): v is number => v != null) : [];
    const viewBase = igViews.length >= 3 ? median(igViews) : null;
    for (const p of shorts) {
      if (!recent(p.publishedAt)) continue;
      const i = inter(p);
      const byViews = r.platform === "instagram" && viewBase != null && viewBase > 0 && p.views != null;
      const multiplier = r.platform === "instagram"
        ? (byViews ? p.views! / viewBase! : base && base > 0 && i != null && r.posts.length >= 3 ? i / base : null)
        : p.multiplier;
      reels.set(p.url, {
        url: p.url, platform: r.platform, accountName: r.name, accountHandle: r.handle, accountAvatar: r.avatar,
        title: p.title, thumb: p.thumb, publishedAt: p.publishedAt, views: p.views, likes: p.likes, comments: p.comments,
        multiplier, basis: r.platform === "instagram" && !byViews ? "likes and comments" : "views", format: p.format!,
      });
    }
  }
  for (const c of content) {
    if (!c.format || !SHORT.has(c.format) || reels.has(c.url) || !recent(c.publishedAt)) continue;
    reels.set(c.url, {
      url: c.url, platform: c.platform, accountName: c.accountName ?? c.accountHandle ?? "An account in your niche",
      accountHandle: c.accountHandle, accountAvatar: null, title: c.title, thumb: c.thumb, publishedAt: c.publishedAt,
      views: c.views, likes: c.likes, comments: c.comments, multiplier: c.multiplier,
      basis: c.views != null ? "views" : "likes and comments", format: c.format,
    });
  }
  return [...reels.values()]
    .sort((a, b) => (b.multiplier ?? -1) - (a.multiplier ?? -1) || ((b.views ?? b.likes ?? 0) - (a.views ?? a.likes ?? 0)));
}

/**
 * The opening line of a caption or title: its first line, without links,
 * hashtags, mentions or leading emoji, cut at the first sentence end. Null when
 * fewer than three words are left, since that is no hook to learn from.
 */
export function hookLine(title: string | null): string | null {
  if (!title) return null;
  let s = title.split("\n").map((x) => x.trim()).find(Boolean) ?? "";
  s = s.replace(/https?:\/\/\S+/g, " ").replace(/(^|\s)[#@][\p{L}\p{N}_.]+/gu, " ");
  s = s.replace(/^[^\p{L}\p{N}"'“¿¡]+/u, "").replace(/\s+/g, " ").trim();
  const end = s.search(/[.!?…](\s|$)/);
  if (end >= 12 && end < 140) s = s.slice(0, end + 1);
  if (s.length > 120) s = `${s.slice(0, 117).replace(/\s+\S*$/, "")}…`;
  s = s.replace(/[^\p{L}\p{N}?!.…"'”)]+$/u, "").trim();
  const words = s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  return words.length >= 3 ? s : null;
}

/** The hook structures an opening line uses: the hook family of SOCIA's tag vocabulary, plus an opening question. */
export function hookStructures(line: string): string[] {
  const out = detectTrendTags(line).filter((t) => tagGroup(t) === "hook");
  if (/\?\s*$/.test(line) || /^(why|how|what|who|which|when|where|is|are|do|does|did|can|would|should|have|ever)\b[^.!]*\?/i.test(line)) out.push("Question");
  return out;
}

export type TrendExample = {
  line: string;
  url: string;
  platform: string;
  account: string;
  multiplier: number | null;
  basis: TrendingReel["basis"];
};

export type TrendGroup = {
  label: string;
  kind: "hook" | "topic";
  posts: number;
  accounts: number;
  /** Posts whose creator's median is known, and how many of those beat it. */
  withBaseline: number;
  aboveBaseline: number;
  medianMultiplier: number | null;
  leads: boolean;
  /** Up to three, best first, from different accounts where possible. */
  examples: TrendExample[];
};

export type TrendSignals = {
  /** Recent Reels and Shorts read, and how many accounts they came from. */
  reelsRead: number;
  accounts: number;
  hooks: TrendGroup[];
  topics: TrendGroup[];
  /** Opening lines of the posts that beat their creator's usual by STRONG_HOOK_AT or more, best first. */
  strongLines: TrendExample[];
};

const accountKey = (r: TrendingReel) => `${r.platform}:${(r.accountHandle ?? r.accountName).toLowerCase().replace(/^@/, "")}`;
const accountLabel = (r: TrendingReel) => (r.accountHandle ? `@${r.accountHandle.replace(/^@/, "")}` : r.accountName);

function exampleOf(r: TrendingReel, line: string): TrendExample {
  return { line, url: r.url, platform: r.platform, account: accountLabel(r), multiplier: r.multiplier, basis: r.basis };
}

function pickExamples(items: { r: TrendingReel; line: string | null }[]): TrendExample[] {
  const sorted = [...items].filter((x) => x.line).sort((a, b) => (b.r.multiplier ?? -1) - (a.r.multiplier ?? -1));
  const out: TrendExample[] = [];
  const used = new Set<string>();
  for (const pass of [true, false]) {
    for (const x of sorted) {
      if (out.length >= 3) break;
      if (out.some((e) => e.url === x.r.url)) continue;
      if (pass && used.has(accountKey(x.r))) continue;
      used.add(accountKey(x.r));
      out.push(exampleOf(x.r, x.line!));
    }
  }
  return out;
}

function group(label: string, kind: TrendGroup["kind"], items: { r: TrendingReel; line: string | null }[]): TrendGroup | null {
  const accounts = new Set(items.map((x) => accountKey(x.r))).size;
  if (items.length < TREND_MIN_POSTS || accounts < TREND_MIN_ACCOUNTS) return null;
  const ms = items.map((x) => x.r.multiplier).filter((m): m is number => m != null && Number.isFinite(m));
  const med = median(ms);
  return {
    label, kind, posts: items.length, accounts,
    withBaseline: ms.length, aboveBaseline: ms.filter((m) => m > 1).length,
    medianMultiplier: med, leads: ms.length >= TREND_MIN_POSTS && med != null && med >= TREND_LEADS_AT,
    examples: pickExamples(items),
  };
}

const byStrength = (a: TrendGroup, b: TrendGroup) =>
  Number(b.leads) - Number(a.leads) || (b.medianMultiplier ?? -1) - (a.medianMultiplier ?? -1) || b.posts - a.posts;

/** Hook structures and topics across the niche's recent Reels, and its strongest opening lines. */
export function trendSignals(reels: TrendingReel[], opts: { loc?: string[]; max?: number } = {}): TrendSignals {
  const max = opts.max ?? 6;
  const hookItems = new Map<string, { r: TrendingReel; line: string | null }[]>();
  const topicItems = new Map<string, { r: TrendingReel; line: string | null }[]>();
  for (const r of reels) {
    const line = hookLine(r.title);
    if (line) for (const h of hookStructures(line)) hookItems.set(h, [...(hookItems.get(h) ?? []), { r, line }]);
    for (const t of tagsFor(r.title, opts.loc ?? []).filter((x) => tagGroup(x) === "theme")) {
      topicItems.set(t, [...(topicItems.get(t) ?? []), { r, line }]);
    }
  }
  const hooks = [...hookItems].map(([l, xs]) => group(l, "hook", xs)).filter((g): g is TrendGroup => g !== null).sort(byStrength).slice(0, max);
  const topics = [...topicItems].map(([l, xs]) => group(l, "topic", xs)).filter((g): g is TrendGroup => g !== null).sort(byStrength).slice(0, max);

  const strongLines: TrendExample[] = [];
  const perAccount = new Map<string, number>();
  for (const r of [...reels].sort((a, b) => (b.multiplier ?? -1) - (a.multiplier ?? -1))) {
    if (strongLines.length >= 8) break;
    if (r.multiplier == null || r.multiplier < STRONG_HOOK_AT) continue;
    const line = hookLine(r.title);
    if (!line) continue;
    const k = accountKey(r);
    if ((perAccount.get(k) ?? 0) >= 2) continue;
    perAccount.set(k, (perAccount.get(k) ?? 0) + 1);
    strongLines.push(exampleOf(r, line));
  }

  return { reelsRead: reels.length, accounts: new Set(reels.map(accountKey)).size, hooks, topics, strongLines };
}

const x = (m: number) => `${m >= 10 ? m.toFixed(0) : m.toFixed(1)}x`;

function groupLine(g: TrendGroup): string {
  const result = g.medianMultiplier != null
    ? `median ${x(g.medianMultiplier)} their creators' usual (${g.aboveBaseline} of ${g.withBaseline} with a baseline beat it)`
    : "no creator baselines to compare against";
  return `- ${g.label}: ${g.posts} Reels from ${g.accounts} accounts, ${result}${g.leads ? ", LEADS" : ""}`;
}

/**
 * The niche's trends as evidence for the plan strategist and the idea writer.
 * Opening lines are given only as the structure they use, never as text to
 * reuse, and every number is other accounts' results, not this account's.
 */
export function trendsEvidence(s: TrendSignals | null): string {
  if (!s || (!s.hooks.length && !s.topics.length && !s.strongLines.length)) return "";
  const lines: string[] = [
    `SOCIA read ${s.reelsRead} recent Reels and Shorts (last ${TREND_WINDOW_DAYS} days) from ${s.accounts} accounts in this niche. "x" is a post's result over its own creator's median; these are other accounts' results, not a prediction for this one. A group needs ${TREND_MIN_POSTS} Reels from ${TREND_MIN_ACCOUNTS} accounts, and LEADS means a median of ${TREND_LEADS_AT}x or more.`,
  ];
  if (s.hooks.length) lines.push("", "Hook structures in their opening lines:", ...s.hooks.map(groupLine));
  if (s.topics.length) lines.push("", "Topics:", ...s.topics.map(groupLine));
  if (s.strongLines.length) {
    lines.push("", `Opening lines of the Reels that beat their creator's usual by ${STRONG_HOOK_AT}x or more (other people's words: learn the structure, never reuse the wording):`);
    for (const e of s.strongLines) lines.push(`- "${e.line}" (${e.account}, ${x(e.multiplier!)} their median ${e.basis})`);
  }
  return lines.join("\n");
}
