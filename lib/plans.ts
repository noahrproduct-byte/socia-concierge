// Central plan and entitlement configuration: the single source of truth for
// what each SOCIA plan includes. Nothing else in the app hardcodes a price, a
// limit, or a plan check. The pricing page, Settings, API enforcement and
// background jobs all read from here, so adding a feature to a plan is a
// one-line change in this file (or a row in plan_config_overrides, no deploy).
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

/** Hard caps on how many of something a plan may have active at once. */
export type LimitKey = "connected_accounts" | "competitors" | "team_seats" | "analytics_history_days";

/**
 * Metered AI operations, counted per billing period and reset each period.
 *   ask_socia          one Ask SOCIA question
 *   content_studio     one Content Studio analysis or Content Rater scorecard
 *   content_generation one hook / caption / CTA / variation generation
 *   account_audit      one full account audit (niche extraction)
 *   content_plan       one weekly Content Plan generation
 */
export type MeterKey = "ask_socia" | "content_studio" | "content_generation" | "account_audit" | "content_plan";

export type FeatureKey =
  // Core loop
  | "scheduling"
  | "content_plan"
  | "niche_intelligence"
  | "extended_history"
  | "performance_reports"
  // Growth
  | "cross_platform_analytics"
  | "custom_date_ranges"
  | "daily_recommendations"
  | "trend_alerts"
  | "advanced_reports"
  | "analytics_exports"
  | "team"
  | "priority_support"
  // Pro
  | "multi_brand"
  | "approval_workflow"
  | "white_label_reports"
  | "api_access"
  | "dedicated_onboarding";

/**
 * "available": built and working in production today.
 * "coming_soon": planned for the plan(s) that list it, but not built. The UI
 *   never renders a working-looking control for these.
 * "policy": a service commitment (support tier, onboarding) rather than code.
 */
export type FeatureStatus = "available" | "coming_soon" | "policy";

export const FEATURE_STATUS: Record<FeatureKey, FeatureStatus> = {
  scheduling: "available",
  content_plan: "available",
  niche_intelligence: "available",
  extended_history: "available",
  performance_reports: "coming_soon",
  cross_platform_analytics: "coming_soon",
  custom_date_ranges: "coming_soon",
  daily_recommendations: "coming_soon",
  trend_alerts: "coming_soon",
  advanced_reports: "coming_soon",
  analytics_exports: "coming_soon",
  team: "coming_soon",
  priority_support: "policy",
  multi_brand: "coming_soon",
  approval_workflow: "coming_soon",
  white_label_reports: "coming_soon",
  api_access: "coming_soon",
  dedicated_onboarding: "policy",
};

/** Human labels for feature keys, shared by pricing, Settings and limit notices. */
export const FEATURE_LABEL: Record<FeatureKey, string> = {
  scheduling: "Scheduling and publishing",
  content_plan: "Weekly Content Plan",
  niche_intelligence: "Niche intelligence",
  extended_history: "90-day and 1-year analytics",
  performance_reports: "Monthly performance summary",
  cross_platform_analytics: "Cross-platform analytics",
  custom_date_ranges: "Custom date ranges",
  daily_recommendations: "Daily recommendations",
  trend_alerts: "Trend alerts",
  advanced_reports: "Advanced reports",
  analytics_exports: "Analytics exports",
  team: "Team seats",
  priority_support: "Priority support",
  multi_brand: "Multi-brand and client management",
  approval_workflow: "Approval workflow",
  white_label_reports: "White-label reports",
  api_access: "API access",
  dedicated_onboarding: "Dedicated onboarding",
};

export const LIMIT_LABEL: Record<LimitKey, string> = {
  connected_accounts: "Connected accounts",
  competitors: "Competitors",
  team_seats: "Team seats",
  analytics_history_days: "Analytics history",
};

export const METER_LABEL: Record<MeterKey, string> = {
  ask_socia: "Ask SOCIA",
  content_studio: "Content Studio",
  content_generation: "Hooks and captions",
  account_audit: "Account audits",
  content_plan: "Content Plans",
};

