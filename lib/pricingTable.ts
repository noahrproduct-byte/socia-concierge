// The plan comparison table, generated from lib/plans.ts so the pricing page
// can never say something PLANS does not. Every number comes from a limit or a
// meter; every availability comes from FEATURE_STATUS plus the plan's feature
// list. A feature that is not built renders "soon" and never "yes": nothing
// here claims a feature that does not exist.
//
// Client-safe: no server imports.

import {
  PLANS, PLAN_ORDER, FEATURE_STATUS, FEATURE_LABEL, METER_PERIOD, PLATFORM_NAME, WORKSPACE_PLATFORMS,
  formatHistory,
  type PlanId, type PlanConfig, type FeatureKey, type LimitKey, type MeterKey,
} from "./plans";

export type Cell =
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "text"; text: string }
  | { kind: "soon" };

export type ComparisonRow = {
  label: string;
  /** Small print under the label, for caveats and definitions (rendered as a tooltip or note). */
  note?: string;
  cells: Record<PlanId, Cell>;
};

export type ComparisonCategory = { category: string; rows: ComparisonRow[] };

const YES: Cell = { kind: "yes" };
const NO: Cell = { kind: "no" };
const SOON: Cell = { kind: "soon" };
const text = (t: string): Cell => ({ kind: "text", text: t });

/** True when the feature exists in the plan list but is not built yet. */
export function featureSoon(key: FeatureKey): boolean {
  return FEATURE_STATUS[key] === "coming_soon";
}

function perPlan(fn: (p: PlanConfig) => Cell): Record<PlanId, Cell> {
  const out = {} as Record<PlanId, Cell>;
  for (const id of PLAN_ORDER) out[id] = fn(PLANS[id]);
  return out;
}

/** yes / soon when the plan includes the feature (depending on whether it is built), no otherwise. */
function featureCell(key: FeatureKey): Record<PlanId, Cell> {
  return perPlan((p) => (p.features[key] ? (featureSoon(key) ? SOON : YES) : NO));
}

function all(cell: Cell): Record<PlanId, Cell> {
  return perPlan(() => cell);
}

function limitCell(key: LimitKey, fmt: (n: number) => string = String): Record<PlanId, Cell> {
  return perPlan((p) => text(fmt(p.limits[key])));
}

/** "50 / month" or "3 / week"; a zero allowance is simply "no". */
function meterCell(key: MeterKey): Record<PlanId, Cell> {
  const per = METER_PERIOD[key];
  return perPlan((p) => (p.meters[key] > 0 ? text(`${p.meters[key]} / ${per}`) : NO));
}

/** A feature row whose label is the feature's own label. */
function feature(key: FeatureKey, note?: string): ComparisonRow {
  return { label: FEATURE_LABEL[key], note, cells: featureCell(key) };
}

/** Every platform a workspace can hold, as prose. */
export const CONNECTED_PLATFORMS = WORKSPACE_PLATFORMS.map((p) => PLATFORM_NAME[p]).join(", ");

/**
 * Platforms SOCIA can publish to today. Facebook publishing waits on Meta's
 * pages_manage_posts review, so it is not listed until it is real.
 */
export const PUBLISHING_PLATFORMS = "Instagram, YouTube, TikTok";

