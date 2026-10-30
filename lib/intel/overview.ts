// The Overview's intelligence sections, built only from data SOCIA has:
//   growthBriefing  a few sentences, each from a computed fact or a stored
//                   finding, naming its source; says what's missing instead
//                   of filling the space
//   whatWorks       formats compared with the account's own median, only on
//                   fair samples
//   nextActions     at most three, each with its reason, evidence and what it
//                   will teach
//   recentLearning  what changed: plan results, findings that appeared or no
//                   longer hold
// Pure.

import { GOAL_PLATFORM_NAME, MAIN_GOALS, type GoalPlatform, type GrowthProfile } from "../growth";
import type { AccountSample } from "./accountSample";
import { confidenceWord, type StoredInsight } from "./insight";

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ---------------------------------------------------------------------------
// What is working
// ---------------------------------------------------------------------------

export type WorkRow = { platform: GoalPlatform; format: string; posts: number; multiple: number; metric: string };

/**
 * Each platform's formats against that platform's own median, by the
 * platform's headline metric. A format needs 3+ posts and the platform 6+,
 * otherwise it isn't compared: a two-post "winner" is noise.
 */
export function whatWorks(sample: AccountSample): WorkRow[] {
  const out: WorkRow[] = [];
  const byPlatform = new Map<GoalPlatform, AccountSample["posts"]>();
  for (const p of sample.posts) if (p.metric) byPlatform.set(p.platform, [...(byPlatform.get(p.platform) ?? []), p]);
  for (const [platform, posts] of byPlatform) {
    if (posts.length < 6) continue;
    const all = median(posts.map((p) => p.metric!.value));
    if (!all || all <= 0) continue;
    const formats = new Map<string, number[]>();
    for (const p of posts) formats.set(p.format, [...(formats.get(p.format) ?? []), p.metric!.value]);
    if (formats.size < 2) continue;
    for (const [format, values] of formats) {
      if (values.length < 3) continue;
      out.push({ platform, format, posts: values.length, multiple: r1(median(values)! / all), metric: posts[0].metric!.name });
    }
  }
  return out.sort((a, b) => b.multiple - a.multiple);
}

// ---------------------------------------------------------------------------
// Growth briefing
// ---------------------------------------------------------------------------

export type BriefingLine = { text: string; source: string };
export type GrowthBriefing = { lines: BriefingLine[]; missing: string[] };

export function growthBriefing(input: {
  brandName: string | null;
  niche: string | null;
  growth: GrowthProfile | null;
  sample: AccountSample;
  works: WorkRow[];
  insights: StoredInsight[];
  goalLine: string | null;
}): GrowthBriefing {
  const lines: BriefingLine[] = [];
  const missing: string[] = [];
  const g = input.growth ?? {};
  const facts = input.sample.facts;

  // Who and where: confirmed profile + connected platforms.
  const kind = [g.niche_path?.specific || g.niche_path?.subcategory || input.niche].find(Boolean);
  const where = facts.map((f) => GOAL_PLATFORM_NAME[f.platform]);
  const pace = facts.map((f) => f.postsPerWeek).filter((n): n is number => n != null);
  if (where.length) {
    const paceText = pace.length ? `, posting about ${r1(pace.reduce((a, b) => a + b, 0))} times a week lately` : "";
    lines.push({ text: `${input.brandName ?? "Your account"}${kind ? ` (${kind})` : ""} on ${where.join(" and ")}${paceText}.`, source: "Your connected accounts" });
  } else {
    missing.push("No account is connected, so there are no numbers of yours yet.");
  }

  // What is working, only when a format clearly leads on a fair sample.
  const lead = input.works.find((w) => w.multiple >= 1.3);
  if (lead) {
    lines.push({
      text: `${lead.format}s are doing best on ${GOAL_PLATFORM_NAME[lead.platform]}: their median ${lead.metric} per post is ${lead.multiple}x the account's median across ${plural(lead.posts, "post")}.`,
      source: `${GOAL_PLATFORM_NAME[lead.platform]} posts compared with the account's own median`,
    });
  } else if (where.length) {
    missing.push("Not enough posts in different formats yet to say which works best.");
  }

  // What needs attention: a diagnostic first, then a decline.
  const attention = input.insights.find((i) => i.category === "diagnostic") ?? input.insights.find((i) => /declin|fewer|dropped/i.test(i.title));
  if (attention) {
    const from = attention.platform ? `your ${GOAL_PLATFORM_NAME[attention.platform]} posts` : "your posts";
    lines.push({ text: `Needs a look: ${attention.title.replace(/\.$/, "")}.`, source: `SOCIA finding from ${from} (${confidenceWord(attention.confidence).toLowerCase()})` });
  }

  // The goal, as the person set it.
  if (input.goalLine) lines.push({ text: input.goalLine, source: "Your Growth Profile goal" });
  else if (!g.main_goal) missing.push("No main goal is set, so recommendations aren't weighted toward one.");

  return { lines, missing };
}

