// The Growth Profile: who the account is, who it serves, what it can produce,
// and the goals it is measured against. Pure: shapes, options, validation,
// the goal summary written back to the legacy `goals` text, and goal progress.
//
// Where it lives:
//   - identity, audience, personality and resources: brand_detail.growth
//     (the existing per-brand jsonb, so it reaches every reader through
//     getProfile and brandContext with no new column);
//   - voice, avoid, description, location, website and posting frequency stay
//     where they already are on brand_detail (one field, one place);
//   - goals: the growth_goals table, because they need progress math.

import type { Understanding } from "./intel/understanding";

export type AccountType = "business" | "creator" | "personal_brand" | "organization";

export const ACCOUNT_TYPES: { id: AccountType; label: string; hint: string }[] = [
  { id: "business", label: "Business", hint: "A shop, restaurant, studio or service with customers" },
  { id: "creator", label: "Creator", hint: "You make content as the product: education, entertainment, reviews" },
  { id: "personal_brand", label: "Personal brand", hint: "You, as an expert, founder or professional" },
  { id: "organization", label: "Organisation", hint: "A nonprofit, school, club or public body" },
];

export const CUSTOMER_ACTIONS = [
  { id: "visit", label: "Visit in person" },
  { id: "book", label: "Book or reserve" },
  { id: "buy_online", label: "Buy online" },
  { id: "call", label: "Call or message" },
  { id: "enquire", label: "Send an enquiry" },
  { id: "sign_up", label: "Sign up or join" },
] as const;
export type CustomerAction = (typeof CUSTOMER_ACTIONS)[number]["id"];

export const REACH_SCOPES = [
  { id: "local", label: "One town or city" },
  { id: "regional", label: "A region or state" },
  { id: "national", label: "One country" },
  { id: "global", label: "Anywhere" },
] as const;
export type ReachScope = (typeof REACH_SCOPES)[number]["id"];

export const MONETIZATION = [
  { id: "brand_deals", label: "Brand deals" },
  { id: "own_products", label: "My own products or courses" },
  { id: "platform_payouts", label: "Platform payouts" },
  { id: "affiliate", label: "Affiliate links" },
  { id: "services", label: "Services or coaching" },
  { id: "not_yet", label: "Not yet" },
] as const;
export type Monetization = (typeof MONETIZATION)[number]["id"];

export const ON_CAMERA = [
  { id: "yes", label: "Yes, happily" },
  { id: "sometimes", label: "Sometimes" },
  { id: "no", label: "No, keep me off camera" },
] as const;

export const HOURS = [
  { id: "lt2", label: "Under 2 hours" },
  { id: "2to5", label: "2 to 5 hours" },
  { id: "5to10", label: "5 to 10 hours" },
  { id: "gt10", label: "More than 10 hours" },
] as const;

export const EQUIPMENT = [
  { id: "phone", label: "A phone" },
  { id: "camera", label: "A camera" },
  { id: "microphone", label: "A microphone" },
  { id: "lighting", label: "Lighting" },
] as const;

export const EDITING = [
  { id: "none", label: "I don't edit" },
  { id: "basic", label: "Basic trims and captions" },
  { id: "confident", label: "Confident editor" },
] as const;

export const MAKERS = [
  { id: "solo", label: "Just me" },
  { id: "team", label: "A team or helper" },
] as const;

/** The one main goal asked at onboarding (the brief's five), each tied to a measurable goal metric. */
export const MAIN_GOALS = [
  { id: "views", label: "Increase views", metric: "views_30d" },
  { id: "followers", label: "Gain followers", metric: "followers" },
  { id: "local_customers", label: "Attract local customers", metric: "customers" },
  { id: "bookings_orders", label: "Increase bookings or orders", metric: "bookings" },
  { id: "engagement", label: "Improve engagement", metric: "engagement_rate" },
] as const;
export type MainGoalId = (typeof MAIN_GOALS)[number]["id"];

export type GrowthProfile = {
  account_type?: AccountType;
  main_goal?: MainGoalId;
  /** What SOCIA inferred from the connected accounts (lib/intel/understanding.ts); confirmed fields above win. */
  understanding?: Understanding;
  /** What the account is about, in the person's words (narrower than the niche category). */
  focus?: string;
  /** The confirmed niche below the category: Food & Restaurant > subcategory > specific. */
  niche_path?: { subcategory?: string; specific?: string };
  business?: { offer?: string; customer_action?: CustomerAction; service_area?: ReachScope };
  creator?: { topics?: string; monetization?: Monetization[] };
  audience?: { who?: string; where?: ReachScope; wants?: string };
  personality?: { on_camera?: (typeof ON_CAMERA)[number]["id"]; enjoys?: string };
  resources?: {
    hours_per_week?: (typeof HOURS)[number]["id"];
    equipment?: (typeof EQUIPMENT)[number]["id"][];
    editing?: (typeof EDITING)[number]["id"];
    makers?: (typeof MAKERS)[number]["id"];
  };
};

