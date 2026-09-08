// Niche intelligence from the posts SOCIA actually holds.
//
// Everything here is arithmetic over stored rows: counts, shares and medians
// of real public numbers, each returned with the sample it came from. Nothing
// predicts, nothing estimates, and a set too small to support a claim says so
// (`insufficient`) instead of producing one. Browser-safe: no SDK imports.

import { tagGroup } from "./discovery";

export type NichePost = {
  url: string;
  platform: string;
  accountName: string | null;
  accountHandle: string | null;
  title: string | null;
  thumb: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  publishedAt: string | null;
  /** views ÷ the creator's own median across recent uploads; null unless both are real. */
  multiplier: number | null;
  relevanceScore: number;
  tags: string[];
  format: string | null;
  /** Web-research note, when one exists. Interpretation, never data. */
  why: string | null;
  dataSource: string;
};

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const patternTags = (p: NichePost): string[] => p.tags.filter((t) => tagGroup(t) !== "style");

export const daysAgo = (iso: string | null, now: Date): number | null => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? (now.getTime() - t) / 86400000 : null;
};

/** Evidence tier: a computed baseline, then public counts, then a thumbnail.
 *  A link with nothing verifiable is still real, but it never leads. */
export const evidenceOf = (p: NichePost): number =>
  (p.multiplier != null ? 4 : 0) + (p.views != null ? 2 : 0) + (p.thumb ? 1 : 0);

/** The carousel order. Relevance to the user's niche, market, format and
 *  goal decides; performance against the creator's own baseline breaks ties.
 *  Raw view counts never enter the sort, so a giant channel's ordinary video
 *  does not outrank a comparable account's breakout. */
export function rankNiche(items: NichePost[], opts: { now: Date; days: number | null }): NichePost[] {
  const inRange = (p: NichePost) => {
    if (opts.days == null) return true;
    const d = daysAgo(p.publishedAt, opts.now);
    return d != null && d >= 0 && d <= opts.days;
  };
  return items
    .filter(inRange)
    .sort((a, b) =>
      evidenceOf(b) - evidenceOf(a) ||
      b.relevanceScore - a.relevanceScore ||
      (b.multiplier ?? 0) - (a.multiplier ?? 0) ||
      (new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime()));
}

export type WorkingRow = {
  tag: string;
  /** How many of the top posts carry it. */
  seenIn: number;
  of: number;
  /** Median baseline multiple of posts with the pattern ÷ median of the rest; null below the sample. */
  lift: number | null;
  withCount: number;
  withoutCount: number;
  example: NichePost | null;
};

export type WorkingResult = {
  insufficient: boolean;
  /** Posts with a real baseline in the window. */
  baselineCount: number;
  topCount: number;
  minTop: number;
  rows: WorkingRow[];
};

/** "What's working right now": the patterns that recur across the top posts
 *  (ranked by performance against each creator's own baseline) and how posts
 *  carrying each one compare with the rest. */
export function workingNow(items: NichePost[], opts: { topN?: number; minTop?: number; minTag?: number } = {}): WorkingResult {
  const topN = opts.topN ?? 10;
  const minTop = opts.minTop ?? 10;
  const minTag = opts.minTag ?? 2;
  const withBase = items.filter((p) => p.multiplier != null).sort((a, b) => b.multiplier! - a.multiplier!);
  if (withBase.length < minTop) return { insufficient: true, baselineCount: withBase.length, topCount: 0, minTop, rows: [] };
  const top = withBase.slice(0, topN);
  const counts = new Map<string, NichePost[]>();
  for (const p of top) for (const t of patternTags(p)) counts.set(t, [...(counts.get(t) ?? []), p]);
  const rows: WorkingRow[] = [];
  for (const [tag, posts] of counts) {
    if (posts.length < minTag) continue;
    const withTag = withBase.filter((p) => patternTags(p).includes(tag)).map((p) => p.multiplier!);
    const without = withBase.filter((p) => !patternTags(p).includes(tag)).map((p) => p.multiplier!);
    const a = median(withTag);
    const b = median(without);
    const lift = a != null && b != null && b > 0 && without.length >= 3 ? a / b : null;
    rows.push({ tag, seenIn: posts.length, of: top.length, lift, withCount: withTag.length, withoutCount: without.length, example: posts[0] ?? null });
  }
  rows.sort((x, y) => y.seenIn - x.seenIn || (y.lift ?? 0) - (x.lift ?? 0));
  return { insufficient: false, baselineCount: withBase.length, topCount: top.length, minTop, rows: rows.slice(0, 6) };
}

