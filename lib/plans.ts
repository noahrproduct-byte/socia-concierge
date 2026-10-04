// Central plan and entitlement configuration: the single source of truth for
// what each SOCIA plan includes. Nothing else in the app hardcodes a price, a
// limit, or a plan check. The pricing page, Settings, API enforcement and
// background jobs all read from here, so adding a feature to a plan is a
// one-line change in this file (or a row in plan_config_overrides, no deploy).
//
// The unit of a plan is the BRAND WORKSPACE: one creator, business, location,
// brand or client. Inside a workspace a person connects up to one account on
// each supported platform (Instagram, Facebook, TikTok, YouTube); those four
// together are still one workspace. Plans cap the number of workspaces, never
// the number of platforms.
//
// Two independent layers, kept separate on purpose:
//   1. FEATURE_STATUS: does the feature exist in the product TODAY? This is the
//      truth layer. A feature that is not built is "coming_soon" no matter what
//      plan someone is on, and the pricing page says so instead of pretending.
//   2. PLANS[plan].features: which plans include the feature once it exists.
// canUseFeature() in lib/entitlements.ts is only true when BOTH say yes.
//
// Numbers here are defaults. lib/entitlements.ts merges plan_config_overrides
// (per plan) and profiles.entitlement_overrides (per user, for custom deals)
// on top, so limits can be tuned from the database without touching code.

export type PlanId = "free" | "starter" | "growth" | "pro";

/** Ascending order; used for "requires Growth or higher" comparisons. */
export const PLAN_ORDER: PlanId[] = ["free", "starter", "growth", "pro"];

/** The platforms a workspace can hold, one account each. Not a plan knob. */
export const WORKSPACE_PLATFORMS = ["instagram", "facebook", "tiktok", "youtube"] as const;
export type WorkspacePlatform = (typeof WORKSPACE_PLATFORMS)[number];
export const PLATFORMS_PER_WORKSPACE = WORKSPACE_PLATFORMS.length;

export const PLATFORM_NAME: Record<WorkspacePlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
};

/**
 * Hard caps on how many of something a plan may have active at once.
 *   workspaces             Brand Workspaces (each holds one account per platform)
 *   competitors            tracked competitors, pooled across all workspaces
 *   team_members           people with access, the owner included
 *   analytics_history_days longest analytics window; HISTORY_ALL_RETAINED = no cap
 */
export type LimitKey = "workspaces" | "competitors" | "team_members" | "analytics_history_days";

/**
 * "All retained history": the plan applies no window of its own, the person
 * sees everything SOCIA has actually collected. A plan never manufactures
 * history; if tracking started 20 days ago there are 20 days, on any plan.
 */
export const HISTORY_ALL_RETAINED = 3650;
export const isAllHistory = (days: number) => days >= HISTORY_ALL_RETAINED;

/**
 * Metered AI operations, counted per period and reset each period.
 *   ask_socia          one Ask SOCIA question                       (per month)
 *   content_studio     one Content Studio analysis or Rater scorecard (per month)
 *   content_generation one hook / caption / CTA / variation generation (per month)
 *   account_audit      one full account audit (niche extraction)     (per month)
 *   content_plan       one full weekly Content Plan generation       (per month)
 *   content_ideas      one batch of quick content ideas              (per week)
 */
export type MeterKey = "ask_socia" | "content_studio" | "content_generation" | "account_audit" | "content_plan" | "content_ideas";

export type MeterPeriod = "month" | "week";

export const METER_PERIOD: Record<MeterKey, MeterPeriod> = {
  ask_socia: "month",
  content_studio: "month",
  content_generation: "month",
  account_audit: "month",
  content_plan: "month",
  content_ideas: "week",
};

/** Meters that appear on pricing cards and in the comparison table. The rest are real but shown only in Settings. */
export const HEADLINE_METERS: MeterKey[] = ["ask_socia", "content_studio"];

