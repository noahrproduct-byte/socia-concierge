// The Growth Strategy: one persistent, editable strategy per brand, the layer
// the weekly plans are built from. What it rests on is computed here from
// SOCIA's own data (the posting pace, what works, findings, goals, the time
// the person has); the model only writes the wording of pillars, priorities,
// experiments and milestones from those facts. The frequency is held to what
// the person's stated time allows, and the primary objective is always their
// own main goal. Pure.

import { HOURS, mainGoalLabel, type GrowthProfile } from "./growth";
import { readinessLines, type Readiness, type Stage } from "./starter/readiness";

export type StrategyPillar = { name: string; why: string };
export type ExperimentStatus = "running" | "done" | "stopped";
/** A hypothesis under test. The id tags the plan's test posts (lib/experiments.ts); unique across rewrites so old tests never count toward a new one. */
/** What one experiment varies (a starter strategy tests one thing at a time). */
export const EXPERIMENT_DIMENSIONS = ["hook", "topic", "format", "length", "story"] as const;
export type ExperimentDimension = (typeof EXPERIMENT_DIMENSIONS)[number];
export const DIMENSION_LABEL: Record<ExperimentDimension, string> = { hook: "Hooks", topic: "Topics", format: "Video formats", length: "Video length", story: "Storytelling" };
export type StrategyExperiment = { id?: string; status?: ExperimentStatus; started_at?: string | null; hypothesis: string; test: string; measure: string; dimension?: ExperimentDimension };

const STATUSES: ExperimentStatus[] = ["running", "done", "stopped"];
export const isExperimentId = (v: unknown): v is string => typeof v === "string" && /^e[0-9a-z]{3,14}$/.test(v);
const newId = (now: Date, i: number) => `e${now.getTime().toString(36)}${i}`;
export type StrategyMilestone = { label: string; by: string | null; measure: string };

export type GrowthStrategy = {
  v: 1;
  primary_objective: string;
  secondary_objectives: string[];
  audience: string;
  pillars: StrategyPillar[];
  frequency: { posts_per_week: number; why: string };
  experiments: StrategyExperiment[];
  priorities: string[];
  milestones: StrategyMilestone[];
  /** What SOCIA wrote it from, in plain words. */
  based_on: string[];
  generated_at: string;
  /** Set when the person edits it; a regeneration replaces their edits only when they ask. */
  edited_at: string | null;
  /** How much history the account had when this was written (lib/starter/readiness.ts); older strategies lack it. */
  stage?: Stage;
  /** The share of it that rests on the account's own results, 0 to 1. */
  own_weight?: number;
  /** What SOCIA observed on other accounts in the niche when writing it: their published numbers, not this account's. */
  observed?: string[];
};

/** Posts a week the person's stated time allows. Unknown time: no cap beyond a sane week. */
export const POSTS_CAP_BY_HOURS: Record<(typeof HOURS)[number]["id"], number> = { lt2: 2, "2to5": 3, "5to10": 5, gt10: 7 };

export function postsCap(g: GrowthProfile | null | undefined): number {
  const h = g?.resources?.hours_per_week;
  return h ? POSTS_CAP_BY_HOURS[h] : 7;
}

export type StrategyFacts = {
  growth: GrowthProfile | null;
  niche: string | null;
  brandName: string | null;
  /** Current posts a week across platforms, from the connected accounts; null when none. */
  pace: number | null;
  /** "Reels: 1.8x the account's median (6 posts) on Instagram" */
  works: string[];
  /** Active findings, titles with their observation. */
  findings: string[];
  /** Measurable goals as written lines. */
  goals: string[];
  themes: { name: string; posts: number }[];
  /** How much of the account's own history there is to learn from. */
  readiness?: Readiness | null;
  /** Reels and Shorts SOCIA read on other accounts in the niche, as lines (lib/starter/load.ts). */
  nicheSeen?: string[];
  /** Creators and competitors the person follows on Discover. */
  admired?: string[];
};