/** Business and organisation accounts get the business questions; creators and personal brands the creator ones. */
export const usesBusinessBlock = (t: AccountType | undefined) => t === "business" || t === "organization";

const TEXT_MAX = 300;
const str = (v: unknown, max = TEXT_MAX): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.trim().replace(/\s+/g, " ");
  return s ? s.slice(0, max) : undefined;
};
const oneOf = <T extends string>(v: unknown, list: readonly { id: T }[]): T | undefined =>
  typeof v === "string" && list.some((o) => o.id === v) ? (v as T) : undefined;
const manyOf = <T extends string>(v: unknown, list: readonly { id: T }[]): T[] | undefined =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is T => typeof x === "string" && list.some((o) => o.id === x)))] : undefined;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
/** Drop undefined keys and empty objects, so a partial save never writes noise. */
function compact<T extends Record<string, unknown>>(o: T): T | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined) continue;
    if (v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? (out as T) : undefined;
}

/**
 * A Growth Profile from untrusted input: known keys only, known option ids
 * only, text trimmed and bounded. Anything else is dropped, never guessed.
 */
export function normalizeGrowth(input: unknown): GrowthProfile {
  const i = obj(input);
  const b = obj(i.business), c = obj(i.creator), a = obj(i.audience), p = obj(i.personality), r = obj(i.resources);
  return (
    compact({
      account_type: oneOf(i.account_type, ACCOUNT_TYPES),
      main_goal: oneOf(i.main_goal, MAIN_GOALS),
      focus: str(i.focus, 120),
      niche_path: compact({ subcategory: str(obj(i.niche_path).subcategory, 60), specific: str(obj(i.niche_path).specific, 80) }),
      business: compact({ offer: str(b.offer), customer_action: oneOf(b.customer_action, CUSTOMER_ACTIONS), service_area: oneOf(b.service_area, REACH_SCOPES) }),
      creator: compact({ topics: str(c.topics), monetization: manyOf(c.monetization, MONETIZATION) }),
      audience: compact({ who: str(a.who), where: oneOf(a.where, REACH_SCOPES), wants: str(a.wants) }),
      personality: compact({ on_camera: oneOf(p.on_camera, ON_CAMERA), enjoys: str(p.enjoys) }),
      resources: compact({
        hours_per_week: oneOf(r.hours_per_week, HOURS),
        equipment: manyOf(r.equipment, EQUIPMENT),
        editing: oneOf(r.editing, EDITING),
        makers: oneOf(r.makers, MAKERS),
      }),
    }) ?? {}
  );
}