export type FeatureKey =
  // Every plan
  | "scheduling"
  | "breakout_alerts"
  | "monthly_summary"
  // Starter
  | "posting_time_analysis"
  | "growth_analysis"
  | "period_comparison"
  | "deeper_insights"
  | "content_plan"
  | "niche_intelligence"
  | "weekly_trend_roundup"
  | "performance_change_alerts"
  | "weekly_summary"
  | "team"
  // Growth
  | "cross_platform_analytics"
  | "daily_recommendations"
  | "repurposing"
  | "custom_date_ranges"
  | "platform_reports"
  | "report_exports"
  | "trend_alerts"
  | "opportunity_alerts"
  | "competitor_alerts"
  | "cross_platform_alerts"
  | "priority_support"
  // Pro
  | "cross_brand_analytics"
  | "client_reports"
  | "approval_workflow"
  | "dedicated_onboarding";

/**
 * "available": built and working in production today.
 * "coming_soon": planned for the plan(s) that list it, but not built. The UI
 *   never renders a working-looking control for these, and the pricing cards
 *   never list them as included: they live in a separate "coming soon" list.
 * "policy": a service commitment (support tier, onboarding) rather than code.
 */
export type FeatureStatus = "available" | "coming_soon" | "policy";

export const FEATURE_STATUS: Record<FeatureKey, FeatureStatus> = {
  scheduling: "available",
  breakout_alerts: "available",
  monthly_summary: "available",
  posting_time_analysis: "available",
  growth_analysis: "available",
  period_comparison: "available",
  deeper_insights: "available",
  content_plan: "available",
  niche_intelligence: "available",
  weekly_trend_roundup: "available",
  performance_change_alerts: "available",
  weekly_summary: "available",
  team: "available",
  cross_platform_analytics: "available",
  daily_recommendations: "coming_soon",
  repurposing: "coming_soon",
  custom_date_ranges: "available",
  platform_reports: "available",
  report_exports: "available",
  trend_alerts: "available",
  opportunity_alerts: "available",
  competitor_alerts: "available",
  cross_platform_alerts: "coming_soon",
  priority_support: "policy",
  cross_brand_analytics: "coming_soon",
  client_reports: "available",
  approval_workflow: "coming_soon",
  dedicated_onboarding: "policy",
};

/** Human labels for feature keys, shared by pricing, Settings and limit notices. */
export const FEATURE_LABEL: Record<FeatureKey, string> = {
  scheduling: "Scheduling and publishing",
  breakout_alerts: "Breakout alerts",
  monthly_summary: "Monthly performance summary",
  posting_time_analysis: "Posting-time analysis",
  growth_analysis: "Growth analysis",
  period_comparison: "Previous-period comparisons",
  deeper_insights: "What Changed, What's Working, What's Missing and What To Do Next",
  content_plan: "Full weekly Content Plan",
  niche_intelligence: "Full niche intelligence",
  weekly_trend_roundup: "Weekly trend roundup",
  performance_change_alerts: "Performance-change alerts",
  weekly_summary: "Weekly performance summary",
  team: "Invite team members",
  cross_platform_analytics: "Cross-platform analytics",
  daily_recommendations: "Daily recommendations",
  repurposing: "Cross-platform content and repurposing recommendations",
  custom_date_ranges: "Custom date-range reports",
  platform_reports: "Platform-specific reports",
  report_exports: "Report exports",
  trend_alerts: "Trend alerts",
  opportunity_alerts: "Opportunity alerts",
  competitor_alerts: "Competitor alerts",
  cross_platform_alerts: "Cross-platform performance alerts",
  priority_support: "Priority support",
  cross_brand_analytics: "Cross-brand analytics",
  client_reports: "Client-ready reports",
  approval_workflow: "Approval workflows",
  dedicated_onboarding: "Dedicated onboarding",
};

export const LIMIT_LABEL: Record<LimitKey, string> = {
  workspaces: "Brand Workspaces",
  competitors: "Competitors",
  team_members: "Team members",
  analytics_history_days: "Analytics history",
};

export const METER_LABEL: Record<MeterKey, string> = {
  ask_socia: "Ask SOCIA",
  content_studio: "Content Studio",
  content_generation: "Hooks and captions",
  account_audit: "Account audits",
  content_plan: "Content Plans",
  content_ideas: "Content ideas",
};

/** Unit word for a meter, for "3 analyses left" style copy. */
export const METER_UNIT: Record<MeterKey, { one: string; many: string }> = {
  ask_socia: { one: "question", many: "questions" },
  content_studio: { one: "analysis", many: "analyses" },
  content_generation: { one: "generation", many: "generations" },
  account_audit: { one: "audit", many: "audits" },
  content_plan: { one: "plan", many: "plans" },
  content_ideas: { one: "idea", many: "ideas" },
};

