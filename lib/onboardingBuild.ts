// Onboarding's strategy step (Noah, 2026-11-15): after the goal is set SOCIA
// reads the accounts, looks at the recent posts, checks the niche and writes
// the strategy, and the screen shows each of those as it really happens
// (BuildEvent, one per real step on the server, never a timer). Then the
// reveal: where the account stands, the goal, three priorities, the week, and
// the SOCIA tools that fit. Every number is one the platforms returned;
// nothing is predicted and no result is promised. Pure and browser-safe.
import { GOAL_PLATFORM_NAME, formatGoalValue, goalMetric, mainGoalsFor, type CustomerGoalId, type Goal, type GoalMetricId, type GoalPlatform, type MainGoalId } from "./growth";
import type { GrowthStrategy } from "./strategy";
import { toolGroups, type ToolGroup } from "./onboardingTools";
import type { PlanId } from "./plans";
import { routineSummary, unanswered, type Routine } from "./routine";

export const STAGES = [
  { id: "accounts", label: "Reading your accounts" },
  { id: "content", label: "Looking at your recent posts" },
  { id: "niche", label: "Checking your niche and competitors" },
  { id: "strategy", label: "Building your strategy" },
] as const;
export type StageId = (typeof STAGES)[number]["id"];

/** Something a stage found that can be shown: one of the person's own posts, or a competitor. */
export type StageItem = { thumb: string | null; href: string | null; label: string; note: string };

export type BuildEvent =
  | { type: "stage"; id: StageId; state: "start" }
  /** `ok` false: the step ran but had nothing to read (said in `lines`), never a failure dressed as success. */
  | { type: "stage"; id: StageId; state: "done"; ok: boolean; lines: string[]; items?: StageItem[] }
  | { type: "done"; reveal: Reveal }
  | { type: "error"; message: string };

export type Feasibility = { level: "in_reach" | "ambitious" | "very_ambitious" | "unknown"; line: string };

export type Reveal = {
  /** "10,000 followers": the heading reads "Your path to ...". Null when no target was set. */
  target: string | null;
  goal: { label: string; sentence: string | null; feasibility: Feasibility | null };
  start: { label: string; value: string; where: string }[];
  priorities: string[];
  week: { posts: number; why: string; pillars: { name: string; why: string }[] } | null;
  /** The routine as the person told SIO (lib/routine.ts), one row per answer; `pending` when SIO still has questions about their week. */
  routine: { rows: { label: string; value: string }[]; pending: boolean } | null;
  /** Every SOCIA tool, grouped by job, each marked with the plan it starts on (lib/onboardingTools.ts). */
  tools: ToolGroup[];
  basedOn: string[];
};

type Post = { id?: string; caption?: string; permalink?: string; thumbnail_url?: string; media_url?: string; media_type?: string; timestamp?: string; like_count?: number; comments_count?: number; insights?: { saved?: number | null; shares?: number | null; views?: number | null } | null };

const interactions = (p: Post) => (p.like_count ?? 0) + (p.comments_count ?? 0) + (p.insights?.saved ?? 0) + (p.insights?.shares ?? 0);
const firstLine = (c: string | undefined, max = 60) => {
  const l = (c ?? "").split("\n").map((x) => x.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim()).find(Boolean) ?? "";
  return l.length > max ? `${l.slice(0, max - 1).trimEnd()}…` : l;
};

/** The person's strongest recent posts by interactions, as items to show. Posts with no numbers are left out. */
export function strongestPosts(media: Post[], n = 3): StageItem[] {
  return media
    .filter((p) => interactions(p) > 0)
    .sort((a, b) => interactions(b) - interactions(a))
    .slice(0, n)
    .map((p) => ({ thumb: p.thumbnail_url ?? (p.media_type === "IMAGE" ? p.media_url ?? null : null), href: p.permalink ?? null, label: firstLine(p.caption) || "A post without a caption", note: `${interactions(p).toLocaleString("en-US")} interactions` }));
}

/** How many posts were published in the last `days`. */
export const postsInLast = (media: Post[], days: number, now: Date): number =>
  media.filter((p) => p.timestamp && now.getTime() - new Date(p.timestamp).getTime() <= days * 86_400_000).length;

/**
 * How a follower target compares with the account's own recent pace: the
 * followers it would need to gain each day against what it really gained each
 * day over the last weeks. Said as a comparison, never as a chance of success.
 * Unknown when there isn't enough history, or for any goal SOCIA has no daily
 * history for.
 */
