import { describe, it, expect } from "vitest";
import {
  PLANS, PLAN_ORDER, FEATURE_STATUS, FEATURE_LABEL, METER_LABEL, LIMIT_LABEL, METER_UNIT,
  normalizePlan, isAtLeast, minPlanWithFeature, minPlanWithLimit, minPlanWithMeter, nextPlan, formatPrice, pricingHref,
  type FeatureKey, type LimitKey, type MeterKey,
} from "./plans";

const FEATURES = Object.keys(FEATURE_STATUS) as FeatureKey[];
const LIMITS = Object.keys(LIMIT_LABEL) as LimitKey[];
const METERS = Object.keys(METER_LABEL) as MeterKey[];

describe("plan configuration", () => {
  it("has the four confirmed plans at the confirmed prices, in order", () => {
    expect(PLAN_ORDER).toEqual(["free", "starter", "growth", "pro"]);
    expect(PLANS.free.priceMonthly).toBe(0);
    expect(PLANS.starter.priceMonthly).toBe(29);
    expect(PLANS.growth.priceMonthly).toBe(79);
    expect(PLANS.pro.priceMonthly).toBe(179);
    expect(PLANS.growth.popular).toBe(true);
  });

  it("matches the confirmed hard limits", () => {
    expect(PLAN_ORDER.map((p) => PLANS[p].limits.connected_accounts)).toEqual([1, 1, 5, 15]);
    expect(PLAN_ORDER.map((p) => PLANS[p].limits.competitors)).toEqual([1, 3, 10, 25]);
    expect(PLAN_ORDER.map((p) => PLANS[p].limits.team_seats)).toEqual([1, 1, 2, 5]);
    expect(PLAN_ORDER.map((p) => PLANS[p].meters.ask_socia)).toEqual([5, 50, 250, 600]);
    expect(PLAN_ORDER.map((p) => PLANS[p].meters.content_studio)).toEqual([3, 30, 150, 400]);
  });

  it("never decreases a limit or meter going up the ladder", () => {
    for (let i = 1; i < PLAN_ORDER.length; i++) {
      const lo = PLANS[PLAN_ORDER[i - 1]], hi = PLANS[PLAN_ORDER[i]];
      for (const k of LIMITS) expect(hi.limits[k]).toBeGreaterThanOrEqual(lo.limits[k]);
      for (const k of METERS) expect(hi.meters[k]).toBeGreaterThanOrEqual(lo.meters[k]);
    }
  });

  it("never removes a feature going up the ladder", () => {
    for (let i = 1; i < PLAN_ORDER.length; i++) {
      const lo = PLANS[PLAN_ORDER[i - 1]], hi = PLANS[PLAN_ORDER[i]];
      for (const k of FEATURES) if (lo.features[k]) expect(hi.features[k]).toBe(true);
    }
  });

  it("never promises unlimited AI", () => {
    for (const p of PLAN_ORDER) for (const k of METERS) {
      expect(Number.isFinite(PLANS[p].meters[k])).toBe(true);
      expect(PLANS[p].meters[k]).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps the core loop on Starter and the multi-account/team features off Free and Starter", () => {
    expect(PLANS.free.features.scheduling).toBe(false);
    expect(PLANS.starter.features.scheduling).toBe(true);
    expect(PLANS.starter.features.content_plan).toBe(true);
    expect(PLANS.starter.features.cross_platform_analytics).toBe(false);
    expect(PLANS.growth.features.cross_platform_analytics).toBe(true);
    expect(PLANS.growth.features.white_label_reports).toBe(false);
    expect(PLANS.pro.features.white_label_reports).toBe(true);
  });

  it("labels every key so the UI never renders a raw identifier", () => {
    for (const k of FEATURES) expect(FEATURE_LABEL[k]).toBeTruthy();
    for (const k of LIMITS) expect(LIMIT_LABEL[k]).toBeTruthy();
    for (const k of METERS) {
      expect(METER_LABEL[k]).toBeTruthy();
      expect(METER_UNIT[k].one).toBeTruthy();
      expect(METER_UNIT[k].many).toBeTruthy();
    }
  });

  it("uses no em dashes in user-facing copy", () => {
    const strings = [
      ...PLAN_ORDER.flatMap((p) => [PLANS[p].tagline, PLANS[p].audience, PLANS[p].cta, PLANS[p].name]),
      ...Object.values(FEATURE_LABEL), ...Object.values(LIMIT_LABEL), ...Object.values(METER_LABEL),
    ];
    for (const s of strings) expect(s.includes("—")).toBe(false);
  });
});

describe("plan helpers", () => {
  it("resolves anything unknown to free", () => {
    expect(normalizePlan("pro")).toBe("pro");
    expect(normalizePlan("growth")).toBe("growth");
    expect(normalizePlan("enterprise")).toBe("free");
    expect(normalizePlan(null)).toBe("free");
    expect(normalizePlan(undefined)).toBe("free");
    expect(normalizePlan(42)).toBe("free");
  });

  it("compares plans by rank", () => {
    expect(isAtLeast("growth", "starter")).toBe(true);
    expect(isAtLeast("starter", "growth")).toBe(false);
    expect(isAtLeast("pro", "pro")).toBe(true);
  });

  it("finds the cheapest plan that unlocks something", () => {
    expect(minPlanWithFeature("scheduling")).toBe("starter");
    expect(minPlanWithFeature("cross_platform_analytics")).toBe("growth");
    expect(minPlanWithFeature("api_access")).toBe("pro");
    expect(minPlanWithLimit("connected_accounts", 2)).toBe("growth");
    expect(minPlanWithLimit("connected_accounts", 15)).toBe("pro");
    expect(minPlanWithLimit("connected_accounts", 16)).toBeNull();
    expect(minPlanWithLimit("competitors", 4)).toBe("growth");
    expect(minPlanWithMeter("ask_socia", 5)).toBe("starter");
    expect(minPlanWithMeter("ask_socia", 600)).toBeNull();
  });

  it("steps up one plan at a time and stops at pro", () => {
    expect(nextPlan("free")).toBe("starter");
    expect(nextPlan("growth")).toBe("pro");
    expect(nextPlan("pro")).toBeNull();
  });

  it("formats prices and pricing links", () => {
    expect(formatPrice(PLANS.free)).toBe("$0");
    expect(formatPrice(PLANS.pro)).toBe("$179");
    expect(pricingHref()).toBe("/pricing");
    expect(pricingHref("growth")).toBe("/pricing?plan=growth");
  });
});
