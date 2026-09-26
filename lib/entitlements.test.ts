import { describe, it, expect } from "vitest";
import { PLANS, HISTORY_ALL_RETAINED } from "./plans";
import {
  currentPeriod, currentWeekPeriod, currentPeriods, meterPeriod, sanitizeOverrides, mergeConfig, checkFeature, canUseFeature, getLimit, clampDays,
  canConnectAnother, canAddCompetitor, computeOverLimits, activeAccounts, activeByPlatform, workspacesInUse,
  type Entitlements, type ConnectedAccount,
} from "./entitlements";
import { featureError, limitError, usageError, isPlanError, formatResetDate } from "./planErrors";

const NOW = new Date("2026-09-25T12:00:00Z"); // a Friday

const ent = (plan: keyof typeof PLANS, over?: Parameters<typeof mergeConfig>[1]): Entitlements => {
  const periods = currentPeriods(NOW);
  return { userId: "u1", plan, config: mergeConfig(PLANS[plan], over), period: periods.month, periods, source: "profile" };
};

const acct = (platform: ConnectedAccount["platform"], id: string, extra: Partial<ConnectedAccount> = {}): ConnectedAccount => ({
  platform, id: `${platform}:${id}`, platformId: id, label: id, handle: null, avatar: null,
  status: "connected", suspended: false, current: true, ...extra,
});

describe("usage periods", () => {
  it("is the UTC calendar month with the reset on the first of next month", () => {
    expect(currentPeriod(new Date("2026-09-20T23:59:00Z"))).toEqual({ start: "2026-09-01", end: "2026-10-01" });
    expect(currentPeriod(new Date("2026-12-31T12:00:00Z"))).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });
  it("runs weekly meters Monday to Monday, UTC", () => {
    expect(currentWeekPeriod(new Date("2026-09-25T12:00:00Z"))).toEqual({ start: "2026-09-21", end: "2026-09-28" });
    expect(currentWeekPeriod(new Date("2026-09-21T00:00:00Z"))).toEqual({ start: "2026-09-21", end: "2026-09-28" });
    expect(currentWeekPeriod(new Date("2026-09-27T23:59:59Z"))).toEqual({ start: "2026-09-21", end: "2026-09-28" });
    expect(currentWeekPeriod(new Date("2026-09-28T00:00:00Z"))).toEqual({ start: "2026-09-28", end: "2026-10-05" });
  });
  it("picks the period a meter counts in", () => {
    expect(meterPeriod(ent("free"), "ask_socia")).toEqual({ start: "2026-09-01", end: "2026-10-01" });
    expect(meterPeriod(ent("free"), "content_ideas")).toEqual({ start: "2026-09-21", end: "2026-09-28" });
  });
  it("formats the reset date without inventing a year", () => {
    expect(formatResetDate("2026-10-01")).toBe("Oct 1");
    expect(formatResetDate("garbage")).toBe("garbage");
  });
});

describe("overrides", () => {
  it("keeps only known keys with well-formed values", () => {
    const o = sanitizeOverrides(
      { limits: { competitors: 40, bogus: 9, workspaces: -1 }, meters: { ask_socia: "lots" }, features: { client_reports: true, team: "yes" } },
      PLANS.pro,
    );
    expect(o).toEqual({ limits: { competitors: 40 }, features: { client_reports: true } });
    expect(sanitizeOverrides(null, PLANS.pro)).toEqual({});
    expect(sanitizeOverrides("nope", PLANS.pro)).toEqual({});
  });
  it("layers plan overrides under user overrides without touching the defaults", () => {
    const merged = mergeConfig(PLANS.starter, { limits: { competitors: 6 } }, { limits: { competitors: 7 }, meters: { ask_socia: 99 } });
    expect(merged.limits.competitors).toBe(7);
    expect(merged.meters.ask_socia).toBe(99);
    expect(merged.limits.workspaces).toBe(2);
    expect(PLANS.starter.limits.competitors).toBe(5);
  });
});

describe("feature checks", () => {
  it("is false for a built feature the plan lacks, with the plan that has it", () => {
    const r = checkFeature(ent("free"), "deeper_insights");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("feature_locked");
      expect(r.error.requiredPlan).toBe("starter");
      expect(r.error.error).toBe("What Changed, What's Working, What's Missing and What To Do Next is available on Starter.");
      expect(r.error.href).toBe("/pricing?plan=starter");
    }
    expect(canUseFeature(ent("starter"), "deeper_insights")).toBe(true);
  });
  it("puts publishing on Free", () => {
    expect(canUseFeature(ent("free"), "scheduling")).toBe(true);
  });
  it("is false for an unbuilt feature even on the top plan, and says coming soon", () => {
    const r = checkFeature(ent("pro"), "client_reports");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("coming_soon");
      expect(r.error.error).toBe("Client-ready reports is coming soon.");
    }
  });
  it("honours a database override that grants a feature", () => {
    expect(canUseFeature(ent("free", { features: { deeper_insights: true } }), "deeper_insights")).toBe(true);
  });
});

describe("limits and history", () => {
  it("reads limits from the merged config", () => {
    expect(getLimit(ent("growth"), "workspaces")).toBe(5);
    expect(getLimit(ent("growth", { limits: { workspaces: 8 } }), "workspaces")).toBe(8);
  });
  it("clamps analytics history to the plan window and leaves Pro unclamped", () => {
    expect(clampDays(ent("free"), 365)).toBe(30);
    expect(clampDays(ent("free"), 7)).toBe(7);
    expect(clampDays(ent("starter"), 365)).toBe(90);
    expect(clampDays(ent("growth"), 365)).toBe(365);
    expect(clampDays(ent("pro"), 730)).toBe(730);
    expect(getLimit(ent("pro"), "analytics_history_days")).toBe(HISTORY_ALL_RETAINED);
  });
});

