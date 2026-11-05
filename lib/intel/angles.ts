// What is working, by angle: the account's own posts grouped by how they open
// (hook) and what they are about (topic), each group against the platform's
// own median, on the same fair-sample rules as the format comparison in
// ./overview.ts. Reels-only accounts get a comparison this way too. Each group
// is matched with the niche's trends (lib/trendSignals.ts), and the hooks and
// topics that lead in the niche but the account hasn't used are listed to try.
// Pure.

import type { GoalPlatform } from "../growth";
import type { AccountSample } from "./accountSample";
import { tagsFor } from "../competitorPatterns";
import { tagGroup } from "../discovery";
import { hookLine, hookStructures, type TrendGroup, type TrendSignals } from "../trendSignals";

/** A platform needs this many posts with numbers, and an angle this many of them, before it is compared. */
export const ANGLE_MIN_PLATFORM_POSTS = 6;
export const ANGLE_MIN_POSTS = 3;

export type AngleKind = "hook" | "topic";

export type AngleRow = {
  platform: GoalPlatform;
  kind: AngleKind;
  label: string;
  posts: number;
  /** Median of the angle's posts against the platform's median, one decimal. */
  multiple: number;
  metric: string;
  /** The same hook or topic in the niche, when SOCIA read it there. */
  niche: { leads: boolean; multiple: number | null; posts: number; accounts: number } | null;
};

export type NicheTry = { kind: AngleKind; label: string; posts: number; accounts: number; multiple: number | null };

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/** The hooks and topics one caption or title carries, in SOCIA's tag vocabulary. */
export function anglesOf(text: string, loc: string[] = []): { hooks: string[]; topics: string[] } {
  const line = hookLine(text);
  return {
    hooks: line ? [...new Set(hookStructures(line))] : [],
    topics: [...new Set(tagsFor(text, loc).filter((t) => tagGroup(t) === "theme"))],
  };
}

const nicheGroup = (niche: TrendSignals | null | undefined, kind: AngleKind, label: string): TrendGroup | undefined =>
  (kind === "hook" ? niche?.hooks : niche?.topics)?.find((g) => g.label === label);

/**
 * Each platform's hooks and topics against that platform's own median. An
 * angle is compared only with 3+ posts on a platform with 6+, and only when
 * some posts don't use it (an angle on every post has nothing to beat).
 */
export function worksByAngle(sample: AccountSample, opts: { loc?: string[]; niche?: TrendSignals | null } = {}): AngleRow[] {
  const out: AngleRow[] = [];
  const byPlatform = new Map<GoalPlatform, AccountSample["posts"]>();
  for (const p of sample.posts) if (p.metric) byPlatform.set(p.platform, [...(byPlatform.get(p.platform) ?? []), p]);
  for (const [platform, posts] of byPlatform) {
    if (posts.length < ANGLE_MIN_PLATFORM_POSTS) continue;
    const all = median(posts.map((p) => p.metric!.value));
    if (!all || all <= 0) continue;
    const groups = new Map<string, { kind: AngleKind; label: string; values: number[] }>();
    for (const p of posts) {
      const a = anglesOf(p.text, opts.loc);
      for (const [kind, labels] of [["hook", a.hooks], ["topic", a.topics]] as const) {
        for (const label of labels) {
          const key = `${kind}:${label}`;
          const g = groups.get(key) ?? { kind, label, values: [] };
          g.values.push(p.metric!.value);
          groups.set(key, g);
        }
      }
    }
    for (const g of groups.values()) {
      if (g.values.length < ANGLE_MIN_POSTS || g.values.length >= posts.length) continue;
      const n = nicheGroup(opts.niche, g.kind, g.label);
      out.push({
        platform, kind: g.kind, label: g.label, posts: g.values.length,
        multiple: r1(median(g.values)! / all), metric: posts[0].metric!.name,
        niche: n ? { leads: n.leads, multiple: n.medianMultiplier, posts: n.posts, accounts: n.accounts } : null,
      });
    }
  }
  return out.sort((a, b) => b.multiple - a.multiple);
}

/** Hooks and topics that lead in the niche and none of the account's posts use, best first. */
export function nicheToTry(sample: AccountSample, niche: TrendSignals | null | undefined, opts: { loc?: string[]; max?: number } = {}): NicheTry[] {
  if (!niche) return [];
  const used = new Set<string>();
  for (const p of sample.posts) {
    const a = anglesOf(p.text, opts.loc);
    for (const h of a.hooks) used.add(`hook:${h}`);
    for (const t of a.topics) used.add(`topic:${t}`);
  }
  return [...niche.hooks, ...niche.topics]
    .filter((g) => g.leads && !used.has(`${g.kind}:${g.label}`))
    .sort((a, b) => (b.medianMultiplier ?? 0) - (a.medianMultiplier ?? 0))
    .slice(0, opts.max ?? 3)
    .map((g) => ({ kind: g.kind, label: g.label, posts: g.posts, accounts: g.accounts, multiple: g.medianMultiplier }));
}

/** Why worksByAngle has nothing to show, from the account's own counts. */
export function anglesGap(sample: AccountSample, loc: string[] = []): string {
  const posts = sample.posts.filter((p) => p.metric);
  if (posts.length < ANGLE_MIN_PLATFORM_POSTS) return `Hooks and topics are compared from ${ANGLE_MIN_PLATFORM_POSTS} posts with numbers on one platform.`;
  const tagged = posts.filter((p) => {
    const a = anglesOf(p.text, loc);
    return a.hooks.length + a.topics.length > 0;
  }).length;
  if (!tagged) return "SOCIA couldn't tell how your posts open or what they're about from their captions yet.";
  return `No hook or topic is on ${ANGLE_MIN_POSTS} of your posts yet while others go without it, so there is nothing to compare.`;
}