export function feasibility(input: { metric: GoalMetricId; now: number | null; target: number; daysLeft: number | null; gained: number | null; gainedDays: number }): Feasibility {
  const unknown = (why: string): Feasibility => ({ level: "unknown", line: why });
  if (input.metric !== "followers") return unknown("SOCIA has no daily history for this goal yet, so it can't compare your target with your recent pace.");
  if (input.now == null || input.daysLeft == null || input.daysLeft <= 0) return unknown("There isn't a starting number or an end date to compare with yet.");
  if (input.gained == null || input.gainedDays < 14) return unknown("SOCIA has under two weeks of your daily follower numbers, so it can't compare your target with your recent pace yet.");
  const need = (input.target - input.now) / input.daysLeft;
  const pace = input.gained / input.gainedDays;
  const perDay = (v: number) => (v >= 10 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1).replace(/\.0$/, ""));
  const facts = `You need about ${perDay(need)} new followers a day. Over the last ${input.gainedDays} days you gained about ${perDay(Math.max(0, pace))} a day.`;
  if (pace <= 0) return { level: "very_ambitious", line: `${facts} That is a big change from your recent pace.` };
  const ratio = need / pace;
  if (ratio <= 1.5) return { level: "in_reach", line: `${facts} That is close to your recent pace.` };
  if (ratio <= 4) return { level: "ambitious", line: `${facts} That is ${ratio.toFixed(1).replace(/\.0$/, "")} times your recent pace: ambitious.` };
  return { level: "very_ambitious", line: `${facts} That is ${Math.round(ratio)} times your recent pace: very ambitious.` };
}

const where = (ps: GoalPlatform[]) => ps.map((p) => GOAL_PLATFORM_NAME[p]).join(" and ");

/** Everything the reveal shows, from what was read and written. */
export function buildReveal(input: {
  mainGoal: MainGoalId | null | undefined;
  goal: Goal | null;
  nowValues: Partial<Record<GoalMetricId, { value: number; platforms: GoalPlatform[] }>>;
  strategy: GrowthStrategy | null;
  gained: number | null;
  gainedDays: number;
  /** The plan the person is on, and how many competitors the brand tracks: what the tools list is marked against. */
  plan: PlanId;
  competitors: number;
  /** How the customer goal is worded for this brand (lib/growth.ts CUSTOMER_GOALS). */
  customerGoal?: CustomerGoalId | null;
  /** The routine the person told SIO about, as saved. */
  routine?: Routine | null;
  today: string;
}): Reveal {
  const main = mainGoalsFor(input.customerGoal).find((m) => m.id === input.mainGoal) ?? null;
  const g = input.goal;
  const start = (["followers", "views_30d", "posts_per_week", "engagement_rate"] as const)
    .filter((id) => input.nowValues[id])
    .map((id) => ({ label: goalMetric(id)!.label, value: formatGoalValue(id, input.nowValues[id]!.value), where: where(input.nowValues[id]!.platforms) }));
  const daysLeft = g?.due_date ? Math.round((Date.parse(`${g.due_date}T12:00:00Z`) - Date.parse(`${input.today}T12:00:00Z`)) / 86_400_000) : null;
  const now = g ? input.nowValues[g.metric]?.value ?? g.baseline ?? null : null;
  const unit = g ? (g.metric === "followers" ? " followers" : g.metric === "views_30d" ? " views a month" : g.metric === "engagement_rate" ? " engagement" : g.metric === "posts_per_week" ? "" : ` ${goalMetric(g.metric)?.label.toLowerCase() ?? ""}`) : "";
  const s = input.strategy;
  return {
    target: g ? `${formatGoalValue(g.metric, g.target)}${unit}`.trim() : null,
    goal: {
      label: main?.label ?? "Your goal",
      sentence: g ? `${now != null ? `${formatGoalValue(g.metric, now)} now, ` : ""}${formatGoalValue(g.metric, g.target)} ${daysLeft != null && daysLeft > 0 ? `in ${daysLeft} days` : "as the target"}.` : null,
      feasibility: g ? feasibility({ metric: g.metric, now, target: g.target, daysLeft, gained: input.gained, gainedDays: input.gainedDays }) : null,
    },
    start,
    priorities: (s?.priorities ?? []).slice(0, 3),
    week: s ? { posts: s.frequency.posts_per_week, why: s.frequency.why, pillars: s.pillars.slice(0, 4) } : null,
    routine: routineSummary(input.routine).length ? { rows: routineSummary(input.routine), pending: unanswered(input.routine).length > 0 } : null,
    tools: toolGroups({ plan: input.plan, posts: s?.frequency.posts_per_week ?? null, target: g ? `${formatGoalValue(g.metric, g.target)}${unit}`.trim() : null, competitors: input.competitors }),
    basedOn: (s?.based_on ?? []).slice(0, 6),
  };
}