/** The facts as the prompt's evidence, and as the "based on" list shown under the strategy. */
export function factLines(f: StrategyFacts): { prompt: string; basedOn: string[] } {
  const basedOn: string[] = [];
  if (f.growth && Object.keys(f.growth).some((k) => k !== "understanding")) basedOn.push("Your Growth Profile");
  if (f.pace != null) basedOn.push(`Your current pace: about ${f.pace} posts a week`);
  if (f.works.length) basedOn.push(`What works on your accounts (${f.works.length} format ${f.works.length === 1 ? "comparison" : "comparisons"})`);
  if (f.findings.length) basedOn.push(`${f.findings.length} SOCIA ${f.findings.length === 1 ? "finding" : "findings"}`);
  if (f.goals.length) basedOn.push(`${f.goals.length} measurable ${f.goals.length === 1 ? "goal" : "goals"}`);
  if (f.themes.length) basedOn.push("The recurring themes in your captions");
  const starter = f.readiness && f.readiness.stage !== "established";
  if (starter && f.nicheSeen?.length) basedOn.push(`${f.nicheSeen.length} recent Reels from accounts in your niche, with their published numbers`);
  if (starter && f.admired?.length) basedOn.push(`The creators you follow on Discover`);
  if (f.readiness) basedOn.push(f.readiness.stage === "starting" ? "Starter mode: your account is still building its history" : `Your own results count for ${Math.round(f.readiness.ownWeight * 100)}%`);
  const cap = postsCap(f.growth);
  const prompt = [
    `Niche: ${f.niche ?? "not set"}${f.brandName ? `; account: ${f.brandName}` : ""}.`,
    `Current pace: ${f.pace != null ? `${f.pace} posts a week` : "not known (no connected account with posts)"}.`,
    `Posts a week their stated time allows: at most ${cap}.`,
    f.works.length ? `What works on their own accounts (each format against the account's own median):\n${f.works.map((w) => `- ${w}`).join("\n")}` : "What works on their own accounts: not enough posts to compare formats yet.",
    f.findings.length ? `SOCIA's findings:\n${f.findings.map((x) => `- ${x}`).join("\n")}` : "SOCIA's findings: none yet.",
    f.goals.length ? `Their measurable goals:\n${f.goals.map((x) => `- ${x}`).join("\n")}` : "Measurable goals: none set.",
    f.themes.length ? `Recurring themes in their captions: ${f.themes.map((t) => `${t.name} (${t.posts} posts)`).join(", ")}.` : "",
    f.readiness ? `How much of their own history there is:\n${readinessLines(f.readiness)}` : "",
    starter && f.nicheSeen?.length ? `Observed on other accounts in their niche (those accounts' published numbers, not this account's):\n${f.nicheSeen.map((x) => `- ${x}`).join("\n")}` : "",
    starter && f.admired?.length ? `Creators and competitors they admire: ${f.admired.map((h) => `@${h.replace(/^@/, "")}`).join(", ")}.` : "",
  ].filter(Boolean).join("\n\n");
  return { prompt, basedOn };
}

export const strategySchema = {
  type: "object", additionalProperties: false,
  properties: {
    secondary_objectives: { type: "array", items: { type: "string" } },
    audience: { type: "string" },
    pillars: { type: "array", items: { type: "object", additionalProperties: false, properties: { name: { type: "string" }, why: { type: "string" } }, required: ["name", "why"] } },
    posts_per_week: { type: "integer" },
    frequency_why: { type: "string" },
    experiments: { type: "array", items: { type: "object", additionalProperties: false, properties: { dimension: { type: "string", enum: [...EXPERIMENT_DIMENSIONS] }, hypothesis: { type: "string" }, test: { type: "string" }, measure: { type: "string" } }, required: ["dimension", "hypothesis", "test", "measure"] } },
    priorities: { type: "array", items: { type: "string" } },
    milestones: { type: "array", items: { type: "object", additionalProperties: false, properties: { label: { type: "string" }, by: { type: "string" }, measure: { type: "string" } }, required: ["label", "by", "measure"] } },
  },
  required: ["secondary_objectives", "audience", "pillars", "posts_per_week", "frequency_why", "experiments", "priorities", "milestones"],
} as const;

