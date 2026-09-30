import { describe, it, expect } from "vitest";
import {
  PLANS, PLAN_ORDER, FEATURE_STATUS, FEATURE_LABEL, METER_LABEL, LIMIT_LABEL, METER_UNIT, LIMIT_UNIT, METER_PERIOD,
  HISTORY_ALL_RETAINED, PLATFORMS_PER_WORKSPACE, WORKSPACE_PLATFORMS,
  normalizePlan, isAtLeast, minPlanWithFeature, minPlanWithLimit, minPlanWithMeter, nextPlan, formatPrice, formatHistory, pricingHref,
  isAllHistory,
  type FeatureKey, type LimitKey, type MeterKey,
} from "./plans";
import { COMPARISON, comingSoonFor, includedFor } from "./pricingTable";

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

  it("matches the confirmed hard limits (2026-09-25)", () => {
    expect(PLAN_ORDER.map((p) => PLANS[p].limits.workspaces)).toEqual([1, 2, 5, 15]);
    expect(PLAN_ORDER.map((p) => PLANS[p].limits.competitors)).toEqual([2, 5, 15, 30]);
    expect(PLAN_ORDER.map((p) => PLANS[p].limits.team_members)).toEqual([1, 2, 5, 10]);
    expect(PLAN_ORDER.map((p) => PLANS[p].limits.analytics_history_days)).toEqual([30, 90, 365, HISTORY_ALL_RETAINED]);
  });

  it("matches the confirmed AI allowances", () => {
    expect(PLAN_ORDER.map((p) => PLANS[p].meters.ask_socia)).toEqual([10, 50, 250, 600]);
    expect(PLAN_ORDER.map((p) => PLANS[p].meters.content_studio)).toEqual([5, 30, 150, 400]);
    expect(PLAN_ORDER.map((p) => PLANS[p].meters.content_plan)).toEqual([0, 4, 12, 40]);
    expect(PLAN_ORDER.map((p) => PLANS[p].meters.content_ideas)).toEqual([3, 3, 3, 3]);
    expect(METER_PERIOD.content_ideas).toBe("week");
    expect(METER_PERIOD.ask_socia).toBe("month");
  });

  it("caps workspaces, never platforms: every workspace holds one account per platform", () => {
    expect(WORKSPACE_PLATFORMS).toEqual(["instagram", "facebook", "tiktok", "youtube"]);
    expect(PLATFORMS_PER_WORKSPACE).toBe(4);
    expect(LIMITS).not.toContain("connected_accounts");
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

  it("puts publishing on every plan and the deeper analytics on Starter", () => {
    expect(PLANS.free.features.scheduling).toBe(true);
    expect(PLANS.free.features.breakout_alerts).toBe(true);
    expect(PLANS.free.features.deeper_insights).toBe(false);
    expect(PLANS.free.features.content_plan).toBe(false);
    expect(PLANS.starter.features.deeper_insights).toBe(true);
    expect(PLANS.starter.features.posting_time_analysis).toBe(true);
    expect(PLANS.starter.features.content_plan).toBe(true);
    expect(PLANS.starter.features.team).toBe(true);
    expect(PLANS.starter.features.cross_platform_analytics).toBe(false);
    expect(PLANS.growth.features.cross_platform_analytics).toBe(true);
    expect(PLANS.growth.features.cross_brand_analytics).toBe(false);
    expect(PLANS.pro.features.cross_brand_analytics).toBe(true);
    expect(PLANS.pro.features.client_reports).toBe(true);
  });

  it("lists no feature that does not exist in the product as available", () => {
    // Everything marked available must be a thing the app really gates or renders today.
    const available = FEATURES.filter((k) => FEATURE_STATUS[k] === "available");
    expect(available.sort()).toEqual([
      "breakout_alerts", "client_reports", "competitor_alerts", "content_plan", "cross_platform_analytics",
      "custom_date_ranges", "deeper_insights", "growth_analysis", "monthly_summary", "niche_intelligence",
      "opportunity_alerts", "performance_change_alerts", "period_comparison", "platform_reports",
      "posting_time_analysis", "report_exports", "scheduling", "team", "trend_alerts", "weekly_summary",
    ].sort());
  });

  it("labels every key so the UI never renders a raw identifier", () => {
    for (const k of FEATURES) expect(FEATURE_LABEL[k]).toBeTruthy();
    for (const k of LIMITS) {
      expect(LIMIT_LABEL[k]).toBeTruthy();
      expect(LIMIT_UNIT[k].one).toBeTruthy();
      expect(LIMIT_UNIT[k].many).toBeTruthy();
    }
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
    expect(minPlanWithFeature("scheduling")).toBe("free");
    expect(minPlanWithFeature("deeper_insights")).toBe("starter");
    expect(minPlanWithFeature("cross_platform_analytics")).toBe("growth");
    expect(minPlanWithFeature("client_reports")).toBe("pro");
    expect(minPlanWithLimit("workspaces", 2)).toBe("starter");
    expect(minPlanWithLimit("workspaces", 15)).toBe("pro");
    expect(minPlanWithLimit("workspaces", 16)).toBeNull();
    expect(minPlanWithLimit("competitors", 6)).toBe("growth");
    expect(minPlanWithMeter("ask_socia", 10)).toBe("starter");
    expect(minPlanWithMeter("ask_socia", 600)).toBeNull();
  });

  it("steps up one plan at a time and stops at pro", () => {
    expect(nextPlan("free")).toBe("starter");
    expect(nextPlan("growth")).toBe("pro");
    expect(nextPlan("pro")).toBeNull();
  });

  it("formats prices, history and pricing links", () => {
    expect(formatPrice(PLANS.free)).toBe("$0");
    expect(formatPrice(PLANS.pro)).toBe("$179");
    expect(formatHistory(30)).toBe("30 days");
    expect(formatHistory(90)).toBe("90 days");
    expect(formatHistory(365)).toBe("1 year");
    expect(formatHistory(HISTORY_ALL_RETAINED)).toBe("All retained history");
    expect(isAllHistory(365)).toBe(false);
    expect(pricingHref()).toBe("/pricing");
    expect(pricingHref("growth")).toBe("/pricing?plan=growth");
  });
});

describe("comparison table", () => {
  it("never marks an unbuilt feature as included", () => {
    for (const cat of COMPARISON) for (const row of cat.rows) for (const p of PLAN_ORDER) {
      const cell = row.cells[p];
      if (cell.kind !== "yes") continue;
      // A "yes" must trace to a real feature or an always-on capability, never to a coming_soon key.
      const key = FEATURES.find((k) => FEATURE_LABEL[k] === row.label);
      if (key) expect(FEATURE_STATUS[key]).not.toBe("coming_soon");
    }
  });

  it("keeps included and coming-soon lists disjoint per plan", () => {
    for (const p of PLAN_ORDER) {
      const inc = includedFor(p), soon = comingSoonFor(p);
      for (const k of inc) expect(soon).not.toContain(k);
      for (const k of soon) expect(FEATURE_STATUS[k]).toBe("coming_soon");
    }
    expect(includedFor("free")).toContain("scheduling");
    expect(includedFor("free")).toContain("breakout_alerts");
    // Growth lists cross-platform performance alerts, which are not built yet.
    expect(comingSoonFor("growth")).toContain("cross_platform_alerts");
  });

  it("uses the spec's ten sections in order", () => {
    expect(COMPARISON.map((c) => c.category)).toEqual([
      "Workspaces & platforms", "Analytics", "SOCIA intelligence", "Content creation", "Competitors & trends",
      "Publishing", "Alerts", "Reports", "Team", "Support",
    ]);
  });
});
