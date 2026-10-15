import { describe, it, expect } from "vitest";
import { PLANS, PLAN_ORDER, PLAN_RANK, FEATURE_MIN_PLAN, FEATURE_STATUS, planIncludes, normalizePlan, type PlanId, type FeatureKey, type LimitKey, type MeterKey } from "./plans";
import { resolveConfig, canUseFeature, upgradeFor, checkFeature, getLimit, getMeterLimit, currentPeriods, type Entitlements } from "./entitlements";

const NOW = new Date("2026-10-15T12:00:00Z");
const ent = (plan: PlanId, planOverrides: Partial<Record<PlanId, unknown>> = {}, user: unknown = null): Entitlements => {
  const periods = currentPeriods(NOW);
  return { userId: "u", plan, config: resolveConfig(plan, planOverrides, user), period: periods.month, periods, source: "profile" };
};
const FEATURES = Object.keys(FEATURE_MIN_PLAN) as FeatureKey[];
const BUILT = FEATURES.filter((k) => FEATURE_STATUS[k] !== "coming_soon");
const tier = (p: PlanId) => BUILT.filter((k) => FEATURE_MIN_PLAN[k] === p);

describe("plans are cumulative: FREE ⊂ STARTER ⊂ GROWTH ⊂ PRO", () => {
  it("ranks the plans in order", () => {
    expect(PLAN_ORDER.map((p) => PLAN_RANK[p])).toEqual([0, 1, 2, 3]);
  });

  it("includes a feature on its minimum plan and every plan above it, never below", () => {
    for (const p of PLAN_ORDER) for (const k of FEATURES) {
      expect(PLANS[p].features[k]).toBe(PLAN_RANK[p] >= PLAN_RANK[FEATURE_MIN_PLAN[k]]);
      expect(planIncludes(p, k)).toBe(PLANS[p].features[k]);
    }
  });

  it("gives Starter Free + Starter, Growth Free + Starter + Growth, and Pro everything built", () => {
    const usable = (p: PlanId) => BUILT.filter((k) => canUseFeature(ent(p), k)).sort();
    expect(usable("free")).toEqual([...tier("free")].sort());
    expect(usable("starter")).toEqual([...tier("free"), ...tier("starter")].sort());
    expect(usable("growth")).toEqual([...tier("free"), ...tier("starter"), ...tier("growth")].sort());
    expect(usable("pro")).toEqual([...BUILT].sort());
  });

  it("never offers a plan an upgrade to a plan it already outranks", () => {
    for (const p of PLAN_ORDER) for (const k of FEATURES) {
      const offer = upgradeFor(ent(p), k);
      if (offer) expect(PLAN_RANK[offer]).toBeGreaterThan(PLAN_RANK[p]);
      if (planIncludes(p, k)) expect(offer).toBeNull();
    }
    // The Analytics sections a Growth or Pro account must see unlocked.
    for (const p of ["starter", "growth", "pro"] as PlanId[]) {
      for (const k of ["posting_time_analysis", "growth_analysis", "period_comparison", "deeper_insights"] as FeatureKey[]) expect(upgradeFor(ent(p), k)).toBeNull();
    }
    expect(upgradeFor(ent("free"), "deeper_insights")).toBe("starter");
    expect(upgradeFor(ent("starter"), "cross_platform_analytics")).toBe("growth");
    expect(upgradeFor(ent("growth"), "cross_brand_analytics")).toBe("pro");
    // Not built yet: no plan offers it as an upgrade.
    expect(upgradeFor(ent("free"), "developer_api")).toBeNull();
  });

  it("names the right plan when a feature is locked, and only then", () => {
    const r = checkFeature(ent("starter"), "cross_platform_analytics");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.requiredPlan).toBe("growth");
    expect(checkFeature(ent("pro"), "period_comparison").ok).toBe(true);
  });
});

describe("limits and meters come from the current plan", () => {
  it("never shrink going up the plans", () => {
    for (let i = 1; i < PLAN_ORDER.length; i++) {
      const lo = PLANS[PLAN_ORDER[i - 1]], hi = PLANS[PLAN_ORDER[i]];
      for (const k of Object.keys(lo.limits) as LimitKey[]) expect(hi.limits[k], `${hi.id}.${k}`).toBeGreaterThanOrEqual(lo.limits[k]);
      for (const k of Object.keys(lo.meters) as MeterKey[]) expect(hi.meters[k], `${hi.id}.${k}`).toBeGreaterThanOrEqual(lo.meters[k]);
    }
  });

  it("uses the current plan's own number, never the sum of the plans below", () => {
    for (const p of PLAN_ORDER) {
      expect(getMeterLimit(ent(p), "ask_socia")).toBe(PLANS[p].meters.ask_socia);
      expect(getLimit(ent(p), "workspaces")).toBe(PLANS[p].limits.workspaces);
      expect(getLimit(ent(p), "analytics_history_days")).toBe(PLANS[p].limits.analytics_history_days);
    }
  });
});

describe("database overrides can't break the hierarchy", () => {
  it("never removes an included feature", () => {
    const e = ent("pro", { pro: { features: { deeper_insights: false, period_comparison: false } } });
    expect(canUseFeature(e, "deeper_insights")).toBe(true);
    expect(canUseFeature(e, "period_comparison")).toBe(true);
    // Not even a per-person override.
    expect(canUseFeature(ent("growth", {}, { features: { deeper_insights: false } }), "deeper_insights")).toBe(true);
  });

  it("carries a grant on a plan up to every higher plan", () => {
    const grant = { starter: { features: { cross_platform_analytics: true } } };
    expect(canUseFeature(ent("free", grant), "cross_platform_analytics")).toBe(false);
    expect(canUseFeature(ent("starter", grant), "cross_platform_analytics")).toBe(true);
    const freeGrant = { free: { features: { content_plan: true } } };
    expect(canUseFeature(ent("free", freeGrant), "content_plan")).toBe(true);
    for (const p of ["starter", "growth", "pro"] as PlanId[]) expect(canUseFeature(ent(p, freeGrant), "content_plan")).toBe(true);
  });

  it("keeps a higher plan's number at least a lower plan's, without adding them", () => {
    // An override that would leave Growth below Starter is floored at Starter.
    expect(getLimit(ent("growth", { growth: { limits: { competitors: 3 } } }), "competitors")).toBe(PLANS.starter.limits.competitors);
    // Raising Starter past Growth's default lifts Growth to match, not to the sum.
    expect(getLimit(ent("growth", { starter: { limits: { competitors: 20 } } }), "competitors")).toBe(20);
    // The current plan's own override still applies.
    expect(getMeterLimit(ent("growth", { growth: { meters: { ask_socia: 300 } } }), "ask_socia")).toBe(300);
    // A per-person deal sets the number.
    expect(getLimit(ent("starter", {}, { limits: { competitors: 9 } }), "competitors")).toBe(9);
  });

  it("still lets a per-person deal grant a feature", () => {
    expect(canUseFeature(ent("free", {}, { features: { deeper_insights: true } }), "deeper_insights")).toBe(true);
  });
});

describe("reading the stored plan", () => {
  it("tolerates case and spaces, and falls back to Free", () => {
    expect(normalizePlan("pro")).toBe("pro");
    expect(normalizePlan(" Pro ")).toBe("pro");
    expect(normalizePlan("GROWTH")).toBe("growth");
    expect(normalizePlan("enterprise")).toBe("free");
    expect(normalizePlan(null)).toBe("free");
  });
});