export const STRATEGY_SYSTEM = `You are SOCIA, the strategist inside a social-media growth product. Write this account's growth strategy from the facts given and nothing else.
Rules:
- secondary_objectives: 1 to 3 short objectives that support the main goal.
- audience: one sentence on who the content is for, from their profile; if it isn't known, say what to confirm.
- pillars: 3 to 5 content pillars (recurring topics or series). Each "why" names the fact it comes from (a theme, a format that works, a finding, the profile). Never invent a number.
- posts_per_week: when the profile states a posting target, use exactly that number, and frequency_why says it is their own target and how it compares with their current pace. Otherwise a realistic number at or below the stated maximum; frequency_why says which facts set it (their current pace and their time).
- experiments: 1 or 2. Each varies one thing (dimension: hook, topic, format, length or story) and is a hypothesis, the test (what to post, how many, over how long) and the measure against their own median. Phrase hypotheses as possibilities, never as known effects.
- When the facts say the account is still building its history (starter or learning): SOCIA does not yet know what works for this account, so the strategy is a plan to find out.
  - experiments: 3 for a starting account (2 when learning), each on a different dimension, each comparing two clear options (for example a question hook against a bold-claim hook), 3 posts of each option over two to three weeks, measured against the account's own median once there is one (until then, against each other).
  - Pillars rest on their profile (what the account is about, who it is for, the videos they want to make) and may use a pattern observed in the niche; then "why" names it as seen on other accounts, never as proof it will work here. Never copy another account's content.
  - The frequency is their own posting target, or fewer; never daily unless they chose seven days.
  - Priorities start with making the first test posts, then reading what they show.
- priorities: the 3 things to focus on next, in order.
- milestones: 2 or 3 checkpoints over the next 12 weeks; "by" is a date (YYYY-MM-DD) or "", and "measure" names a number SOCIA can read or the person can report.
- No guaranteed growth, no claims about algorithms, plain text, sentence case, no em dashes.`;

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.trim().replace(/\u2014/g, ",").slice(0, n) : "");
const clipList = (xs: unknown, max: number, each: number) => (Array.isArray(xs) ? xs.map((x) => clip(x, each)).filter(Boolean).slice(0, max) : []);
/** Dated milestones first, earliest first; undated ones after. */
const byDate = (a: StrategyMilestone, b: StrategyMilestone) => (a.by ?? "9999").localeCompare(b.by ?? "9999");
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/** The primary objective is the person's own main goal, never the model's. */
export function primaryObjective(g: GrowthProfile | null | undefined, goalLine: string | null): string {
  if (goalLine) return goalLine;
  return mainGoalLabel(g?.main_goal, g) ?? "Set a main goal in your Growth Profile";
}

/** The model's draft, made safe: lengths bounded, frequency held to the person's time, dates checked. */
export function normalizeStrategy(raw: Record<string, unknown>, ctx: { growth: GrowthProfile | null; goalLine: string | null; basedOn: string[]; now: Date; readiness?: Readiness | null; nicheSeen?: string[] }): GrowthStrategy {
  // A starter strategy runs more experiments at once: it is how SOCIA learns what works.
  const maxExperiments = ctx.readiness?.stage === "starting" ? 3 : 2;
  const cap = postsCap(ctx.growth);
  const asked = Math.round(Number(raw.posts_per_week));
  // The person's own posting target (lib/routine.ts) is the pace: it is their decision, not a suggestion to revise.
  const own = ctx.growth?.routine?.post_days ?? null;
  const posts = own ?? (Number.isFinite(asked) && asked > 0 ? Math.min(asked, cap) : Math.min(3, cap));
  const objs = (xs: unknown) => (Array.isArray(xs) ? (xs as Record<string, unknown>[]) : []);
  return {
    v: 1,
    primary_objective: primaryObjective(ctx.growth, ctx.goalLine),
    secondary_objectives: clipList(raw.secondary_objectives, 3, 160),
    audience: clip(raw.audience, 300),
    pillars: objs(raw.pillars).map((p) => ({ name: clip(p.name, 60), why: clip(p.why, 240) })).filter((p) => p.name).slice(0, 5),
    frequency: {
      posts_per_week: posts,
      // Capped: the model's reasoning argued for a number that no longer applies.
      why: own
        ? asked === own && clip(raw.frequency_why, 300) ? clip(raw.frequency_why, 300) : `You chose ${own} posting ${own === 1 ? "day" : "days"} a week, so the plan is built around that.`
        : posts < asked ? `Held to ${cap} a week, what the time you said you have allows. Change it in your Growth Profile to plan more.` : clip(raw.frequency_why, 300),
    },
    experiments: objs(raw.experiments).map((e) => ({ hypothesis: clip(e.hypothesis, 240), test: clip(e.test, 240), measure: clip(e.measure, 200), ...(isDimension(e.dimension) ? { dimension: e.dimension } : {}) })).filter((e) => e.hypothesis).slice(0, maxExperiments)
      .map((e, i) => ({ id: newId(ctx.now, i), status: "running" as const, started_at: ctx.now.toISOString(), ...e })),
    priorities: clipList(raw.priorities, 3, 200),
    milestones: objs(raw.milestones).map((m) => {
      const by = clip(m.by, 10);
      return { label: clip(m.label, 160), by: isDate(by) ? by : null, measure: clip(m.measure, 200) };
    }).filter((m) => m.label).slice(0, 3).sort(byDate),
    based_on: ctx.basedOn,
    generated_at: ctx.now.toISOString(),
    edited_at: null,
    ...(ctx.readiness ? { stage: ctx.readiness.stage, own_weight: ctx.readiness.ownWeight } : {}),
    ...(ctx.readiness && ctx.readiness.stage !== "established" && ctx.nicheSeen?.length ? { observed: ctx.nicheSeen.slice(0, 6) } : {}),
  };
}