export const COMPARISON: ComparisonCategory[] = [
  {
    category: "Workspaces & platforms",
    rows: [
      {
        label: "Brand Workspaces",
        note: "One workspace is one brand, business, location or client. Each holds up to one account per platform.",
        cells: limitCell("workspaces"),
      },
      { label: "Platforms per workspace", cells: all(text(CONNECTED_PLATFORMS)) },
    ],
  },
  {
    category: "Analytics",
    rows: [
      { label: "Core metrics and recent content performance", cells: all(YES) },
      {
        label: "Analytics history",
        note: "The window you can look back over. A plan never creates history: only what SOCIA has collected or the platform provides is shown.",
        cells: limitCell("analytics_history_days", formatHistory),
      },
      feature("posting_time_analysis"),
      feature("growth_analysis"),
      feature("period_comparison"),
      { label: "What Changed", cells: featureCell("deeper_insights") },
      { label: "What's Working", cells: featureCell("deeper_insights") },
      { label: "What's Missing", cells: featureCell("deeper_insights") },
      { label: "What To Do Next", cells: featureCell("deeper_insights") },
      feature("cross_platform_analytics", "Compare platforms and accounts where the numbers are comparable; combined insights across them."),
      feature("cross_brand_analytics", "Compare performance across your Brand Workspaces."),
    ],
  },
  {
    category: "SOCIA intelligence",
    rows: [
      { label: "Ask SOCIA questions", cells: meterCell("ask_socia") },
      { label: "Content ideas", note: "Quick recommendations built from your recent performance.", cells: meterCell("content_ideas") },
      { label: "Full weekly Content Plan", cells: contentPlanCells() },
      feature("daily_recommendations", "When enough new data has arrived since the last set."),
      feature("repurposing"),
    ],
  },
  {
    category: "Content creation",
    rows: [
      { label: "Content Studio analyses", cells: meterCell("content_studio") },
      { label: "Hooks, captions and CTAs", cells: meterCell("content_generation") },
      { label: "Account audits", cells: meterCell("account_audit") },
    ],
  },
  {
    category: "Competitors & trends",
    rows: [
      { label: "Tracked competitors", note: "Pooled across all your workspaces.", cells: limitCell("competitors") },
      { label: "Niche and trend discovery", cells: all(YES) },
      feature("niche_intelligence", "Working-now patterns, momentum, opportunities and SOCIA readings of top posts."),
      feature("weekly_trend_roundup"),
    ],
  },
  {
    category: "Publishing",
    rows: [
      { label: "Scheduling and direct publishing", note: `On ${PUBLISHING_PLATFORMS} today.`, cells: publishingCells() },
    ],
  },
  {
    category: "Alerts",
    rows: [
      feature("breakout_alerts", "When a post performs well above your recent median for its format."),
      feature("performance_change_alerts"),
      feature("trend_alerts"),
      feature("opportunity_alerts"),
      feature("competitor_alerts"),
      feature("cross_platform_alerts"),
    ],
  },
  {
    category: "Reports",
    rows: [
      feature("monthly_summary"),
      feature("weekly_summary"),
      feature("custom_date_ranges"),
      feature("platform_reports"),
      feature("report_exports"),
      feature("client_reports"),
      { label: "Account data export (JSON)", cells: all(YES) },
    ],
  },
  {
    category: "Team",
    rows: [
      { label: "Team members", note: "Including you.", cells: limitCell("team_members") },
      feature("team", "Invite people to a workspace as Admin or Member."),
      feature("approval_workflow"),
    ],
  },
  {
    category: "Support",
    rows: [
      { label: "Help and email support", cells: all(YES) },
      feature("priority_support"),
      feature("dedicated_onboarding"),
    ],
  },
];

/** Content Plan: the plan must include the feature and have a non-zero allowance. */
function contentPlanCells(): Record<PlanId, Cell> {
  return perPlan((p) => {
    if (!p.features.content_plan || p.meters.content_plan <= 0) return NO;
    if (featureSoon("content_plan")) return SOON;
    return text(`${p.meters.content_plan} / month`);
  });
}

function publishingCells(): Record<PlanId, Cell> {
  return perPlan((p) => (p.features.scheduling ? (featureSoon("scheduling") ? SOON : YES) : NO));
}

/** Features a plan lists that are not built yet, for a separate "coming soon" list. Never mixed into the included list. */
export function comingSoonFor(plan: PlanId): FeatureKey[] {
  return (Object.keys(FEATURE_STATUS) as FeatureKey[]).filter((k) => PLANS[plan].features[k] && featureSoon(k));
}

/** Features a plan includes that are real today (available or policy). */
export function includedFor(plan: PlanId): FeatureKey[] {
  return (Object.keys(FEATURE_STATUS) as FeatureKey[]).filter((k) => PLANS[plan].features[k] && !featureSoon(k));
}
