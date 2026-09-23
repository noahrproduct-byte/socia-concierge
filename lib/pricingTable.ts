// The plan comparison table, generated from lib/plans.ts so the pricing page
// can never say something PLANS does not. Every number comes from a limit or a
// meter; every availability comes from FEATURE_STATUS plus the plan's feature
// list. Rows for things that have no feature key yet are marked "soon"
// explicitly and never "yes": nothing here claims a feature that is not built.
//
// Client-safe: no server imports.

import {
  PLANS, PLAN_ORDER, FEATURE_STATUS, isAtLeast,
  type PlanId, type PlanConfig, type FeatureKey, type LimitKey, type MeterKey,
} from "./plans";

export type Cell =
  | { kind: "yes" }
  | { kind: "no" }
  | { kind: "text"; text: string }
  | { kind: "soon" };

export type ComparisonRow = {
  label: string;
  /** Small print under the label, for "team features are coming soon" style caveats. */
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

/** The same cell for every plan at or above `min`, "no" below it. */
function fromPlan(min: PlanId, cell: Cell): Record<PlanId, Cell> {
  return perPlan((p) => (isAtLeast(p.id, min) ? cell : NO));
}

function all(cell: Cell): Record<PlanId, Cell> {
  return perPlan(() => cell);
}

function limitCell(key: LimitKey, fmt: (n: number) => string = String): Record<PlanId, Cell> {
  return perPlan((p) => text(fmt(p.limits[key])));
}

/** "50 / month"; a zero allowance is simply "no". */
function meterCell(key: MeterKey): Record<PlanId, Cell> {
  return perPlan((p) => (p.meters[key] > 0 ? text(`${p.meters[key]} / month`) : NO));
}

/** "30 days" or "12 months" from the analytics history limit. */
export function formatHistory(days: number): string {
  if (days >= 60) return `${Math.round(days / 30.4)} months`;
  return `${days} days`;
}

/** Built platforms; TikTok has its own "soon" row until it connects. */
export const CONNECTED_PLATFORMS = "Instagram, Facebook, YouTube";

export const COMPARISON: ComparisonCategory[] = [
  {
    category: "Accounts",
    rows: [
      { label: "Connected accounts", cells: limitCell("connected_accounts") },
      { label: "Connected platforms", cells: all(text(CONNECTED_PLATFORMS)) },
      { label: "TikTok", cells: all(SOON) },
    ],
  },
  {
    category: "Analytics",
    rows: [
      { label: "Account analytics", cells: all(YES) },
      { label: "Analytics history", cells: limitCell("analytics_history_days", formatHistory) },
      { label: "Custom date ranges", cells: featureCell("custom_date_ranges") },
      { label: "Cross-platform analytics", cells: featureCell("cross_platform_analytics") },
      { label: "Multi-account comparison", cells: featureCell("cross_platform_analytics") },
    ],
  },
  {
    category: "AI & Strategy",
    rows: [
      { label: "Ask SOCIA questions", cells: meterCell("ask_socia") },
      { label: "Account audits", cells: meterCell("account_audit") },
      { label: "Weekly Content Plan", cells: contentPlanCells() },
      { label: "What To Do Next recommendations", cells: featureCell("content_plan") },
      { label: "Daily recommendations", cells: featureCell("daily_recommendations") },
    ],
  },
  {
    category: "Content Studio",
    rows: [
      { label: "Content Studio analyses and Content Rater scorecards", cells: meterCell("content_studio") },
      { label: "Hooks, captions and CTAs", cells: meterCell("content_generation") },
    ],
  },
  {
    category: "Competitors",
    rows: [
      { label: "Tracked competitors", cells: limitCell("competitors") },
    ],
  },
  {
    category: "Trends",
    rows: [
      { label: "Niche intelligence", cells: featureCell("niche_intelligence") },
      // No feature key yet: stays "soon" until the trends work ships.
      { label: "Advanced trend intelligence", cells: fromPlan("growth", SOON) },
      { label: "Trend alerts", cells: featureCell("trend_alerts") },
    ],
  },
  {
    category: "Planning",
    rows: [
      { label: "Content calendar", cells: all(YES) },
    ],
  },
  {
    category: "Publishing",
    rows: [
      { label: "Direct publishing and scheduling", cells: publishingCells() },
      { label: "TikTok, YouTube and Facebook publishing", cells: perPlan((p) => (p.features.scheduling ? SOON : NO)) },
    ],
  },
  {
    category: "Reporting",
    rows: [
      { label: "Monthly performance summary", cells: featureCell("performance_reports") },
      { label: "Weekly and advanced reports", cells: featureCell("advanced_reports") },
      { label: "Analytics exports (CSV)", cells: featureCell("analytics_exports") },
      { label: "Data export (JSON)", cells: all(YES) },
    ],
  },
  {
    category: "Team",
    rows: [
      {
        label: "Team seats",
        note: "Team features are coming soon.",
        cells: limitCell("team_seats"),
      },
      { label: "Invite teammates", cells: featureCell("team") },
    ],
  },
  {
    category: "Professional features",
    rows: [
      { label: "Multi-brand and client management", cells: featureCell("multi_brand") },
      { label: "Approval workflow", cells: featureCell("approval_workflow") },
      { label: "White-label reports", cells: featureCell("white_label_reports") },
      { label: "API access", cells: featureCell("api_access") },
    ],
  },
  {
    category: "Support",
    rows: [
      { label: "Priority support", cells: featureCell("priority_support") },
      { label: "Dedicated onboarding", cells: featureCell("dedicated_onboarding") },
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

/** Publishing is Instagram only today; other platforms have their own "soon" row. */
function publishingCells(): Record<PlanId, Cell> {
  return perPlan((p) => {
    if (!p.features.scheduling) return NO;
    return featureSoon("scheduling") ? SOON : text("Instagram");
  });
}
