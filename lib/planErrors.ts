// The one shape every "you can't do that on this plan" answer takes, and the
// copy for it. Client-safe (no server imports) so the same object that an API
// route returns as a 403 body can be rendered by the client component that
// made the request, with a contextual CTA instead of a generic error.
//
// Copy rules: say which plan the person is on, what it includes, and where the
// thing they want lives. Never a bare "Forbidden". No em dashes.

import {
  PLANS, FEATURE_LABEL, FEATURE_STATUS, LIMIT_UNIT, METER_LABEL, PRICING_PATH,
  minPlanWithFeature, minPlanWithLimit, minPlanWithMeter, pricingHref,
  type PlanId, type FeatureKey, type LimitKey, type MeterKey,
} from "./plans";

export type PlanErrorCode = "feature_locked" | "coming_soon" | "limit_reached" | "usage_exhausted";

export type PlanError = {
  /** One sentence for the person, ready to render. */
  error: string;
  code: PlanErrorCode;
  plan: PlanId;
  planName: string;
  /** The cheapest plan that lifts the restriction, or null when none does (custom pricing). */
  requiredPlan: PlanId | null;
  requiredPlanName: string | null;
  feature?: FeatureKey;
  limit?: LimitKey;
  meter?: MeterKey;
  /** null = SOCIA could not read the counter (metering not installed), never 0. */
  used?: number | null;
  max?: number;
  /** ISO date the metered allowance resets, when the error is about usage. */
  resetsOn?: string;
  /** Button label and destination for the contextual upgrade moment. */
  cta: string;
  href: string;
};

/** Plural phrase per meter, for "You've used all 30 Content Studio analyses" copy. */
export const METER_PHRASE: Record<MeterKey, string> = {
  ask_socia: "Ask SOCIA questions",
  content_studio: "Content Studio analyses",
  content_generation: "hook and caption generations",
  account_audit: "account audits",
  content_plan: "Content Plan generations",
};

const CUSTOM_HREF = `${PRICING_PATH}#custom`;

function upgradeCta(required: PlanId | null, verb: "Upgrade to" | "See" | "View"): { cta: string; href: string } {
  if (!required) return { cta: "Contact us for custom pricing", href: CUSTOM_HREF };
  return { cta: `${verb} ${PLANS[required].name}`, href: pricingHref(required) };
}

export function isPlanError(v: unknown): v is PlanError {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.error === "string" && typeof o.code === "string" && typeof o.plan === "string" && typeof o.href === "string";
}

/** Feature not included on this plan, or not built yet. */
export function featureError(plan: PlanId, feature: FeatureKey): PlanError {
  const required = minPlanWithFeature(feature);
  const label = FEATURE_LABEL[feature];
  if (FEATURE_STATUS[feature] === "coming_soon") {
    return {
      error: `${label} is coming soon.`,
      code: "coming_soon", plan, planName: PLANS[plan].name,
      requiredPlan: required, requiredPlanName: required ? PLANS[required].name : null,
      feature, cta: "See plans", href: PRICING_PATH,
    };
  }
  const { cta, href } = upgradeCta(required, "See");
  return {
    error: required ? `${label} is available on ${PLANS[required].name}.` : `${label} is not included in any plan yet.`,
    code: "feature_locked", plan, planName: PLANS[plan].name,
    requiredPlan: required, requiredPlanName: required ? PLANS[required].name : null,
    feature, cta, href,
  };
}

/** A hard cap (accounts, competitors, seats) is full. */
export function limitError(plan: PlanId, limit: LimitKey, max: number, used?: number | null): PlanError {
  const unit = max === 1 ? LIMIT_UNIT[limit].one : LIMIT_UNIT[limit].many;
  const required = minPlanWithLimit(limit, max + 1);
  const { cta, href } = upgradeCta(required, "View");
  return {
    error: `${PLANS[plan].name} includes ${max} ${unit}.`,
    code: "limit_reached", plan, planName: PLANS[plan].name,
    requiredPlan: required, requiredPlanName: required ? PLANS[required].name : null,
    limit, max, used: used ?? undefined, cta, href,
  };
}

/** A metered allowance is used up for this period. */
export function usageError(plan: PlanId, meter: MeterKey, max: number, used: number | null, resetsOn: string): PlanError {
  const required = minPlanWithMeter(meter, max);
  const { cta, href } = upgradeCta(required, "Upgrade to");
  const error = max === 0
    ? `${METER_LABEL[meter]} is not included in ${PLANS[plan].name}.`
    : `You've used all ${max} ${METER_PHRASE[meter]} included in ${PLANS[plan].name} this billing period.`;
  return {
    error, code: "usage_exhausted", plan, planName: PLANS[plan].name,
    requiredPlan: required, requiredPlanName: required ? PLANS[required].name : null,
    meter, max, used, resetsOn, cta, href,
  };
}

/** "Oct 1" from an ISO date, for "Resets on Oct 1". */
export function formatResetDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