export type MomentumStatus = "Strong momentum" | "Growing" | "Emerging" | "Cooling" | "Declining";
export type MomentumRow = {
  tag: string;
  recent: number;
  earlier: number;
  recentShare: number;
  earlierShare: number;
  /** Percentage-point change in share of posts, recent period vs the earlier one. */
  deltaPts: number;
  status: MomentumStatus;
  example: NichePost | null;
};
export type MomentumResult = {
  insufficient: boolean;
  recentCount: number;
  earlierCount: number;
  minPerHalf: number;
  halfDays: number;
  up: MomentumRow[];
  down: MomentumRow[];
};

/** Direction of a pattern: its share of dated posts in the most recent half
 *  of the window against its share in the half before. Both halves need a
 *  real sample or nothing is called a trend. */
export function momentum(items: NichePost[], opts: { now: Date; windowDays?: number; minPerHalf?: number; minTag?: number }): MomentumResult {
  const windowDays = opts.windowDays ?? 90;
  const half = windowDays / 2;
  const minPerHalf = opts.minPerHalf ?? 5;
  const minTag = opts.minTag ?? 2;
  const recent: NichePost[] = [];
  const earlier: NichePost[] = [];
  for (const p of items) {
    const d = daysAgo(p.publishedAt, opts.now);
    if (d == null || d < 0 || d > windowDays) continue;
    (d <= half ? recent : earlier).push(p);
  }
  const base = { recentCount: recent.length, earlierCount: earlier.length, minPerHalf, halfDays: half };
  if (recent.length < minPerHalf || earlier.length < minPerHalf) return { insufficient: true, ...base, up: [], down: [] };

  const tally = (xs: NichePost[]) => {
    const m = new Map<string, NichePost[]>();
    for (const p of xs) for (const t of patternTags(p)) m.set(t, [...(m.get(t) ?? []), p]);
    return m;
  };
  const r = tally(recent);
  const e = tally(earlier);
  const tags = new Set([...r.keys(), ...e.keys()]);
  const up: MomentumRow[] = [];
  const down: MomentumRow[] = [];
  for (const tag of tags) {
    const rc = r.get(tag)?.length ?? 0;
    const ec = e.get(tag)?.length ?? 0;
    const rs = rc / recent.length;
    const es = ec / earlier.length;
    const deltaPts = Math.round((rs - es) * 100);
    const example = (r.get(tag) ?? e.get(tag) ?? [])[0] ?? null;
    const row = { tag, recent: rc, earlier: ec, recentShare: rs, earlierShare: es, deltaPts, example };
    if (rc >= minTag && ec === 0) up.push({ ...row, status: "Emerging" });
    else if (rc >= 3 && rs >= es * 2) up.push({ ...row, status: "Strong momentum" });
    else if (rc >= minTag && rs >= es * 1.25) up.push({ ...row, status: "Growing" });
    else if (ec >= minTag && rc === 0) down.push({ ...row, status: "Declining" });
    else if (ec >= minTag && rs <= es * 0.75) down.push({ ...row, status: "Cooling" });
  }
  up.sort((a, b) => b.deltaPts - a.deltaPts || b.recent - a.recent);
  down.sort((a, b) => a.deltaPts - b.deltaPts || b.earlier - a.earlier);
  return { insufficient: false, ...base, up: up.slice(0, 5), down: down.slice(0, 5) };
}

export type OwnPost = { tags: string[]; multiplier: number | null };
export type CompetitorUse = { tag: string; count: number; total: number };

