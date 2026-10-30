// The end of onboarding: the work that actually runs for the connected
// accounts (each with its real outcome), then the first briefing built from
// what came back. Account findings and general starting guidance are kept
// apart, and the guidance is labelled as not coming from the account's data.
//
// buildBriefing and currentFor are pure; runInitialization (server only)
// does the reads.

import type { PlatformSummary } from "./metrics/allPlatforms";
import { GOAL_PLATFORM_NAME, formatGoalValue, goalMetric, goalSentence, type Goal, type GoalPlatform, type GrowthProfile } from "./growth";

export type StepOutcome = { label: string; status: "done" | "unavailable" | "failed"; detail: string };

export type BriefingAction = { label: string; why: string; href: string };

export type Briefing = {
  /** Facts read from the connected accounts. */
  learned: string[];
  /** What SOCIA doesn't have, and why. */
  missing: string[];
  /** Exactly the next steps that apply, at most three. */
  actions: BriefingAction[];
  /** General guidance from the stated goal and account type, not from data. */
  guidance: string[];
};

const n = (v: number) => Math.round(v).toLocaleString("en-US");

/** Extra numbers that aren't on a summary row, read by the loader. */
export type Extras = {
  /** Days of history the summaries cover (a plan can shorten the 30 asked for). */
  days: number;
  igEngagementRate: number | null;
  igPostsPerWeek: number | null;
  ttPostsPerWeek: number | null;
};

/**
 * The current value of a measured goal from the summaries, or null with the
 * reason it can't be read. Several platforms add up (followers, views, posts).
 */
export function currentFor(goal: Goal, rows: PlatformSummary[], x: Extras): { value: number | null; why: string | null } {
  const m = goalMetric(goal.metric);
  if (!m?.measuredOn.length) return { value: null, why: "You report this number; SOCIA can't see it." };
  const on = (p: GoalPlatform) => rows.find((r) => r.platform === p);
  const notConnected = goal.platforms.filter((p) => !on(p)?.connected);
  if (notConnected.length) return { value: null, why: `${notConnected.map((p) => GOAL_PLATFORM_NAME[p]).join(" and ")} ${notConnected.length === 1 ? "isn't" : "aren't"} connected.` };
  const parts: (number | null)[] = goal.platforms.map((p) => {
    if (goal.metric === "followers") return on(p)?.audience ?? null;
    if (goal.metric === "views_30d") return x.days === 30 ? on(p)?.views ?? null : null;
    if (goal.metric === "engagement_rate") return p === "instagram" ? x.igEngagementRate : null;
    if (goal.metric === "posts_per_week") return p === "instagram" ? x.igPostsPerWeek : p === "tiktok" ? x.ttPostsPerWeek : null;
    return null;
  });
  if (goal.metric === "views_30d" && x.days !== 30) return { value: null, why: `Your plan shows ${x.days} days of history, not 30.` };
  if (parts.some((v) => v == null)) return { value: null, why: "The platform returned no number for this yet." };
  if (goal.metric === "engagement_rate") return { value: parts[0] as number, why: null };
  return { value: (parts as number[]).reduce((a, b) => a + b, 0), why: null };
}

const GUIDANCE: Record<string, string> = {
  followers: "Give people a reason to follow in the post itself: say what they'll get next time.",
  views_30d: "The opening line or first seconds decide whether people keep watching. Try a different opening each week; SOCIA will show which held attention.",
  engagement_rate: "End posts with one easy question or ask, and reply to the first comments you get.",
  posts_per_week: "Pick a number of posts you can keep up every week. A steady week you can repeat beats a big week you can't.",
  leads: "Every post should say how to get in touch, in the caption, not only in your bio.",
  bookings: "Say how to book in every post, and show what someone gets when they do.",
  sales: "Show the product being used, and say plainly how to buy it.",
  website_visits: "Name what's on the other side of the link, so the tap is worth it.",
};

export function buildBriefing(input: {
  days: number;
  rows: PlatformSummary[];
  goals: Goal[];
  currents: Map<string, { value: number | null; why: string | null }>;
  growth: GrowthProfile | null;
  trackedCompetitors: number;
  hasPlan: boolean;
}): Briefing {
  const { rows, goals, currents } = input;
  const connected = rows.filter((r) => r.connected);
  const learned: string[] = [];
  for (const r of connected) {
    const bits = [
      r.audience != null ? `${n(r.audience)} ${r.audienceLabel}` : null,
      r.views != null ? `${n(r.views)} views in the last ${input.days} days` : null,
      r.contentPublished != null ? `${r.contentPublished} ${r.contentPublished === 1 ? "post" : "posts"} in the last ${input.days} days` : null,
    ].filter(Boolean);
    learned.push(`${GOAL_PLATFORM_NAME[r.platform]} (${r.label}): ${bits.length ? bits.join(", ") : "connected, but no numbers came back yet"}.`);
  }
  for (const g of goals) {
    const c = g.id ? currents.get(g.id) : undefined;
    if (c?.value != null) learned.push(`Your goal starts from ${formatGoalValue(g.metric, g.baseline ?? c.value)}: ${goalSentence({ ...g, baseline: g.baseline ?? c.value })}.`);
  }

  const missing: string[] = [];
  if (!connected.length) missing.push("No account is connected, so SOCIA has no numbers of yours yet. Everything below is general.");
  for (const r of rows.filter((x) => !x.connected)) missing.push(`${GOAL_PLATFORM_NAME[r.platform]} isn't connected.`);
  for (const r of connected) if (r.views == null && r.viewsNote) missing.push(`${GOAL_PLATFORM_NAME[r.platform]}: ${r.viewsNote}.`);
  for (const g of goals) {
    const c = g.id ? currents.get(g.id) : undefined;
    if (c && c.value == null && c.why) missing.push(`${goalMetric(g.metric)?.label ?? g.metric}: ${c.why}`);
  }

  const actions: BriefingAction[] = [];
  const goalGap = goals.flatMap((g) => g.platforms).find((p) => !rows.find((r) => r.platform === p)?.connected);
  if (!connected.length) actions.push({ label: "Connect an account", why: "So SOCIA can read your real numbers.", href: "/settings#accounts" });
  else if (goalGap) actions.push({ label: `Connect ${GOAL_PLATFORM_NAME[goalGap]}`, why: "Your goal is measured there.", href: "/settings#accounts" });
  if (!goals.length) actions.push({ label: "Set a goal", why: "So progress can be measured from a starting point.", href: "/settings#growth" });
  if (!input.hasPlan) actions.push({ label: "Make your first weekly plan", why: "Built from your profile and whatever numbers SOCIA has.", href: "/plan" });
  if (input.trackedCompetitors === 0) actions.push({ label: "Add two accounts to watch", why: "So SOCIA can compare your posts with similar accounts.", href: "/discover" });
  actions.push({ label: "Schedule your next post", why: "Results are measured once posts go out.", href: "/plan/calendar" });

  const guidance = [...new Set(goals.filter((g) => (g.status ?? "active") === "active").map((g) => GUIDANCE[g.metric]).filter(Boolean))].slice(0, 3);
  if (input.growth?.resources?.hours_per_week === "lt2") guidance.push("With under two hours a week, film several short pieces in one sitting and post them through the week.");
  if (input.growth?.personality?.on_camera === "no") guidance.push("Off-camera formats work too: hands, process, screen recordings, voice-over and text on screen.");

  return { learned, missing, actions: actions.slice(0, 3), guidance };
}