describe("connected accounts and workspaces", () => {
  it("counts per platform and derives workspaces in use from the busiest platform", () => {
    const list = [acct("instagram", "1"), acct("instagram", "2"), acct("youtube", "UC1"), acct("facebook", "p1", { suspended: true })];
    expect(activeAccounts(list)).toHaveLength(3);
    expect(activeByPlatform(list)).toEqual({ instagram: 2, facebook: 0, youtube: 1, tiktok: 0 });
    expect(workspacesInUse(list)).toBe(2);
    expect(workspacesInUse([])).toBe(0);
  });
  it("lets one workspace hold one account on every platform", () => {
    const list = [acct("instagram", "1"), acct("youtube", "UC1"), acct("tiktok", "t1")];
    expect(canConnectAnother(ent("free"), list, "facebook").ok).toBe(true);
  });
  it("blocks a second account on a platform once every workspace holds one", () => {
    const list = [acct("instagram", "1"), acct("youtube", "UC1")];
    const r = canConnectAnother(ent("free"), list, "instagram");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("limit_reached");
      expect(r.error.limit).toBe("workspaces");
      expect(r.error.error).toBe("Free includes 1 Brand Workspace. Each workspace holds one account on each of Instagram, Facebook, TikTok, YouTube.");
      expect(r.error.requiredPlan).toBe("starter");
      expect(r.error.cta).toBe("View Starter");
    }
    expect(canConnectAnother(ent("starter"), list, "instagram").ok).toBe(true);
  });
  it("never blocks reconnecting an account that is already connected", () => {
    const list = [acct("instagram", "1")];
    expect(canConnectAnother(ent("free"), list, "instagram", "1").ok).toBe(true);
    expect(canConnectAnother(ent("free"), list, "instagram", "2").ok).toBe(false);
  });
  it("points Pro at custom pricing when even Pro is full", () => {
    const list = Array.from({ length: 15 }, (_, i) => acct("instagram", String(i)));
    const r = canConnectAnother(ent("pro"), list, "instagram");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.requiredPlan).toBeNull();
      expect(r.error.cta).toBe("Contact us for custom pricing");
      expect(r.error.href).toBe("/pricing#custom");
    }
  });
});

describe("competitors", () => {
  it("applies the plan cap and says how many are in use", () => {
    expect(canAddCompetitor(ent("starter"), 4).ok).toBe(true);
    const r = canAddCompetitor(ent("starter"), 5);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.error).toBe("You are using 5 of 5 competitors on Starter.");
  });
});

describe("over-limit state after a downgrade", () => {
  it("reports which platforms exceed the workspaces limit, and nothing when within limits", () => {
    const by = { instagram: 3, facebook: 1, youtube: 2, tiktok: 0 };
    expect(computeOverLimits(ent("free"), by, 8)).toEqual({
      accounts: { active: 3, limit: 1, excess: 3, byPlatform: { instagram: 3, youtube: 2 } },
      competitors: { active: 8, limit: 2, excess: 6 },
    });
    expect(computeOverLimits(ent("growth"), by, 8)).toEqual({ accounts: null, competitors: null });
  });
  it("never infers an over-limit state from a count it could not read", () => {
    expect(computeOverLimits(ent("free"), null, null)).toEqual({ accounts: null, competitors: null });
    expect(computeOverLimits(ent("free"), { instagram: 2, facebook: 0, youtube: 0, tiktok: 0 }, null)).toEqual({
      accounts: { active: 2, limit: 1, excess: 1, byPlatform: { instagram: 2 } },
      competitors: null,
    });
  });
});

describe("plan errors", () => {
  it("writes the usage sentence from the spec and carries the reset date", () => {
    const e = usageError("starter", "content_studio", 30, 30, "2026-10-01");
    expect(e.error).toBe("You've used all 30 Content Studio analyses included in Starter this month.");
    expect(e.cta).toBe("Upgrade to Growth");
    expect(e.resetsOn).toBe("2026-10-01");
    expect(isPlanError(e)).toBe(true);
  });
  it("says 'this week' for a weekly meter", () => {
    expect(usageError("free", "content_ideas", 3, 3, "2026-09-28").error).toBe("You've used all 3 content ideas included in Free this week.");
  });
  it("explains a zero allowance as not included rather than used up", () => {
    expect(usageError("free", "content_plan", 0, 0, "2026-10-01").error).toBe("Content Plans is not included in Free.");
  });
  it("keeps unknown usage as null, never zero", () => {
    expect(usageError("growth", "ask_socia", 250, null, "2026-10-01").used).toBeNull();
    expect(limitError("growth", "competitors", 15, null).used).toBeUndefined();
    expect(limitError("growth", "competitors", 15, null).error).toBe("Growth includes 15 competitors.");
  });
  it("never uses an em dash", () => {
    const all = [
      featureError("free", "deeper_insights").error, featureError("pro", "approval_workflow").error,
      limitError("starter", "workspaces", 2).error, limitError("starter", "team_members", 2, 2).error,
      usageError("starter", "ask_socia", 50, 50, "2026-10-01").error,
    ];
    for (const s of all) expect(s.includes("—")).toBe(false);
  });
});
