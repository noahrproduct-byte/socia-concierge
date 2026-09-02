// Patterns and recommendations for ONE selected competitor, from the posts
// SOCIA actually holds for them.
//
// Nothing here is estimated. A pattern is a count of posts whose title shows a
// detectable feature, over the posts analysed, with the median of their real
// performance multipliers where those exist. Below the minimum sample the
// caller gets `insufficient: true` and must say so — three posts are not a
// pattern, they are an anecdote.

import { detectTrendTags } from "./discovery";
import type { Observation, SimilarPick } from "./similarCompetitor";

export type PostLike = {
  title: string | null;
  multiplier: number | null;
  url: string;
};

export type Pattern = {
  tag: string;
  count: number;
  total: number;
  /** count / total, in percent — a real share, so a bar may represent it. */
  share: number;
  /** Median multiplier of the posts carrying this tag; null when none is real. */
  medianMultiplier: number | null;
  impact: "high" | "medium";
  examples: string[];
};

export type PatternResult = {
  total: number;
  minSample: number;
  insufficient: boolean;
  patterns: Pattern[];
};

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Location tokens worth matching in a title: city/region words, not "TN". */
export function locationTokens(location: string | null | undefined): string[] {
  return (location ?? "")
    .split(/[,/]/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 3);
}

/** Tags for one post: detected format/hook tags plus a local-language tag
 *  when the title names the user's own market. */
export function tagsFor(title: string | null, loc: string[]): string[] {
  const tags = detectTrendTags(title);
  const t = (title ?? "").toLowerCase();
  if (loc.some((l) => t.includes(l))) tags.push("Local / location language");
  return tags;
}

export function patternsFor(
  posts: PostLike[],
  location: string | null | undefined,
  minSample = 5,
): PatternResult {
  const total = posts.length;
  if (total < minSample) return { total, minSample, insufficient: true, patterns: [] };

  const loc = locationTokens(location);
  const by = new Map<string, PostLike[]>();
  for (const p of posts) for (const tag of tagsFor(p.title, loc)) by.set(tag, [...(by.get(tag) ?? []), p]);

  const patterns: Pattern[] = [...by.entries()]
    .map(([tag, items]) => {
      const share = Math.round((items.length / total) * 100);
      const mm = median(items.map((i) => i.multiplier).filter((m): m is number => m != null));
      return {
        tag,
        count: items.length,
        total,
        share,
        medianMultiplier: mm,
        // "High" needs both breadth and lift; a common but ordinary feature is medium.
        impact: (share >= 40 && (mm ?? 0) >= 1.5 ? "high" : "medium") as Pattern["impact"],
        examples: items.slice(0, 4).map((i) => i.url),
      };
    })
    .filter((p) => p.count >= 2)
    .sort((a, b) => b.count - a.count || (b.medianMultiplier ?? 0) - (a.medianMultiplier ?? 0));

  return { total, minSample, insufficient: false, patterns };
}

export type Recommendation = {
  n: number;
  title: string;
  evidence: string;
  test: string;
  cta: { label: string; href: string };
};

const fmtN = (n: number): string =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : Math.round(n).toLocaleString("en-US");

/** At most three actions, each mapped to a comparison or a counted pattern
 *  the user can see on the page. Nothing generic. */
export function recommendationsFor(
  pick: SimilarPick,
  observations: Observation[],
  patterns: PatternResult,
): Recommendation[] {
  const out: Recommendation[] = [];
  const name = pick.row.name;

  const cad = pick.comparisons.find((c) => c.key === "cadence");
  if (cad?.diffPct != null && cad.diffPct > 0 && cad.you.value != null && cad.them.value != null) {
    const extra = Math.max(1, Math.ceil(cad.them.value - cad.you.value));
    out.push({
      n: out.length + 1,
      title: "Increase posting frequency",
      evidence: `You: ${cad.you.value.toFixed(1)}/week · ${name}: ${cad.them.value.toFixed(1)}/week.`,
      test: `Add ${extra} more post${extra === 1 ? "" : "s"} this week to close the gap.`,
      cta: { label: "Add to Content Plan", href: "/tool" },
    });
  }

  const top = patterns.patterns[0];
  if (top && out.length < 3) {
    out.push({
      n: out.length + 1,
      title: `Try their strongest pattern: ${top.tag.toLowerCase()}`,
      evidence: `${top.count} of ${top.total} of their analysed posts use it${top.medianMultiplier ? `, at a median ${top.medianMultiplier.toFixed(1)}× their baseline` : ""}.`,
      test: "Make one post in this style and compare it with your own median.",
      cta: {
        label: "Generate content idea",
        href: `/chat?q=${encodeURIComponent(`${name} uses "${top.tag}" in ${top.count} of ${top.total} recent posts. Give me one concrete post idea for my own account in that style: hook, structure, caption.`)}`,
      },
    });
  }

  const local = patterns.patterns.find((p) => p.tag === "Local / location language");
  if (local && out.length < 3 && local !== top) {
    out.push({
      n: out.length + 1,
      title: "Use stronger local framing",
      evidence: `Location references appear in ${local.count} of ${local.total} of their analysed posts.`,
      test: "Name your neighbourhood or city in your next caption and on-screen text.",
      cta: {
        label: "Create local idea",
        href: `/chat?q=${encodeURIComponent(`Give me a post idea for my account that leads with my local area, the way ${name} does in ${local.count} of ${local.total} recent posts.`)}`,
      },
    });
  }

  const mv = pick.comparisons.find((c) => c.key === "medianViews");
  if (mv?.diffPct != null && mv.diffPct > 0 && out.length < 3 && mv.you.value != null && mv.them.value != null) {
    out.push({
      n: out.length + 1,
      title: "Study what carries their reach",
      evidence: `Median views: you ${fmtN(mv.you.value)} · ${name} ${fmtN(mv.them.value)}.`,
      test: "Open their winning content and note the first two seconds of each.",
      cta: { label: "Ask the strategist", href: `/chat?q=${encodeURIComponent(`${name} gets ${fmtN(mv.them.value)} median views to my ${fmtN(mv.you.value)}. Using only that fact and my niche, what should I change first?`)}` },
    });
  }

  // Never pad: fewer than three honest actions beats a generic one.
  return out.slice(0, 3).map((r, i) => ({ ...r, n: i + 1 }));
}