/** Unit word for a meter, for "3 analyses left" style copy. */
export const METER_UNIT: Record<MeterKey, { one: string; many: string }> = {
  ask_socia: { one: "question", many: "questions" },
  content_studio: { one: "analysis", many: "analyses" },
  content_generation: { one: "generation", many: "generations" },
  account_audit: { one: "audit", many: "audits" },
  content_plan: { one: "plan", many: "plans" },
};

/** Unit word for a hard limit, for "Starter includes 1 connected account" copy. */
export const LIMIT_UNIT: Record<LimitKey, { one: string; many: string }> = {
  connected_accounts: { one: "connected account", many: "connected accounts" },
  competitors: { one: "competitor", many: "competitors" },
  team_seats: { one: "team seat", many: "team seats" },
  analytics_history_days: { one: "day of analytics history", many: "days of analytics history" },
};

export type PlanConfig = {
  id: PlanId;
  name: string;
  /** USD per month. 0 for Free. */
  priceMonthly: number;
  tagline: string;
  audience: string;
  limits: Record<LimitKey, number>;
  /** Per billing period. Never "unlimited": AI has a real marginal cost. */
  meters: Record<MeterKey, number>;
  features: Record<FeatureKey, boolean>;
  cta: string;
  popular?: boolean;
};

const F = (on: FeatureKey[]): Record<FeatureKey, boolean> => {
  const out = {} as Record<FeatureKey, boolean>;
  for (const k of Object.keys(FEATURE_STATUS) as FeatureKey[]) out[k] = on.includes(k);
  return out;
};

const STARTER_FEATURES: FeatureKey[] = ["scheduling", "content_plan", "niche_intelligence", "extended_history", "custom_date_ranges", "performance_reports"];
const GROWTH_FEATURES: FeatureKey[] = [
  ...STARTER_FEATURES,
  "cross_platform_analytics", "daily_recommendations", "trend_alerts",
  "advanced_reports", "analytics_exports", "team", "priority_support",
];
const PRO_FEATURES: FeatureKey[] = [
  ...GROWTH_FEATURES,
  "multi_brand", "approval_workflow", "white_label_reports", "api_access", "dedicated_onboarding",
];

export const PLANS: Record<PlanId, PlanConfig> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    tagline: "See what SOCIA can uncover about your social media.",
    audience: "Try SOCIA and see whether it understands your account.",
    limits: { connected_accounts: 1, competitors: 1, team_seats: 1, analytics_history_days: 30 },
    meters: { ask_socia: 5, content_studio: 3, content_generation: 6, account_audit: 1, content_plan: 0 },
    features: F([]),
    cta: "Start Free",
  },
  starter: {
    id: "starter",
    name: "Starter",
    priceMonthly: 29,
    tagline: "Everything you need to understand, plan, improve, and publish your content.",
    audience: "Individual creators and small businesses.",
    limits: { connected_accounts: 1, competitors: 3, team_seats: 1, analytics_history_days: 365 },
    meters: { ask_socia: 50, content_studio: 30, content_generation: 120, account_audit: 4, content_plan: 4 },
    features: F(STARTER_FEATURES),
    cta: "Start Starter",
  },
  growth: {
    id: "growth",
    name: "Growth",
    priceMonthly: 79,
    tagline: "Understand and grow all of your social platforms together.",
    audience: "Growing creators, small businesses, and anyone managing several platforms.",
    limits: { connected_accounts: 5, competitors: 10, team_seats: 2, analytics_history_days: 365 },
    meters: { ask_socia: 250, content_studio: 150, content_generation: 500, account_audit: 12, content_plan: 12 },
    features: F(GROWTH_FEATURES),
    cta: "Choose Growth",
    popular: true,
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthly: 179,
    tagline: "Manage multiple brands, clients, and social accounts from one intelligent workspace.",
    audience: "Agencies, social media teams, brands, and multi-location businesses.",
    limits: { connected_accounts: 15, competitors: 25, team_seats: 5, analytics_history_days: 365 },
    // Deliberately higher, deliberately finite. Tune in plan_config_overrides.
    meters: { ask_socia: 600, content_studio: 400, content_generation: 1200, account_audit: 30, content_plan: 40 },
    features: F(PRO_FEATURES),
    cta: "Choose Pro",
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
