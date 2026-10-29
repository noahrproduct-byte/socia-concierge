import { describe, it, expect } from "vitest";
import { goalProgress, goalsSummary, growthLines, mergeGrowth, normalizeGoal, normalizeGrowth, type Goal } from "./growth";

const TODAY = "2026-10-29";

describe("normalizeGrowth", () => {
  it("keeps known keys and option ids, trims text, drops the rest", () => {
    const g = normalizeGrowth({
      account_type: "business",
      focus: "  Wood-fired   pizza  ",
      business: { offer: "Pizza and catering", customer_action: "book", service_area: "teleport" },
      audience: { who: "Families nearby", where: "local" },
      resources: { equipment: ["phone", "drone", "phone"], editing: "basic" },
      secret: "x",
    });
    expect(g).toEqual({
      account_type: "business",
      focus: "Wood-fired pizza",
      business: { offer: "Pizza and catering", customer_action: "book" },
      audience: { who: "Families nearby", where: "local" },
      resources: { equipment: ["phone"], editing: "basic" },
    });
  });

  it("returns an empty profile for junk, never a guess", () => {
    expect(normalizeGrowth(null)).toEqual({});
    expect(normalizeGrowth({ account_type: "spaceship", business: {} })).toEqual({});
  });
});

describe("mergeGrowth", () => {
  it("merges one section deep so saving one step keeps the others", () => {
    const merged = mergeGrowth({ account_type: "creator", audience: { who: "Runners", where: "global" } }, { audience: { wants: "Training plans" } });
    expect(merged).toEqual({ account_type: "creator", audience: { who: "Runners", where: "global", wants: "Training plans" } });
  });
});

describe("growthLines", () => {
  it("states only what the person said", () => {
    expect(growthLines({ account_type: "business", business: { customer_action: "visit" } })).toEqual(["Account type: Business", "What a customer should do: Visit in person"]);
    expect(growthLines(undefined)).toEqual([]);
  });
});

describe("normalizeGoal", () => {
  it("accepts a measured goal and keeps only platforms SOCIA can measure it on", () => {
    const r = normalizeGoal({ metric: "views_30d", target: "20,000", platforms: ["instagram", "tiktok"], due_date: "2027-01-31" }, TODAY);
    expect(r).toEqual({ goal: { kind: "primary", metric: "views_30d", platforms: ["instagram"], baseline: null, target: 20000, due_date: "2027-01-31", current_value: null } });
  });

  it("refuses a measured goal with nowhere to measure it", () => {
    expect(normalizeGoal({ metric: "engagement_rate", target: 4, platforms: ["tiktok"] }, TODAY)).toEqual({ error: "Choose where to measure it: Instagram." });
  });

  it("gives a reported goal no platforms and keeps the person's number", () => {
    const r = normalizeGoal({ metric: "bookings", target: 40, platforms: ["instagram"], current_value: 12, kind: "secondary" }, TODAY);
    expect(r).toMatchObject({ goal: { kind: "secondary", platforms: [], current_value: 12 } });
  });

  it("refuses bad targets and dates", () => {
    expect(normalizeGoal({ metric: "followers", target: 0, platforms: ["instagram"] }, TODAY)).toEqual({ error: "Set a target above zero." });
    expect(normalizeGoal({ metric: "engagement_rate", target: 140, platforms: ["instagram"] }, TODAY)).toMatchObject({ error: expect.stringMatching(/percentage/) });
    expect(normalizeGoal({ metric: "followers", target: 10, platforms: ["instagram"], due_date: "2026-10-01" }, TODAY)).toEqual({ error: "Pick a date after today." });
    expect(normalizeGoal({ metric: "followers", target: 10, platforms: ["instagram"], due_date: "soon" }, TODAY)).toEqual({ error: "That date isn't valid." });
    expect(normalizeGoal({ metric: "virality", target: 10 }, TODAY)).toEqual({ error: "Choose what you want to grow." });
  });
});

const goal = (over: Partial<Goal> = {}): Goal => ({ kind: "primary", metric: "followers", platforms: ["instagram"], baseline: 1000, target: 2000, due_date: "2026-12-31", ...over });

describe("goalsSummary", () => {
  it("writes the goals as the text existing readers use", () => {
    const s = goalsSummary([goal(), goal({ kind: "secondary", metric: "bookings", platforms: [], baseline: null, target: 40, due_date: null })]);
    expect(s).toBe("Main goal: Followers or subscribers on Instagram: 1,000 to 2,000 by Dec 31, 2026. Also: Bookings: target 40.");
  });

  it("is null when nothing is active", () => {
    expect(goalsSummary([goal({ status: "dropped" })])).toBeNull();
  });
});

describe("goalProgress", () => {
  const NOW = new Date("2026-10-29T12:00:00Z");

  it("measures from the recorded starting point", () => {
    const p = goalProgress(goal(), 1250, NOW);
    expect(p.share).toBe(0.25);
    expect(p.remaining).toBe(750);
    expect(p.daysLeft).toBe(64);
    expect(p.reached).toBe(false);
  });

  it("says why progress can't be shown instead of showing zero", () => {
    expect(goalProgress(goal(), null, NOW)).toMatchObject({ share: null, missing: "No current reading from the connected account yet." });
    expect(goalProgress(goal({ metric: "sales", platforms: [] }), null, NOW).missing).toMatch(/Add your latest number/);
    expect(goalProgress(goal({ baseline: null }), 1500, NOW)).toMatchObject({ share: null, remaining: 500 });
  });

  it("marks a reached target", () => {
    expect(goalProgress(goal(), 2100, NOW)).toMatchObject({ reached: true, remaining: 0 });
  });
});