/** Merge a partial save into the stored profile, one section deep (a section is replaced as a whole only when sent). */
export function mergeGrowth(existing: GrowthProfile | null | undefined, patch: GrowthProfile): GrowthProfile {
  const out: GrowthProfile = { ...(existing ?? {}) };
  for (const [k, v] of Object.entries(patch) as [keyof GrowthProfile, unknown][]) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      (out as Record<string, unknown>)[k] = { ...((existing?.[k] as Record<string, unknown> | undefined) ?? {}), ...(v as Record<string, unknown>) };
    } else {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

const labelOf = (list: readonly { id: string; label: string }[], id: string | undefined) => list.find((o) => o.id === id)?.label ?? null;

/** The profile as prompt lines for brandContext. Only what the person said; nothing inferred. */
export function growthLines(g: GrowthProfile | null | undefined): string[] {
  if (!g) return [];
  const lines: (string | null)[] = [
    g.account_type ? `Account type: ${labelOf(ACCOUNT_TYPES, g.account_type)}` : null,
    g.main_goal ? `Main goal: ${labelOf(MAIN_GOALS, g.main_goal)}` : null,
    g.niche_path?.subcategory || g.niche_path?.specific ? `Niche in detail: ${[g.niche_path.subcategory, g.niche_path.specific].filter(Boolean).join(" > ")}` : null,
    g.focus ? `What the account is about: ${g.focus}` : null,
    g.business?.offer ? `What they sell or offer: ${g.business.offer}` : null,
    g.business?.customer_action ? `What a customer should do: ${labelOf(CUSTOMER_ACTIONS, g.business.customer_action)}` : null,
    g.business?.service_area ? `Customers come from: ${labelOf(REACH_SCOPES, g.business.service_area)}` : null,
    g.creator?.topics ? `Topics: ${g.creator.topics}` : null,
    g.creator?.monetization?.length ? `Earns from: ${g.creator.monetization.map((m) => labelOf(MONETIZATION, m)).join(", ")}` : null,
    g.audience?.who ? `Audience: ${g.audience.who}` : null,
    g.audience?.where ? `Audience location: ${labelOf(REACH_SCOPES, g.audience.where)}` : null,
    g.audience?.wants ? `What the audience wants from them: ${g.audience.wants}` : null,
    g.personality?.on_camera ? `On camera: ${labelOf(ON_CAMERA, g.personality.on_camera)}` : null,
    g.personality?.enjoys ? `Content they enjoy making: ${g.personality.enjoys}` : null,
    g.resources?.hours_per_week ? `Time for content each week: ${labelOf(HOURS, g.resources.hours_per_week)}` : null,
    g.resources?.equipment?.length ? `Equipment: ${g.resources.equipment.map((e) => labelOf(EQUIPMENT, e)).join(", ")}` : null,
    g.resources?.editing ? `Editing: ${labelOf(EDITING, g.resources.editing)}` : null,
    g.resources?.makers ? `Who makes the content: ${labelOf(MAKERS, g.resources.makers)}` : null,
  ];
  return lines.filter((l): l is string => Boolean(l));
}

// ------------------------------------------------------------------ goals ----

export type GoalPlatform = "instagram" | "facebook" | "youtube" | "tiktok";
export const GOAL_PLATFORM_NAME: Record<GoalPlatform, string> = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok" };

export type GoalMetricId =
  | "followers"
  | "views_30d"
  | "engagement_rate"
  | "posts_per_week"
  | "customers"
  | "leads"
  | "bookings"
  | "sales"
  | "website_visits";

export type GoalMetric = {
  id: GoalMetricId;
  label: string;
  /** How a value reads: "1,200 followers", "3.4%", "4 a week". */
  unit: "count" | "percent" | "per_week";
  /** Platforms whose data SOCIA reads to measure this. Empty = the person reports it. */
  measuredOn: GoalPlatform[];
  /** Said next to the goal, so nobody thinks SOCIA measures what it can't. */
  note: string;
};

export const GOAL_METRICS: GoalMetric[] = [
  { id: "followers", label: "Followers or subscribers", unit: "count", measuredOn: ["instagram", "facebook", "youtube", "tiktok"], note: "Read from each connected account's own count." },
  { id: "views_30d", label: "Views in the last 30 days", unit: "count", measuredOn: ["instagram", "youtube"], note: "Instagram and YouTube report daily views. Facebook and TikTok don't, for these connections." },
  { id: "engagement_rate", label: "Engagement rate", unit: "percent", measuredOn: ["instagram"], note: "Interactions per post against followers, from Instagram." },
  { id: "posts_per_week", label: "Posts a week", unit: "per_week", measuredOn: ["instagram", "tiktok"], note: "Counted from your published posts over the last 30 days." },
  { id: "customers", label: "New customers from social", unit: "count", measuredOn: [], note: "SOCIA can't see who walked in. You update the number." },
  { id: "leads", label: "Leads or enquiries", unit: "count", measuredOn: [], note: "SOCIA can't see these. You update the number." },
  { id: "bookings", label: "Bookings", unit: "count", measuredOn: [], note: "SOCIA can't see these. You update the number." },
  { id: "sales", label: "Sales", unit: "count", measuredOn: [], note: "SOCIA can't see these. You update the number." },
  { id: "website_visits", label: "Website visits from social", unit: "count", measuredOn: [], note: "SOCIA can't see these. You update the number." },
];
export const goalMetric = (id: string): GoalMetric | null => GOAL_METRICS.find((m) => m.id === id) ?? null;

export type Goal = {
  id?: string;
  kind: "primary" | "secondary";
  metric: GoalMetricId;
  platforms: GoalPlatform[];
  baseline: number | null;
  baseline_at?: string | null;
  /** Self-reported metrics only: the latest number the person entered. */
  current_value?: number | null;
  current_at?: string | null;
  target: number;
  due_date: string | null;
  status?: "active" | "achieved" | "dropped";
};

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 && n < 1e12 ? n : null;
};

/**
 * A goal from untrusted input, or an error saying what to fix. A measured
 * metric keeps only the platforms SOCIA can measure it on; a reported one
 * has no platforms.
 */
