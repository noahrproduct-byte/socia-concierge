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

// ------------------------------------------------------------------ proven Reels ----
// The Reels a plan post or a video idea is built on. A Reel qualifies on a
// number the platform published: it beat its own creator's usual by PROVEN_AT,
// or, with no baseline to compare, it passed PROVEN_VIEWS views. The model
// cites a Reel by its id and SOCIA maps the id back, so a link or a number on
// a saved plan is never the model's.

export const PROVEN_AT = STRONG_HOOK_AT;
export const PROVEN_VIEWS = 100_000;

export type ProvenReel = TrendingReel & {
  /** R1, R2... its id in a prompt. */
  id: string;
  /** Whether it met the bar above; false only on Reels listed to fill the Discover section. */
  proven: boolean;
  /** Its opening line, the hook structures that line uses and its topics. */
  line: string | null;
  structures: string[];
  topics: string[];
};

/** Whether a Reel took off, by its own published numbers. */
export const isProven = (r: TrendingReel): boolean =>
  r.multiplier != null ? r.multiplier >= PROVEN_AT : (r.views ?? 0) >= PROVEN_VIEWS;

/**
 * The Reels that took off, best first, at most `perAccount` from one account.
 * With `fill`, the best of the rest follow (marked not proven) so a thin niche
 * still shows what was read.
 */
export function provenReels(reels: TrendingReel[], opts: { loc?: string[]; max?: number; perAccount?: number; fill?: boolean } = {}): ProvenReel[] {
  const max = opts.max ?? 8;
  const perAccount = opts.perAccount ?? 2;
  const ranked = [...reels].sort((a, b) => (b.multiplier ?? -1) - (a.multiplier ?? -1) || (b.views ?? 0) - (a.views ?? 0));
  const out: ProvenReel[] = [];
  const count = new Map<string, number>();
  for (const pass of opts.fill ? [true, false] : [true]) {
    for (const r of ranked) {
      if (out.length >= max) break;
      if (isProven(r) !== pass || out.some((o) => o.url === r.url)) continue;
      const k = accountKey(r);
      if ((count.get(k) ?? 0) >= perAccount) continue;
      count.set(k, (count.get(k) ?? 0) + 1);
      const line = hookLine(r.title);
      out.push({
        ...r, id: `R${out.length + 1}`, proven: pass, line,
        structures: line ? hookStructures(line) : [],
        topics: tagsFor(r.title, opts.loc ?? []).filter((t) => tagGroup(t) === "theme").slice(0, 2),
      });
    }
  }
  return out;
}

/** What a saved plan post or idea keeps of the Reel it was built on: the platform's own numbers when SOCIA read it. */
export type ReelRef = {
  url: string;
  platform: string;
  account: string;
  title: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  multiplier: number | null;
  basis: TrendingReel["basis"];
  /** The hook structure of its opening line, when it has one SOCIA recognises. */
  structure: string | null;
};

export function refOf(r: ProvenReel): ReelRef {
  return {
    url: r.url, platform: r.platform, account: accountLabel(r), title: r.line ?? (r.title ? r.title.slice(0, 120) : null),
    views: r.views, likes: r.likes, comments: r.comments, multiplier: r.multiplier != null ? Math.round(r.multiplier * 10) / 10 : null,
    basis: r.basis, structure: r.structures[0] ?? null,
  };
}

/** The Reel a model cited by id ("R3"), or null when it cited none or one that was never listed. */
export function pickRef(id: unknown, list: ProvenReel[]): ReelRef | null {
  if (typeof id !== "string") return null;
  const hit = list.find((r) => r.id === id.trim().toUpperCase());
  return hit ? refOf(hit) : null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** A stored reference read back, bounded; null when it isn't one. */
export function sanitizeRef(v: unknown): ReelRef | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.url !== "string" || !/^https:\/\/[^\s"'<>]+$/.test(o.url) || o.url.length > 400) return null;
  const s = (x: unknown, n: number) => (typeof x === "string" && x.trim() ? x.trim().slice(0, n) : null);
  const account = s(o.account, 80);
  const platform = s(o.platform, 20);
  if (!account || !platform) return null;
  return {
    url: o.url, platform, account, title: s(o.title, 160), views: num(o.views), likes: num(o.likes), comments: num(o.comments),
    multiplier: num(o.multiplier), basis: o.basis === "likes and comments" ? "likes and comments" : "views", structure: s(o.structure, 40),
  };
}

const PLATFORM_NAME: Record<string, string> = { instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok", facebook: "Facebook" };
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(Math.round(n)));

/** The reference's result in words: "2.4M views, 12x their usual". Only numbers the platform published. */
export function refResult(r: Pick<ReelRef, "views" | "likes" | "comments" | "multiplier">): string {
  const parts: string[] = [];
  if (r.views != null) parts.push(`${compact(r.views)} views`);
  else if (r.likes != null) parts.push(`${compact(r.likes)} likes`);
  if (r.multiplier != null) parts.push(`${x(r.multiplier)} their usual`);
  return parts.join(", ");
}

/** One line naming the reference: "@handle on Instagram: 2.4M views, 12x their usual". */
export function refLine(r: ReelRef): string {
  const result = refResult(r);
  return `${r.account} on ${PLATFORM_NAME[r.platform] ?? r.platform}${result ? `: ${result}` : ""}`;
}

/**
 * The proven Reels as evidence for the plan strategist and the idea writer.
 * Each line carries the id to cite. Other accounts' results, never a
 * prediction, and their wording is never reused.
 */
export function provenEvidence(list: ProvenReel[]): string {
  const proven = list.filter((r) => r.proven);
  if (!proven.length) return "";
  const lines = [
    `Reels and Shorts from this niche that took off in the last ${TREND_WINDOW_DAYS} days: each beat its own creator's usual by ${PROVEN_AT}x or more, or passed ${compact(PROVEN_VIEWS)} views. SOCIA read these numbers from the platforms. They are other accounts' results, not a prediction for this one.`,
  ];
  for (const r of proven) {
    const bits = [
      `${r.id}`,
      `${PLATFORM_NAME[r.platform] ?? r.platform} ${r.format} by ${accountLabel(r)}`,
      r.line ? `opens: "${r.line}"` : r.title ? `about: "${r.title.slice(0, 100)}"` : null,
      refResult(r) || null,
      r.structures.length ? `hook structure: ${r.structures.join(", ")}` : null,
      r.topics.length ? `topic: ${r.topics.join(", ")}` : null,
    ];
    lines.push(`- ${bits.filter(Boolean).join(" | ")}`);
  }
  return lines.join("\n");
}
