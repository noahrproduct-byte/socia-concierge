// The selected competitor, explained from the posts SOCIA actually read.
//
// A LeaderRow carries the account-level numbers with their provenance; this
// file adds the post-level layer (recent uploads or Business Discovery
// media) and turns it into counted patterns, evidence-backed reasons and at
// most three recommendations. Every sentence produced here carries the
// numbers it came from. Browser-safe: no SDK imports.

import type { Cell, LeaderRow } from "./competitorRollup";
import type { Comparison, MetricKey, SimilarPick } from "./similarCompetitor";
import { locationTokens, tagsFor } from "./competitorPatterns";
import { styleTags, tagGroup } from "./discovery";

export type CompPost = {
  url: string;
  title: string | null;
  thumb: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  publishedAt: string | null;
  /** Short | Video | Reel | Photo | Carousel, as the platform reports it. */
  format: string | null;
  durationSec: number | null;
  /** views ÷ the account's own median across the posts read; null unless real. */
  multiplier: number | null;
};

export type PostsGate = "connection_needed" | "not_business" | "not_found" | "no_permission" | "unavailable" | "failed";

export type CompetitorRow = LeaderRow & {
  description: string | null;
  location: string | null;
  /** Discovery's stated reasons for the relevance score. */
  reasons: string[];
  /** Lifetime post/video count where the platform publishes it. */
  postsCount: number | null;
  posts: CompPost[];
  postsSource: "youtube_api" | "instagram_discovery" | null;
  /** Why posts are absent, when they are. */
  postsGate: PostsGate | null;
};

const med = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Attach each post's multiple of the account's own median views. Needs at
 *  least three posts with a view count; otherwise no post gets a multiple. */
export function withBaseline(posts: CompPost[]): CompPost[] {
  const views = posts.map((p) => p.views).filter((v): v is number => v != null);
  const m = views.length >= 3 ? med(views) : null;
  return posts.map((p) => ({ ...p, multiplier: m && m > 0 && p.views != null ? p.views / m : null }));
}

export type PatternRow = {
  tag: string;
  count: number;
  total: number;
  share: number;
  medianMultiplier: number | null;
  examples: CompPost[];
};

export type GroupedPatterns = {
  total: number;
  minSample: number;
  insufficient: boolean;
  format: PatternRow[];
  themes: PatternRow[];
  hooks: PatternRow[];
  style: PatternRow[];
};

const EMPTY: GroupedPatterns = { total: 0, minSample: 5, insufficient: true, format: [], themes: [], hooks: [], style: [] };

/** Counted patterns across the posts read, split into what the platform
 *  reports (format) and what the titles/captions show (themes, hooks, style). */
export function groupedPatterns(posts: CompPost[], location: string | null | undefined, minSample = 5): GroupedPatterns {
  const total = posts.length;
  if (total < minSample) return { ...EMPTY, total, minSample };
  const loc = locationTokens(location);
  const build = (pick: (p: CompPost) => string[], minCount: number) => {
    const by = new Map<string, CompPost[]>();
    for (const p of posts) for (const t of pick(p)) by.set(t, [...(by.get(t) ?? []), p]);
    return [...by.entries()]
      .map(([tag, items]) => ({
        tag,
        count: items.length,
        total,
        share: Math.round((items.length / total) * 100),
        medianMultiplier: med(items.map((i) => i.multiplier).filter((m): m is number => m != null)),
        examples: [...items].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 6),
      }))
      .filter((r) => r.count >= minCount)
      .sort((a, b) => b.count - a.count || (b.medianMultiplier ?? 0) - (a.medianMultiplier ?? 0));
  };
  const textTags = (p: CompPost) => tagsFor(p.title, loc);
  return {
    total, minSample, insufficient: false,
    format: build((p) => (p.format ? [p.format === "Short" ? "Shorts" : p.format === "Video" ? "Videos" : `${p.format}s`] : []), 1),
    themes: build((p) => textTags(p).filter((t) => tagGroup(t) === "theme"), 2),
    hooks: build((p) => textTags(p).filter((t) => tagGroup(t) === "hook"), 2),
    style: build((p) => [...textTags(p).filter((t) => tagGroup(t) === "style"), ...styleTags(p.title)], 2),
  };
}

export type Reason = {
  key: MetricKey;
  title: string;
  detail: string;
  icon: "calendar" | "reach" | "users" | "heart";
  you: Cell;
  them: Cell;
  unit: Comparison["unit"];
  diffPct: number;
};

const fmtN = (n: number): string =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : Math.round(n).toLocaleString("en-US");

const fmtBy = (unit: Comparison["unit"], v: number) =>
  unit === "pct" ? `${v.toFixed(1)}%` : unit === "perWeek" ? v.toFixed(1) : fmtN(v);

/** Why they are ahead: at most three, each from one comparison the user can
 *  see, in a fixed order of usefulness. Nothing without both numbers. */