const isDimension = (v: unknown): v is ExperimentDimension => typeof v === "string" && (EXPERIMENT_DIMENSIONS as readonly string[]).includes(v);

/** The person's edits, bounded the same way; SOCIA's provenance fields are kept. */
export function applyEdits(cur: GrowthStrategy, patch: Partial<GrowthStrategy>, now: Date): GrowthStrategy {
  const objs = (xs: unknown) => (Array.isArray(xs) ? (xs as Record<string, unknown>[]) : null);
  const ppw = patch.frequency ? Math.round(Number(patch.frequency.posts_per_week)) : NaN;
  return {
    ...cur,
    primary_objective: patch.primary_objective !== undefined ? clip(patch.primary_objective, 200) || cur.primary_objective : cur.primary_objective,
    secondary_objectives: patch.secondary_objectives ? clipList(patch.secondary_objectives, 5, 160) : cur.secondary_objectives,
    audience: patch.audience !== undefined ? clip(patch.audience, 300) : cur.audience,
    pillars: objs(patch.pillars)?.map((p) => ({ name: clip(p.name, 60), why: clip(p.why, 240) })).filter((p) => p.name).slice(0, 6) ?? cur.pillars,
    // The person may choose more than SOCIA suggests; only a sane week is enforced.
    frequency: patch.frequency ? { posts_per_week: Number.isFinite(ppw) && ppw > 0 ? Math.min(ppw, 21) : cur.frequency.posts_per_week, why: clip(patch.frequency.why, 300) } : cur.frequency,
    // Kept ids keep their test posts; a new row starts a new experiment.
    experiments: objs(patch.experiments)?.map((e, i) => ({
      id: isExperimentId(e.id) ? e.id : newId(now, i),
      status: STATUSES.includes(e.status as ExperimentStatus) ? (e.status as ExperimentStatus) : "running",
      started_at: typeof e.started_at === "string" && !Number.isNaN(Date.parse(e.started_at)) ? e.started_at : now.toISOString(),
      hypothesis: clip(e.hypothesis, 240), test: clip(e.test, 240), measure: clip(e.measure, 200),
      ...(isDimension(e.dimension) ? { dimension: e.dimension } : {}),
    })).filter((e) => e.hypothesis).slice(0, 4) ?? cur.experiments,
    priorities: patch.priorities ? clipList(patch.priorities, 5, 200) : cur.priorities,
    milestones: objs(patch.milestones)?.map((m) => { const by = clip(m.by, 10); return { label: clip(m.label, 160), by: isDate(by) ? by : null, measure: clip(m.measure, 200) }; }).filter((m) => m.label).slice(0, 5).sort(byDate) ?? cur.milestones,
    edited_at: now.toISOString(),
  };
}

/** Experiments still being tested (older strategies without ids are treated as running, tagged by none). */
export const running = (s: GrowthStrategy) => s.experiments.filter((e) => (e.status ?? "running") === "running" && isExperimentId(e.id));

/** The strategy as lines for the plan writer and Ask SOCIA. */
export function strategyLines(s: GrowthStrategy | null | undefined): string {
  if (!s) return "";
  return [
    `Primary objective: ${s.primary_objective}`,
    s.secondary_objectives.length ? `Secondary objectives: ${s.secondary_objectives.join("; ")}` : "",
    s.audience ? `Audience: ${s.audience}` : "",
    s.pillars.length ? `Content pillars:\n${s.pillars.map((p) => `- ${p.name}: ${p.why}`).join("\n")}` : "",
    `Posts a week: ${s.frequency.posts_per_week}${s.frequency.why ? ` (${s.frequency.why})` : ""}`,
    running(s).length ? `Running experiments (id in brackets):\n${running(s).map((e) => `- [${e.id}]${e.dimension ? ` (${DIMENSION_LABEL[e.dimension].toLowerCase()})` : ""} ${e.hypothesis} Test: ${e.test} Measure: ${e.measure}`).join("\n")}` : "",
    s.priorities.length ? `Priorities, in order: ${s.priorities.join("; ")}` : "",
  ].filter(Boolean).join("\n");
}

export const STRATEGY_REGEN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
