import { describe, it, expect } from "vitest";
import { PLANS } from "./plans";
import {
  currentPeriod, sanitizeOverrides, mergeConfig, checkFeature, canUseFeature, getLimit, clampDays,
  canConnectAnother, canAddCompetitor, computeOverLimits, activeAccounts,
  type Entitlements, type ConnectedAccount,
} from "./entitlements";
import { featureError, limitError, usageError, isPlanError, formatResetDate } from "./planErrors";

const ent = (plan: keyof typeof PLANS, over?: Parameters<typeof mergeConfig>[1]): Entitlements => ({
  userId: "u1",
  plan,
  config: mergeConfig(PLANS[plan], over),
  period: { start: "2026-09-01", end: "2026-10-01" },
  source: "profile",
});

const acct = (platform: ConnectedAccount["platform"], id: string, extra: Partial<ConnectedAccount> = {}): ConnectedAccount => ({
  platform, id: `${platform}:${id}`, platformId: id, label: id, handle: null, avatar: null,
  status: "connected", suspended: false, current: true, ...extra,
});

describe("usage periods", () => {
  it("is the UTC calendar month with the reset on the first of next month", () => {
    expect(currentPeriod(new Date("2026-09-20T23:59:00Z"))).toEqual({ start: "2026-09-01", end: "2026-10-01" });
    expect(currentPeriod(new Date("2026-12-31T12:00:00Z"))).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });
  it("formats the reset date without inventing a year", () => {
    expect(formatResetDate("2026-10-01")).toBe("Oct 1");
    expect(formatResetDate("garbage")).toBe("garbage");
  });
});

describe("overrides", () => {
  it("keeps only known keys with well-formed values", () => {
    const o = sanitizeOverrides(
      { limits: { competitors: 40, bogus: 9, connected_accounts: -1 }, meters: { ask_socia: "lots" }, features: { api_access: true, team: "yes" } },
      PLANS.pro,
    );
    expect(o).toEqual({ limits: { competitors: 40 }, features: { api_access: true } });
    expect(sanitizeOverrides(null, PLANS.pro)).toEqual({});
    expect(sanitizeOverrides("nope", PLANS.pro)).toEqual({});
  });
  it("layers plan overrides under user overrides without touching the defaults", () => {
    const merged = mergeConfig(PLANS.starter, { limits: { competitors: 5 } }, { limits: { competitors: 7 }, meters: { ask_socia: 99 } });
    expect(merged.limits.competitors).toBe(7);
    expect(merged.meters.ask_socia).toBe(99);
    expect(merged.limits.connected_accounts).toBe(1);
    expect(PLANS.starter.limits.competitors).toBe(3);
  });
});

describe("feature checks", () => {
  it("is false for a built feature the plan lacks, with the plan that has it", () => {
    const r = checkFeature(ent("free"), "scheduling");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("feature_locked");
      expect(r.error.requiredPlan).toBe("starter");
      expect(r.error.error).toBe("Scheduling and publishing is available on Starter.");
      expect(r.error.href).toBe("/pricing?plan=starter");
    }
    expect(canUseFeature(ent("starter"), "scheduling")).toBe(true);
  });
  it("is false for an unbuilt feature even on the top plan, and says coming soon", () => {
    const r = checkFeature(ent("pro"), "white_label_reports");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("coming_soon");
      expect(r.error.error).toBe("White-label reports is coming soon.");
    }
  });
  it("honours a database override that grants a feature", () => {
    expect(canUseFeature(ent("free", { features: { scheduling: true } }), "scheduling")).toBe(true);
  });
});

describe("limits and history", () => {
  it("reads limits from the merged config", () => {
    expect(getLimit(ent("growth"), "connected_accounts")).toBe(5);
    expect(getLimit(ent("growth", { limits: { connected_accounts: 8 } }), "connected_accounts")).toBe(8);
  });
  it("clamps analytics history for Free to 30 days and leaves paid alone", () => {
    expect(clampDays(ent("free"), 365)).toBe(30);
    expect(clampDays(ent("free"), 7)).toBe(7);
    expect(clampDays(ent("starter"), 365)).toBe(365);
  });
});

