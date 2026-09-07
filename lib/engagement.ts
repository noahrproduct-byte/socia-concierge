// One engagement definition for Analytics and the Dashboard.
//
//   interactions = likes + comments + saves + shares
//     (saves and shares only when Instagram returned them for that post)
//   engagement rate = interactions ÷ accounts reached, when every post in the
//     sample has reach; otherwise interactions ÷ followers, and the result says
//     which denominator it used. The formula never switches silently.
//
// Pure and browser-safe.

import type { IgMediaItem } from "./instagramSync";
import { median } from "./metrics";

export type Interactions = { likes: number; comments: number; saves: number | null; shares: number | null; total: number };

export function interactionsOf(m: IgMediaItem): Interactions {
  const likes = m.like_count ?? 0, comments = m.comments_count ?? 0;
  const saves = m.insights?.saved ?? null, shares = m.insights?.shares ?? null;
  return { likes, comments, saves, shares, total: likes + comments + (saves ?? 0) + (shares ?? 0) };
}

export const interactionsTotal = (m: IgMediaItem): number => interactionsOf(m).total;

export type RateMethod = "reach" | "followers";
export type EngagementRate = {
  /** Percent, or null when it can't be computed honestly. */
  value: number | null;
  method: RateMethod | null;
  /** One line a tooltip can show. */
  formula: string;
  /** Short suffix for a KPI note, e.g. "of reached accounts". */
  suffix: string;
  posts: number;
};

export const RATE_FORMULA: Record<RateMethod, string> = {
  reach: "(likes + comments + saves + shares) ÷ accounts reached, summed over the posts in the period",
  followers: "average (likes + comments + saves + shares) per post ÷ followers, because Instagram returned no reach for these posts",
};

/** Period engagement rate. Reach-based when every post has reach. */
export function engagementRateOf(posts: IgMediaItem[], followers: number | null): EngagementRate {
  if (!posts.length) return { value: null, method: null, formula: "No posts in the period.", suffix: "", posts: 0 };
  const inter = posts.reduce((s, m) => s + interactionsTotal(m), 0);
  const allReach = posts.every((m) => m.insights?.reach != null && m.insights.reach > 0);
  if (allReach) {
    const reach = posts.reduce((s, m) => s + (m.insights!.reach ?? 0), 0);
    return { value: (inter / reach) * 100, method: "reach", formula: RATE_FORMULA.reach, suffix: "of reached accounts", posts: posts.length };
  }
  if (followers && followers > 0) {
    return { value: (inter / posts.length / followers) * 100, method: "followers", formula: RATE_FORMULA.followers, suffix: "of followers", posts: posts.length };
  }
  return { value: null, method: null, formula: "Needs reach per post or a follower count.", suffix: "", posts: posts.length };
}

/** Per-post rate with the same rule (reach when present, else followers). */
export function postRate(m: IgMediaItem, followers: number | null): { value: number; method: RateMethod } | null {
  const t = interactionsTotal(m);
  if (m.insights?.reach != null && m.insights.reach > 0) return { value: (t / m.insights.reach) * 100, method: "reach" };
  if (followers && followers > 0) return { value: (t / followers) * 100, method: "followers" };
  return null;
}

export type Breakdown = {
  total: number;
  parts: { id: "likes" | "comments" | "saves" | "shares"; label: string; value: number | null; share: number | null }[];
  /** Posts that lacked saves/shares from Instagram (absence is not zero). */
  missing: number;
  posts: number;
};

export function engagementBreakdown(posts: IgMediaItem[]): Breakdown {
  let likes = 0, comments = 0, saves = 0, shares = 0, haveSaves = 0, haveShares = 0;
  for (const m of posts) {
    const i = interactionsOf(m);
    likes += i.likes; comments += i.comments;
    if (i.saves != null) { saves += i.saves; haveSaves++; }
    if (i.shares != null) { shares += i.shares; haveShares++; }
  }
  const total = likes + comments + saves + shares;
  const share = (v: number | null) => (v == null || total === 0 ? null : v / total);
  return {
    total, posts: posts.length, missing: posts.length - Math.min(haveSaves, haveShares),
    parts: [
      { id: "likes", label: "Likes", value: likes, share: share(likes) },
      { id: "comments", label: "Comments", value: comments, share: share(comments) },
      { id: "saves", label: "Saves", value: haveSaves ? saves : null, share: haveSaves ? share(saves) : null },
      { id: "shares", label: "Shares", value: haveShares ? shares : null, share: haveShares ? share(shares) : null },
    ],
  };
}

export type QualityNote = { id: string; tone: "up" | "down" | "flat" | "info"; title: string; detail: string };

const pct = (a: number, b: number) => ((a - b) / b) * 100;

/** Observations about the kind of engagement, each one backed by a comparison
 *  of medians with at least 4 posts on each side. Nothing is claimed below that. */
export function engagementQuality(posts: IgMediaItem[], formatOf: (m: IgMediaItem) => string): QualityNote[] {
  const dated = posts.filter((m) => m.timestamp).sort((a, b) => new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime());
  const out: QualityNote[] = [];
  const recent = dated.slice(0, 5), prior = dated.slice(5, 10);
  if (recent.length >= 4 && prior.length >= 4) {
    const cmp = (id: "likes" | "comments" | "saves" | "shares", label: string) => {
      const r = median(recent.map((m) => interactionsOf(m)[id]).filter((v): v is number => v != null));
      const p = median(prior.map((m) => interactionsOf(m)[id]).filter((v): v is number => v != null));
      if (r == null || p == null) return;
      if (p === 0 && r === 0) return;
      const change = p === 0 ? 100 : pct(r, p);
      const tone: QualityNote["tone"] = Math.abs(change) < 15 ? "flat" : change > 0 ? "up" : "down";
      out.push({
        id, tone,
        title: `${label} ${tone === "flat" ? "stable" : tone === "up" ? "increasing" : "declining"}`,
        detail: tone === "flat" ? `Median ${r.toLocaleString("en-US")} per post across your last 5, close to the 5 before.` : `${change > 0 ? "+" : ""}${change.toFixed(0)}% median per post, last 5 posts vs the 5 before (${r.toLocaleString("en-US")} vs ${p.toLocaleString("en-US")}).`,
      });
    };
    cmp("comments", "Comments"); cmp("saves", "Saves"); cmp("shares", "Shares");
  }
  // Which format earns saves and comments, when two formats each have 3+ posts.
  const byFmt = new Map<string, IgMediaItem[]>();
  for (const m of dated) byFmt.set(formatOf(m), [...(byFmt.get(formatOf(m)) ?? []), m]);
  const eligible = [...byFmt.entries()].filter(([, ms]) => ms.length >= 3);
  if (eligible.length >= 2) {
    for (const [id, label] of [["saves", "saves"], ["comments", "comments"]] as const) {
      const meds = eligible.map(([f, ms]) => ({ f, med: median(ms.map((m) => interactionsOf(m)[id]).filter((v): v is number => v != null)) ?? 0, n: ms.length })).sort((a, b) => b.med - a.med);
      if (meds[0].med > 0 && meds[0].med >= meds[1].med * 1.3) {
        out.push({ id: `fmt-${id}`, tone: "info", title: `${meds[0].f}s generate the most ${label}`, detail: `Median ${meds[0].med.toLocaleString("en-US")} ${label} per ${meds[0].f.toLowerCase()} (${meds[0].n} posts) vs ${meds[1].med.toLocaleString("en-US")} per ${meds[1].f.toLowerCase()} (${meds[1].n}).` });
      }
    }
  }
  return out;
}
