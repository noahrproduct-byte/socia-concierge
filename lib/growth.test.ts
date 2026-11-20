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

describe("who makes the videos", () => {
  it("keeps the choice and the kinds of video Claude may make, and drops unknown ones", () => {
    const g = normalizeGrowth({ resources: { video_maker: "claude", claude_styles: ["animated", "voiceover", "deepfake"] } });
    expect(g.resources).toEqual({ video_maker: "claude", claude_styles: ["animated", "voiceover"] });
    expect(normalizeGrowth({ resources: { video_maker: "robot" } }).resources).toBeUndefined();
  });

  it("reaches the plan writer as plain lines", () => {
    const lines = growthLines({ resources: { video_maker: "mix", claude_styles: ["kinetic_text"] } });
    expect(lines).toContain("Who makes the videos: A mix");
    expect(lines).toContain("Videos their Claude may make: Animated text");
  });
});

describe("far goals", async () => {
  const { farGoal, farGoalNote, farGoalForAi } = await import("./growth");
  const now = new Date("2026-11-19T10:00:00Z");
  it("flags the new account's goals from 2026-11-19 and gives a first step", () => {
    const views = { metric: "views_30d" as const, baseline: 3, current_value: null, target: 1_000_000, due_date: "2026-12-19" };
    const subs = { metric: "followers" as const, baseline: 13, current_value: null, target: 1_000_000_000, due_date: "2026-12-19" };
    expect(farGoal(views, now)).toEqual({ multiple: 333_333, days: 30, firstStep: 50_000 });
    expect(farGoal(subs, now)?.firstStep).toBe(5_000);
    expect(farGoalNote(views, now)).toBe("That's about 333,333 times where you are now, in 30 days. SOCIA will plan toward a first step of 50,000 and keep your target as the end goal.");
    expect(farGoalForAi(subs, now)).toContain("first step of 5,000");
  });
  it("leaves reachable goals alone", () => {
    expect(farGoal({ metric: "followers", baseline: 2400, current_value: null, target: 6000, due_date: "2027-02-17" }, now)).toBeNull();
    expect(farGoal({ metric: "views_30d", baseline: 20_000, current_value: null, target: 200_000, due_date: "2026-12-19" }, now)).toBeNull();
    expect(farGoalForAi({ metric: "followers", baseline: 100, current_value: null, target: 200, due_date: "2026-12-19" }, now)).toBe("");
  });
  it("says nothing without a starting point, a date, or for other goals", () => {
    expect(farGoal({ metric: "followers", baseline: null, current_value: null, target: 1e9, due_date: "2026-12-19" }, now)).toBeNull();
    expect(farGoal({ metric: "followers", baseline: 10, current_value: null, target: 1e9, due_date: null }, now)).toBeNull();
    expect(farGoal({ metric: "sales", baseline: 1, current_value: null, target: 1e9, due_date: "2026-12-19" }, now)).toBeNull();
  });
});