describe("connected accounts", () => {
  it("counts every platform, ignores paused accounts, and blocks the next one at the cap", () => {
    const list = [acct("instagram", "1"), acct("youtube", "UC1"), acct("facebook", "p1", { suspended: true })];
    expect(activeAccounts(list)).toHaveLength(2);
    const r = canConnectAnother(ent("starter"), list, "facebook");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("limit_reached");
      expect(r.error.error).toBe("Starter includes 1 connected account.");
      expect(r.error.requiredPlan).toBe("growth");
      expect(r.error.cta).toBe("View Growth");
    }
    expect(canConnectAnother(ent("growth"), list, "facebook").ok).toBe(true);
  });
  it("never blocks reconnecting an account that is already connected", () => {
    const list = [acct("instagram", "1")];
    expect(canConnectAnother(ent("free"), list, "instagram", "1").ok).toBe(true);
    expect(canConnectAnother(ent("free"), list, "instagram", "2").ok).toBe(false);
  });
  it("points Pro at custom pricing when even Pro is full", () => {
    const list = Array.from({ length: 15 }, (_, i) => acct("instagram", String(i)));
    const r = canConnectAnother(ent("pro"), list, "youtube");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.requiredPlan).toBeNull();
      expect(r.error.cta).toBe("Contact us for custom pricing");
      expect(r.error.href).toBe("/pricing#custom");
    }
  });
});

describe("competitors", () => {
  it("applies the plan cap", () => {
    expect(canAddCompetitor(ent("starter"), 2).ok).toBe(true);
    const r = canAddCompetitor(ent("starter"), 3);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.error).toBe("Starter includes 3 competitors.");
  });
});

describe("over-limit state after a downgrade", () => {
  it("reports how many to choose, and nothing when within limits", () => {
    expect(computeOverLimits(ent("starter"), 4, 8)).toEqual({
      accounts: { active: 4, limit: 1, excess: 3 },
      competitors: { active: 8, limit: 3, excess: 5 },
    });
    expect(computeOverLimits(ent("growth"), 4, 8)).toEqual({ accounts: null, competitors: null });
  });
  it("never infers an over-limit state from a count it could not read", () => {
    expect(computeOverLimits(ent("free"), null, null)).toEqual({ accounts: null, competitors: null });
    expect(computeOverLimits(ent("free"), 3, null)).toEqual({ accounts: { active: 3, limit: 1, excess: 2 }, competitors: null });
  });
});

describe("plan errors", () => {
  it("writes the usage sentence from the spec and carries the reset date", () => {
    const e = usageError("starter", "content_studio", 30, 30, "2026-10-01");
    expect(e.error).toBe("You've used all 30 Content Studio analyses included in Starter this billing period.");
    expect(e.cta).toBe("Upgrade to Growth");
    expect(e.resetsOn).toBe("2026-10-01");
    expect(isPlanError(e)).toBe(true);
  });
  it("explains a zero allowance as not included rather than used up", () => {
    expect(usageError("free", "content_plan", 0, 0, "2026-10-01").error).toBe("Content Plans is not included in Free.");
  });
  it("keeps unknown usage as null, never zero", () => {
    expect(usageError("growth", "ask_socia", 250, null, "2026-10-01").used).toBeNull();
    expect(limitError("growth", "competitors", 10, null).used).toBeUndefined();
  });
  it("never uses an em dash", () => {
    const all = [
      featureError("free", "scheduling").error, featureError("pro", "api_access").error,
      limitError("starter", "connected_accounts", 1).error, usageError("starter", "ask_socia", 50, 50, "2026-10-01").error,
    ];
    for (const s of all) expect(s.includes("—")).toBe(false);
  });
});