export function normalizeGoal(input: unknown, today: string): { goal: Goal } | { error: string } {
  const i = obj(input);
  const m = goalMetric(String(i.metric ?? ""));
  if (!m) return { error: "Choose what you want to grow." };
  const target = num(i.target);
  if (target == null || target <= 0) return { error: "Set a target above zero." };
  if (m.unit === "percent" && target > 100) return { error: "An engagement rate target is a percentage, at most 100." };
  const due = i.due_date == null || i.due_date === "" ? null : isDate(i.due_date) ? (i.due_date as string) : undefined;
  if (due === undefined) return { error: "That date isn't valid." };
  if (due && due <= today) return { error: "Pick a date after today." };
  const platforms = m.measuredOn.length
    ? (manyOf(i.platforms, m.measuredOn.map((id) => ({ id }))) ?? []).filter((p) => m.measuredOn.includes(p))
    : [];
  if (m.measuredOn.length && !platforms.length) return { error: `Choose where to measure it: ${m.measuredOn.map((p) => GOAL_PLATFORM_NAME[p]).join(", ")}.` };
  const baseline = num(i.baseline);
  return {
    goal: {
      ...(typeof i.id === "string" && i.id ? { id: i.id } : {}),
      kind: i.kind === "secondary" ? "secondary" : "primary",
      metric: m.id,
      platforms,
      baseline,
      target,
      due_date: due,
      current_value: m.measuredOn.length ? null : num(i.current_value),
    },
  };
}

export function formatGoalValue(metric: GoalMetricId, v: number | null): string {
  if (v == null) return "not known yet";
  const m = goalMetric(metric);
  if (m?.unit === "percent") return `${Number(v.toFixed(2))}%`;
  if (m?.unit === "per_week") return `${Number(v.toFixed(1))} a week`;
  return Math.round(v).toLocaleString("en-US");
}

const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** One goal in a sentence: "Followers or subscribers on Instagram: 1,200 to 2,000 by Dec 31, 2026". */
export function goalSentence(g: Goal): string {
  const m = goalMetric(g.metric);
  const where = g.platforms.length ? ` on ${g.platforms.map((p) => GOAL_PLATFORM_NAME[p]).join(" and ")}` : "";
  const from = g.baseline != null ? `${formatGoalValue(g.metric, g.baseline)} to ` : "target ";
  return `${m?.label ?? g.metric}${where}: ${from}${formatGoalValue(g.metric, g.target)}${g.due_date ? ` by ${fmtDate(g.due_date)}` : ""}`;
}

/**
 * The goals as the free-text `goals` field every existing reader (plan,
 * Ask, captions, Studio) already uses, so they all see the structured goals
 * without being rewritten. Bounded to the field's limit.
 */
export function goalsSummary(goals: Goal[], max = 1500): string | null {
  const active = goals.filter((g) => (g.status ?? "active") === "active");
  if (!active.length) return null;
  const primary = active.filter((g) => g.kind === "primary");
  const secondary = active.filter((g) => g.kind !== "primary");
  const parts = [
    ...primary.map((g) => `Main goal: ${goalSentence(g)}.`),
    ...(secondary.length ? [`Also: ${secondary.map(goalSentence).join("; ")}.`] : []),
  ];
  return parts.join(" ").slice(0, max);
}

export type GoalProgress = {
  /** Share of the way from baseline to target, 0..1 (can pass 1), or null without a baseline or current value. */
  share: number | null;
  /** What's left to reach the target, in the metric's unit; 0 when reached. */
  remaining: number | null;
  daysLeft: number | null;
  reached: boolean;
  /** Why progress can't be shown, when it can't. */
  missing: string | null;
};

export function goalProgress(g: Goal, current: number | null, now: Date): GoalProgress {
  const daysLeft = g.due_date ? Math.ceil((Date.parse(`${g.due_date}T23:59:59Z`) - now.getTime()) / 86_400_000) : null;
  if (current == null) {
    const reported = !goalMetric(g.metric)?.measuredOn.length;
    return { share: null, remaining: null, daysLeft, reached: false, missing: reported ? "Add your latest number to see progress." : "No current reading from the connected account yet." };
  }
  const reached = current >= g.target;
  const remaining = Math.max(0, g.target - current);
  if (g.baseline == null) return { share: null, remaining, daysLeft, reached, missing: "No starting point was recorded, so progress is measured from today." };
  const span = g.target - g.baseline;
  const share = span > 0 ? (current - g.baseline) / span : reached ? 1 : 0;
  return { share, remaining, daysLeft, reached, missing: null };
}