export function reasonsFor(pick: SimilarPick, shortForm: boolean): Reason[] {
  const order: MetricKey[] = ["cadence", "medianViews", "audience", "engagement"];
  const out: Reason[] = [];
  for (const key of order) {
    const c = pick.comparisons.find((x) => x.key === key);
    if (!c || c.diffPct == null || c.diffPct <= 0 || c.you.value == null || c.them.value == null) continue;
    const yours = fmtBy(c.unit, c.you.value);
    const theirs = fmtBy(c.unit, c.them.value);
    const ratio = c.you.value > 0 ? c.them.value / c.you.value : null;
    switch (key) {
      case "cadence":
        out.push({ key, icon: "calendar", title: "Posting more consistently", detail: `They publish ${theirs} posts per week vs. your ${yours}.`, you: c.you, them: c.them, unit: c.unit, diffPct: c.diffPct });
        break;
      case "medianViews":
        out.push({ key, icon: "reach", title: shortForm ? "Stronger short-form reach" : "Stronger typical reach", detail: `Their recent ${shortForm ? "short-form posts" : "posts"} get ${ratio != null && ratio >= 1.1 ? `${ratio.toFixed(1)}× higher` : "higher"} median views.`, you: c.you, them: c.them, unit: c.unit, diffPct: c.diffPct });
        break;
      case "audience":
        out.push({ key, icon: "users", title: "Larger audience", detail: `They have ${Math.round(c.diffPct)}% more ${pick.row.platform === "youtube" ? "subscribers" : "followers"}, giving their content broader reach.`, you: c.you, them: c.them, unit: c.unit, diffPct: c.diffPct });
        break;
      case "engagement":
        out.push({ key, icon: "heart", title: "Higher engagement rate", detail: `${theirs} engagement rate against your ${yours}.`, you: c.you, them: c.them, unit: c.unit, diffPct: c.diffPct });
        break;
    }
  }
  return out.slice(0, 3);
}

export type LearningAction =
  | { kind: "plan"; label: string; note: string }
  | { kind: "ideas"; label: string; question: string }
  | { kind: "examples"; label: string; tag: string | null };

export type Learning = { n: number; title: string; observed: string; action: LearningAction };

/** At most three recommendations, each mapped to a comparison or a counted
 *  pattern on screen. Fewer honest actions beat a padded list. */
export function learnings(pick: SimilarPick, patterns: GroupedPatterns): Learning[] {
  const out: Learning[] = [];
  const name = pick.row.name;
  const short = patterns.format.find((f) => f.tag === "Shorts" || f.tag === "Reels");

  const cad = pick.comparisons.find((c) => c.key === "cadence");
  if (cad?.diffPct != null && cad.diffPct > 0 && cad.you.value != null && cad.them.value != null) {
    const extra = Math.max(1, Math.ceil(cad.them.value - cad.you.value));
    const shortLine = short ? ` ${short.count} of their last ${short.total} posts are ${short.tag.toLowerCase()}.` : "";
    out.push({
      n: 0,
      title: short ? "Post more short-form content" : "Post more consistently",
      observed: `They publish ${cad.them.value.toFixed(1)} posts per week vs. your ${cad.you.value.toFixed(1)}.${shortLine}`,
      action: { kind: "plan", label: "Add to Plan", note: `Add ${extra} more ${short ? short.tag.slice(0, -1).toLowerCase() : "post"}${extra === 1 ? "" : "s"} this week: ${name} publishes ${cad.them.value.toFixed(1)}/week to my ${cad.you.value.toFixed(1)}.` },
    });
  }

  const theme = patterns.themes[0];
  if (theme && out.length < 3) {
    out.push({
      n: 0,
      title: `Lean into ${theme.tag.toLowerCase()}`,
      observed: `${theme.count} of their last ${theme.total} posts use it${theme.medianMultiplier != null ? `, at a median ${theme.medianMultiplier.toFixed(1)}× their own baseline` : ""}.`,
      action: { kind: "ideas", label: "Generate Ideas", question: `${name} uses "${theme.tag}" in ${theme.count} of their last ${theme.total} posts. Give me three concrete post ideas for my own account in that direction: hook, structure and caption for each.` },
    });
  }

  const hook = patterns.hooks[0];
  if (hook && out.length < 3) {
    out.push({
      n: 0,
      title: `Open with a ${/^[A-Z]{2,}$/.test(hook.tag) ? hook.tag : hook.tag.toLowerCase()}`,
      observed: `${hook.count} of their last ${hook.total} titles use this structure${hook.medianMultiplier != null ? `, at a median ${hook.medianMultiplier.toFixed(1)}× their baseline` : ""}.`,
      action: { kind: "examples", label: "See Examples", tag: hook.tag },
    });
  }

  const local = patterns.themes.find((p) => p.tag === "Local / location language");
  if (local && local !== theme && out.length < 3) {
    out.push({
      n: 0,
      title: "Use stronger local framing",
      observed: `Location references appear in ${local.count} of their last ${local.total} posts.`,
      action: { kind: "ideas", label: "Generate Ideas", question: `Give me a post idea for my account that leads with my local area, the way ${name} does in ${local.count} of ${local.total} recent posts.` },
    });
  }

  const mv = pick.comparisons.find((c) => c.key === "medianViews");
  if (mv?.diffPct != null && mv.diffPct > 0 && out.length < 3 && mv.you.value != null && mv.them.value != null) {
    out.push({
      n: 0,
      title: "Study what carries their reach",
      observed: `Median views: you ${fmtN(mv.you.value)}, ${name} ${fmtN(mv.them.value)}.`,
      action: { kind: "examples", label: "See Examples", tag: null },
    });
  }

  return out.slice(0, 3).map((r, i) => ({ ...r, n: i + 1 }));
}