/** "Main goal: Gain followers. 1,240 now, 760 to go by Dec 31." from the goal and its current reading. */
export function goalLine(growth: GrowthProfile | null, progress: { label: string; current: string | null; remaining: string | null; due: string | null } | null): string | null {
  const main = MAIN_GOALS.find((m) => m.id === growth?.main_goal);
  if (!main && !progress) return null;
  const head = `Main goal: ${progress?.label ?? main!.label}.`;
  if (!progress || progress.current == null) return head;
  return `${head} ${progress.current} now${progress.remaining ? `, ${progress.remaining} to go` : ""}${progress.due ? ` by ${progress.due}` : ""}.`;
}

// ---------------------------------------------------------------------------
// Next three actions
// ---------------------------------------------------------------------------

export type NextAction = { title: string; reason: string; evidence: string | null; learning: string | null; href: string; from: "finding" | "setup" };

const CATEGORY_RANK: Record<StoredInsight["category"], number> = { diagnostic: 0, goal: 1, performance: 2, content: 3, niche: 4 };

export function nextActions(input: {
  insights: StoredInsight[];
  connectedCount: number;
  goalPlatformMissing: GoalPlatform | null;
  planThisWeek: boolean;
  scheduledSoon: number;
  trackedCompetitors: number;
}): NextAction[] {
  const out: NextAction[] = [];
  if (!input.connectedCount) out.push({ title: "Connect an account", reason: "SOCIA needs your real numbers before it can recommend anything specific.", evidence: null, learning: null, href: "/settings#accounts", from: "setup" });

  const ranked = [...input.insights]
    .filter((i) => i.recommendation)
    .sort((a, b) => CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] || b.confidence - a.confidence);
  for (const i of ranked) {
    if (out.length >= 3) break;
    out.push({ title: i.recommendation!.action, reason: i.recommendation!.why, evidence: i.observation, learning: i.recommendation!.learning || null, href: i.recommendation!.href ?? "/analytics", from: "finding" });
  }

  const setup: NextAction[] = [];
  if (input.goalPlatformMissing) setup.push({ title: `Connect ${GOAL_PLATFORM_NAME[input.goalPlatformMissing]}`, reason: "Your goal is measured there and SOCIA can't read it yet.", evidence: null, learning: null, href: "/settings#accounts", from: "setup" });
  if (input.connectedCount && !input.planThisWeek) setup.push({ title: "Make this week's plan", reason: "There's no plan from the last 7 days to work from.", evidence: null, learning: "Which planned posts beat your median once they go out.", href: "/tool", from: "setup" });
  if (input.connectedCount && input.scheduledSoon === 0) setup.push({ title: "Schedule your next post", reason: "Nothing is set to go out in the next 3 days.", evidence: null, learning: null, href: "/create", from: "setup" });
  if (input.connectedCount && input.trackedCompetitors === 0) setup.push({ title: "Add two accounts to watch", reason: "SOCIA compares your posts with similar accounts once it has some.", evidence: null, learning: null, href: "/competitors", from: "setup" });
  for (const s of setup) if (out.length < 3) out.push(s);
  return out.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Recent learning
// ---------------------------------------------------------------------------

export type LearningLine = { text: string; when: string | null; kind: "plan" | "new" | "ended" };

export function recentLearning(input: { planOutcome: string | null; planAt: string | null; active: StoredInsight[]; ended: StoredInsight[]; now: Date }): LearningLine[] {
  const week = input.now.getTime() - 7 * 86_400_000;
  const out: LearningLine[] = [];
  if (input.planOutcome) out.push({ text: `Last plan so far: ${input.planOutcome}`, when: input.planAt, kind: "plan" });
  for (const i of input.active.filter((x) => Date.parse(x.createdAt) >= week).slice(0, 3)) out.push({ text: `New: ${i.title}`, when: i.createdAt, kind: "new" });
  for (const i of input.ended.filter((x) => Date.parse(x.updatedAt) >= week).slice(0, 2)) out.push({ text: `No longer showing: ${i.title}`, when: i.updatedAt, kind: "ended" });
  return out;
}