/** Unit word for a hard limit, for "Starter includes 2 Brand Workspaces" copy. */
export const LIMIT_UNIT: Record<LimitKey, { one: string; many: string }> = {
  workspaces: { one: "Brand Workspace", many: "Brand Workspaces" },
  competitors: { one: "competitor", many: "competitors" },
  team_members: { one: "team member", many: "team members" },
  analytics_history_days: { one: "day of analytics history", many: "days of analytics history" },
};

export type PlanConfig = {
  id: PlanId;
  name: string;
  /** USD per month. 0 for Free. */
  priceMonthly: number;
  /** USD per year when billed annually (two months free). 0 for Free. */
  priceAnnual: number;
  /** The one-line story: what this plan is for. */
  tagline: string;
  /** "Best for" line. */
  audience: string;
  limits: Record<LimitKey, number>;
  /** Per period (see METER_PERIOD). Never "unlimited": AI has a real marginal cost. */
  meters: Record<MeterKey, number>;
  features: Record<FeatureKey, boolean>;
  /** Button label once a checkout exists. Until then paid plans say "Contact us". */
  cta: string;
  popular?: boolean;
};

const F = (on: FeatureKey[]): Record<FeatureKey, boolean> => {
  const out = {} as Record<FeatureKey, boolean>;
  for (const k of Object.keys(FEATURE_STATUS) as FeatureKey[]) out[k] = on.includes(k);
  return out;
};

const FREE_FEATURES: FeatureKey[] = ["scheduling", "breakout_alerts", "monthly_summary"];
const STARTER_FEATURES: FeatureKey[] = [
  ...FREE_FEATURES,
  "posting_time_analysis", "growth_analysis", "period_comparison", "deeper_insights",
  "content_plan", "niche_intelligence", "weekly_trend_roundup",
  "performance_change_alerts", "weekly_summary", "team",
];
const GROWTH_FEATURES: FeatureKey[] = [
  ...STARTER_FEATURES,
  "cross_platform_analytics", "daily_recommendations", "repurposing",
  "custom_date_ranges", "platform_reports", "report_exports",
  "trend_alerts", "opportunity_alerts", "competitor_alerts", "cross_platform_alerts",
  "priority_support",
];
const PRO_FEATURES: FeatureKey[] = [
  ...GROWTH_FEATURES,
  "cross_brand_analytics", "client_reports", "approval_workflow", "dedicated_onboarding",
];

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    priceAnnual: 0,
    tagline: "Understand one brand.",
    audience: "People trying SOCIA and managing one brand.",
    limits: { workspaces: 1, competitors: 2, team_members: 1, analytics_history_days: 30 },
    meters: { ask_socia: 10, content_studio: 5, content_generation: 6, account_audit: 1, content_plan: 0, content_ideas: 3 },
    features: F(FREE_FEATURES),
    cta: "Get started free",
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthly: 29,
    priceAnnual: 290,
    tagline: "Run up to two brands with SOCIA.",
    audience: "Creators and small businesses managing one or two brands.",
    limits: { workspaces: 2, competitors: 5, team_members: 2, analytics_history_days: 90 },
    meters: { ask_socia: 50, content_studio: 30, content_generation: 120, account_audit: 4, content_plan: 4, content_ideas: 3 },
    features: F(STARTER_FEATURES),
    cta: "Start Starter",
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceMonthly: 79,
    priceAnnual: 790,
    tagline: "Grow multiple brands across every platform.",
    audience: "Growing creators and businesses managing multiple brands and social platforms.",
    limits: { workspaces: 5, competitors: 15, team_members: 5, analytics_history_days: 365 },
    meters: { ask_socia: 250, content_studio: 150, content_generation: 500, account_audit: 12, content_plan: 12, content_ideas: 3 },
    features: F(GROWTH_FEATURES),
    cta: "Start Growth",
    popular: true,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 179,
    priceAnnual: 1790,
    tagline: "Manage brands, clients, and teams at scale.",
    audience: "Agencies, teams, multi-location businesses, and people managing many brands or clients.",
    limits: { workspaces: 15, competitors: 30, team_members: 10, analytics_history_days: HISTORY_ALL_RETAINED },
    // Deliberately higher, deliberately finite. Tune in plan_config_overrides.
    meters: { ask_socia: 600, content_studio: 400, content_generation: 1200, account_audit: 30, content_plan: 40, content_ideas: 3 },
    features: F(PRO_FEATURES),
    cta: "Start Pro",
  },
};

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && (PLAN_ORDER as string[]).includes(v);
}

