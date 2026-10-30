// The Growth Strategy: one persistent, editable strategy per brand, the layer
// the weekly plans are built from. What it rests on is computed here from
// SOCIA's own data (the posting pace, what works, findings, goals, the time
// the person has); the model only writes the wording of pillars, priorities,
// experiments and milestones from those facts. The frequency is held to what
// the person's stated time allows, and the primary objective is always their
// own main goal. Pure.

import { HOURS, MAIN_GOALS, type GrowthProfile } from "./growth";

export type StrategyPillar = { name: string; why: string };
export type StrategyExperiment = { hypothesis: string; test: string; measure: string };
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
  const cap = postsCap(f.growth);
  const prompt = [
    `Niche: ${f.niche ?? "not set"}${f.brandName ? `; account: ${f.brandName}` : ""}.`,
    `Current pace: ${f.pace != null ? `${f.pace} posts a week` : "not known (no connected account with posts)"}.`,
    `Posts a week their stated time allows: at most ${cap}.`,
    f.works.length ? `What works on their own accounts (each format against the account's own median):\n${f.works.map((w) => `- ${w}`).join("\n")}` : "What works on their own accounts: not enough posts to compare formats yet.",
    f.findings.length ? `SOCIA's findings:\n${f.findings.map((x) => `- ${x}`).join("\n")}` : "SOCIA's findings: none yet.",
    f.goals.length ? `Their measurable goals:\n${f.goals.map((x) => `- ${x}`).join("\n")}` : "Measurable goals: none set.",
    f.themes.length ? `Recurring themes in their captions: ${f.themes.map((t) => `${t.name} (${t.posts} posts)`).join(", ")}.` : "",
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
    experiments: { type: "array", items: { type: "object", additionalProperties: false, properties: { hypothesis: { type: "string" }, test: { type: "string" }, measure: { type: "string" } }, required: ["hypothesis", "test", "measure"] } },
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
- posts_per_week: a realistic number at or below the stated maximum; frequency_why says which facts set it (their current pace and their time).
- experiments: 1 or 2. Each is a hypothesis, the test (what to post, how many, over how long) and the measure against their own median. Phrase hypotheses as possibilities, never as known effects.
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
  const main = MAIN_GOALS.find((m) => m.id === g?.main_goal);
  if (goalLine) return goalLine;
  return main ? main.label : "Set a main goal in your Growth Profile";
}

/** The model's draft, made safe: lengths bounded, frequency held to the person's time, dates checked. */
export function normalizeStrategy(raw: Record<string, unknown>, ctx: { growth: GrowthProfile | null; goalLine: string | null; basedOn: string[]; now: Date }): GrowthStrategy {
  const cap = postsCap(ctx.growth);
  const asked = Math.round(Number(raw.posts_per_week));
  const posts = Number.isFinite(asked) && asked > 0 ? Math.min(asked, cap) : Math.min(3, cap);
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
      why: posts < asked ? `Held to ${cap} a week, what the time you said you have allows. Change it in your Growth Profile to plan more.` : clip(raw.frequency_why, 300),
    },
    experiments: objs(raw.experiments).map((e) => ({ hypothesis: clip(e.hypothesis, 240), test: clip(e.test, 240), measure: clip(e.measure, 200) })).filter((e) => e.hypothesis).slice(0, 2),
    priorities: clipList(raw.priorities, 3, 200),
    milestones: objs(raw.milestones).map((m) => {
      const by = clip(m.by, 10);
      return { label: clip(m.label, 160), by: isDate(by) ? by : null, measure: clip(m.measure, 200) };
    }).filter((m) => m.label).slice(0, 3).sort(byDate),
    based_on: ctx.basedOn,
    generated_at: ctx.now.toISOString(),
    edited_at: null,
  };
}

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
    experiments: objs(patch.experiments)?.map((e) => ({ hypothesis: clip(e.hypothesis, 240), test: clip(e.test, 240), measure: clip(e.measure, 200) })).filter((e) => e.hypothesis).slice(0, 4) ?? cur.experiments,
    priorities: patch.priorities ? clipList(patch.priorities, 5, 200) : cur.priorities,
    milestones: objs(patch.milestones)?.map((m) => { const by = clip(m.by, 10); return { label: clip(m.label, 160), by: isDate(by) ? by : null, measure: clip(m.measure, 200) }; }).filter((m) => m.label).slice(0, 5).sort(byDate) ?? cur.milestones,
    edited_at: now.toISOString(),
  };
}

/** The strategy as lines for the plan writer and Ask SOCIA. */
export function strategyLines(s: GrowthStrategy | null | undefined): string {
  if (!s) return "";
  return [
    `Primary objective: ${s.primary_objective}`,
    s.secondary_objectives.length ? `Secondary objectives: ${s.secondary_objectives.join("; ")}` : "",
    s.audience ? `Audience: ${s.audience}` : "",
    s.pillars.length ? `Content pillars:\n${s.pillars.map((p) => `- ${p.name}: ${p.why}`).join("\n")}` : "",
    `Posts a week: ${s.frequency.posts_per_week}${s.frequency.why ? ` (${s.frequency.why})` : ""}`,
    s.experiments.length ? `Running experiments:\n${s.experiments.map((e) => `- ${e.hypothesis} Test: ${e.test} Measure: ${e.measure}`).join("\n")}` : "",
    s.priorities.length ? `Priorities, in order: ${s.priorities.join("; ")}` : "",
  ].filter(Boolean).join("\n");
}

export const STRATEGY_REGEN_COOLDOWN_MS = 24 * 60 * 60 * 1000;
