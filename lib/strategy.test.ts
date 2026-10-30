import { describe, it, expect } from "vitest";
import { applyEdits, factLines, normalizeStrategy, postsCap, primaryObjective, strategyLines, type StrategyFacts } from "./strategy";
import { buildUserPrompt } from "./prompt";

const now = new Date("2026-10-30T12:00:00Z");
const raw = {
  secondary_objectives: ["Grow saves", "Reach locals"],
  audience: "Families within 5 miles.",
  pillars: [{ name: "Behind the oven", why: "Your Reels from the kitchen did 1.8x your median." }, { name: "", why: "dropped" }],
  posts_per_week: 6,
  frequency_why: "You post about 3 a week now.",
  experiments: [{ hypothesis: "Staff faces may lift saves", test: "Two staff Reels over two weeks", measure: "Saves against your median" }],
  priorities: ["Friday specials", "Reply to comments", "Tag the location"],
  milestones: [{ label: "2,000 followers", by: "2026-12-31", measure: "Instagram followers" }, { label: "Bad date", by: "soon", measure: "x" }],
};

describe("the strategy is held to the person's time and their own goal", () => {
  it("caps posts a week by the hours they said they have, and says so", () => {
    const s = normalizeStrategy(raw, { growth: { resources: { hours_per_week: "2to5" } }, goalLine: null, basedOn: [], now });
    expect(postsCap({ resources: { hours_per_week: "2to5" } })).toBe(3);
    expect(s.frequency.posts_per_week).toBe(3);
    expect(s.frequency.why).toMatch(/^Held to 3 a week/);
    expect(s.frequency.why).not.toMatch(/about 3 a week now/);
  });

  it("keeps the model's pace when it fits, and uses the person's goal as the primary objective", () => {
    const s = normalizeStrategy(raw, { growth: { main_goal: "followers", resources: { hours_per_week: "gt10" } }, goalLine: "Followers or subscribers to 2,000 by 2026-12-31 (Instagram)", basedOn: ["Your Growth Profile"], now });
    expect(s.frequency.posts_per_week).toBe(6);
    expect(s.primary_objective).toBe("Followers or subscribers to 2,000 by 2026-12-31 (Instagram)");
    expect(primaryObjective({ main_goal: "followers" }, null)).toBe("Gain followers");
    expect(primaryObjective(null, null)).toMatch(/Set a main goal/);
  });

  it("drops empty pillars and checks milestone dates", () => {
    const s = normalizeStrategy(raw, { growth: null, goalLine: null, basedOn: [], now });
    expect(s.pillars.map((p) => p.name)).toEqual(["Behind the oven"]);
    expect(s.milestones.map((m) => m.by)).toEqual(["2026-12-31", null]);
    expect(s.edited_at).toBeNull();
  });
});

describe("edits", () => {
  it("are bounded, stamped, and may set a pace above SOCIA's suggestion", () => {
    const s = normalizeStrategy(raw, { growth: { resources: { hours_per_week: "lt2" } }, goalLine: null, basedOn: [], now });
    const e = applyEdits(s, { frequency: { posts_per_week: 40, why: "My call" }, priorities: ["One", "", "Two"] }, now);
    expect(e.frequency.posts_per_week).toBe(21);
    expect(e.priorities).toEqual(["One", "Two"]);
    expect(e.edited_at).toBe(now.toISOString());
    expect(e.generated_at).toBe(s.generated_at);
  });
});

describe("what it rests on", () => {
  it("lists only the facts that exist", () => {
    const f: StrategyFacts = { growth: { main_goal: "views" }, niche: "Food", brandName: null, pace: 3.5, works: [], findings: ["A finding. Observed."], goals: [], themes: [] };
    const { basedOn, prompt } = factLines(f);
    expect(basedOn).toEqual(["Your Growth Profile", "Your current pace: about 3.5 posts a week", "1 SOCIA finding"]);
    expect(prompt).toMatch(/at most 7/);
  });
});

describe("the plan writer builds the week from it", () => {
  it("adds the strategy and its pace to the plan prompt", () => {
    const s = normalizeStrategy(raw, { growth: { resources: { hours_per_week: "2to5" } }, goalLine: "Gain followers", basedOn: [], now });
    expect(strategyLines(s)).toMatch(/Content pillars:\n- Behind the oven/);
    const prompt = buildUserPrompt({ competitors: "", recentPosts: "", audienceWindows: "", brandVoice: "", clientHandle: "salvos", goal: "", niche: "Pizza", platform: "instagram" } as never, { strategy: s });
    expect(prompt).toMatch(/# The account's growth strategy/);
    expect(prompt).toMatch(/Plan 3 posts this week/);
  });
});