/** Unknown or missing values resolve to Free: features gate closed until the database says otherwise. */
export function normalizePlan(v: unknown): PlanId {
  return isPlanId(v) ? v : "free";
}

export function planRank(p: PlanId): number {
  return PLAN_ORDER.indexOf(p);
}

export function isAtLeast(p: PlanId, min: PlanId): boolean {
  return planRank(p) >= planRank(min);
}

/** The cheapest plan that includes a feature, or null when no plan does. */
export function minPlanWithFeature(key: FeatureKey): PlanId | null {
  for (const id of PLAN_ORDER) if (PLANS[id].features[key]) return id;
  return null;
}

/** The cheapest plan whose limit for `key` is at least `n`, or null when none reaches it (custom pricing). */
export function minPlanWithLimit(key: LimitKey, n: number): PlanId | null {
  for (const id of PLAN_ORDER) if (PLANS[id].limits[key] >= n) return id;
  return null;
}

/** The cheapest plan whose meter allows more than `n` uses per period. */
export function minPlanWithMeter(key: MeterKey, n: number): PlanId | null {
  for (const id of PLAN_ORDER) if (PLANS[id].meters[key] > n) return id;
  return null;
}

/** The plan one step up, or null on Pro (where the answer is custom pricing). */
export function nextPlan(p: PlanId): PlanId | null {
  const i = planRank(p);
  return i >= 0 && i < PLAN_ORDER.length - 1 ? PLAN_ORDER[i + 1] : null;
}

export function formatPrice(p: PlanConfig): string {
  return p.priceMonthly === 0 ? "$0" : `$${p.priceMonthly}`;
}

/** How a subscription is billed. */
export type BillingInterval = "month" | "year";

/** The amount charged per billing period. */
export function priceFor(p: PlanConfig, interval: BillingInterval): number {
  return interval === "year" ? p.priceAnnual : p.priceMonthly;
}

/** The per-month figure shown on a card: the monthly price, or the annual price spread over 12 months. */
export function monthlyEquivalent(p: PlanConfig, interval: BillingInterval): string {
  if (p.priceMonthly === 0) return "$0";
  return interval === "year" ? `$${Math.round(p.priceAnnual / 12)}` : `$${p.priceMonthly}`;
}

/** "Billed $290 a year · 2 months free", or null for Free. */
export function annualNote(p: PlanConfig): string | null {
  if (p.priceAnnual === 0 || p.priceMonthly === 0) return null;
  const monthsFree = Math.round(12 - p.priceAnnual / p.priceMonthly);
  return `Billed $${p.priceAnnual.toLocaleString("en-US")} a year${monthsFree > 0 ? ` · ${monthsFree} months free` : ""}`;
}

/** "30 days", "90 days", "1 year" or "All retained history" from the history limit. */
export function formatHistory(days: number): string {
  if (isAllHistory(days)) return "All retained history";
  if (days >= 365) return days === 365 ? "1 year" : `${Math.round(days / 365)} years`;
  return `${days} days`;
}

/** Where every "upgrade" moment sends people. One place to change when checkout lands. */
export const PRICING_PATH = "/pricing";

export function pricingHref(plan?: PlanId | null): string {
  return plan ? `${PRICING_PATH}?plan=${plan}` : PRICING_PATH;
}

/**
 * Where "Need more? Contact us" and paid-plan CTAs go while checkout is not
 * wired. The only address SOCIA publishes today (privacy, terms); override
 * with NEXT_PUBLIC_SUPPORT_EMAIL once a support mailbox exists.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "socia.app2026@gmail.com";

export function contactHref(subject: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/**
 * Whether a working checkout exists. Stripe is not wired yet, so this is false
 * and every paid CTA says so honestly instead of pretending to start a purchase.
 * Flip by configuring the billing provider; nothing else in the UI needs to change.
 */
export function checkoutAvailable(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}