export type Opportunity = {
  tag: string;
  score: number;
  /** Each line states the number it rests on. */
  why: { text: string; source: "niche" | "trend" | "competitor" | "you" | "goal" }[];
  example: NichePost | null;
  competitorName: string | null;
};

/** One opportunity, chosen only where several independent kinds of evidence
 *  point the same way. Returns null rather than a guess. */
export function pickOpportunity(input: {
  working: WorkingResult;
  momentum: MomentumResult;
  competitor: { name: string; rows: CompetitorUse[] } | null;
  own: OwnPost[];
  goalKeywords: string[];
}): Opportunity | null {
  const cands = new Map<string, Opportunity>();
  const get = (tag: string) => {
    let c = cands.get(tag);
    if (!c) { c = { tag, score: 0, why: [], example: null, competitorName: null }; cands.set(tag, c); }
    return c;
  };
  for (const w of input.working.rows) {
    if (w.lift != null && w.lift < 1.2) continue;
    const c = get(w.tag);
    c.score += 1 + (w.lift ?? 0);
    c.example = c.example ?? w.example;
    c.why.push({
      source: "niche",
      text: `Seen in ${w.seenIn} of the top ${w.of} niche posts${w.lift != null ? `, with a median ${w.lift.toFixed(1)}× the performance of posts without it` : ""}.`,
    });
  }
  for (const m of input.momentum.up) {
    const c = get(m.tag);
    c.score += m.status === "Strong momentum" ? 2 : m.status === "Growing" ? 1.5 : 1;
    c.example = c.example ?? m.example;
    c.why.push({ source: "trend", text: `${m.status}: ${m.recent} of ${input.momentum.recentCount} recent niche posts use it, against ${m.earlier} of ${input.momentum.earlierCount} in the period before.` });
  }
  if (input.competitor) {
    for (const r of input.competitor.rows) {
      const c = cands.get(r.tag);
      if (!c || r.total === 0) continue;
      if (r.count / r.total >= 0.3) {
        c.score += 1;
        c.competitorName = input.competitor.name;
        c.why.push({ source: "competitor", text: `${input.competitor.name} uses it in ${r.count} of their last ${r.total} posts.` });
      }
    }
  }
  const ownWith = (tag: string) => input.own.filter((p) => p.tags.includes(tag));
  for (const c of cands.values()) {
    const mine = ownWith(c.tag);
    if (input.own.length >= 5 && mine.length === 0) {
      c.score += 1;
      c.why.push({ source: "you", text: `You have not posted this pattern in your last ${input.own.length} posts, so it is an open lane for your account.` });
    } else if (mine.length) {
      const m = median(mine.map((p) => p.multiplier).filter((x): x is number => x != null));
      if (m != null && m >= 1.2) {
        c.score += 1.5;
        c.why.push({ source: "you", text: `Your ${mine.length} post${mine.length === 1 ? "" : "s"} with it ran ${m.toFixed(1)}× your median post.` });
      } else if (m != null && m < 0.8) {
        c.score -= 1;
        c.why.push({ source: "you", text: `Your ${mine.length} post${mine.length === 1 ? "" : "s"} with it ran ${m.toFixed(1)}× your median, so the execution, not the idea, is the test.` });
      }
    }
    const words = c.tag.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4);
    if (input.goalKeywords.some((k) => words.some((w) => w.startsWith(k) || k.startsWith(w)))) {
      c.score += 1;
      c.why.push({ source: "goal", text: "It matches the goal you set for this account." });
    }
  }
  const ranked = [...cands.values()]
    .filter((c) => new Set(c.why.map((w) => w.source)).size >= 2)
    .sort((a, b) => b.score - a.score);
  return ranked[0] ?? null;
}

/** Deterministic baseline explanation for a tooltip. */
export function baselineText(p: NichePost): { post: string; median: string; mult: string } | null {
  if (p.multiplier == null || p.views == null || p.multiplier <= 0) return null;
  const med = p.views / p.multiplier;
  const f = (n: number) => Math.round(n).toLocaleString("en-US");
  return { post: `${f(p.views)} views`, median: `${f(med)} views`, mult: `${p.multiplier.toFixed(1)}× baseline` };
}
