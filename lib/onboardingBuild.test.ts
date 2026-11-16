import { describe, expect, it } from "vitest";
import { STAGES, buildReveal, feasibility, postsInLast, strongestPosts } from "./onboardingBuild";
import type { GrowthStrategy } from "./strategy";

const now = new Date("2026-11-15T12:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const post = (id: string, likes: number, days: number, o: Record<string, unknown> = {}) => ({ id, caption: `Post ${id} #tag\nsecond line`, permalink: `https://x/${id}`, thumbnail_url: `https://img/${id}.jpg`, media_type: "VIDEO", timestamp: ago(days), like_count: likes, comments_count: 0, ...o });
const strategy: GrowthStrategy = { v: 1, primary_objective: "Gain followers", secondary_objectives: [], audience: "Local families", pillars: [{ name: "The oven", why: "Your best posts show it." }, { name: "Regulars", why: "They get comments." }], frequency: { posts_per_week: 3, why: "You said you have 2 to 5 hours a week." }, experiments: [], priorities: ["Open on the food.", "Post three times a week.", "Reply to every comment.", "A fourth one."], milestones: [], based_on: ["25 Instagram posts", "Your goal"], generated_at: now.toISOString(), edited_at: null };

describe("the build's steps", () => {
  it("are the four real steps, in order", () => {
    expect(STAGES.map((s) => s.id)).toEqual(["accounts", "content", "niche", "strategy"]);
  });
  it("shows the strongest posts by their real numbers, and none without numbers", () => {
    const items = strongestPosts([post("a", 10, 3), post("b", 90, 9), post("c", 0, 1), post("d", 40, 20), post("e", 5, 2)]);
    expect(items.map((i) => i.href)).toEqual(["https://x/b", "https://x/d", "https://x/a"]);
    expect(items[0]).toMatchObject({ label: "Post b", note: "90 interactions", thumb: "https://img/b.jpg" });
    expect(strongestPosts([post("c", 0, 1)])).toEqual([]);
  });
  it("counts posts in a window", () => {
    expect(postsInLast([post("a", 1, 3), post("b", 1, 29), post("c", 1, 31), { id: "d" }], 30, now)).toBe(2);
  });
});

describe("how a target compares with the recent pace", () => {
  const base = { metric: "followers" as const, now: 2450, target: 10000, daysLeft: 90 };
  it("says in reach, ambitious or very ambitious from real daily numbers", () => {
    expect(feasibility({ ...base, target: 2800, gained: 100, gainedDays: 30 }).level).toBe("in_reach");
    expect(feasibility({ ...base, target: 3400, gained: 100, gainedDays: 30 }).level).toBe("ambitious");
    const far = feasibility({ ...base, gained: 100, gainedDays: 30 });
    expect(far.level).toBe("very_ambitious");
    expect(far.line).toContain("You need about 84 new followers a day");
    expect(far.line).toContain("you gained about 3.3 a day");
    expect(feasibility({ ...base, gained: -20, gainedDays: 30 }).level).toBe("very_ambitious");
  });
  it("says it can't tell rather than guess", () => {
    expect(feasibility({ ...base, gained: 40, gainedDays: 9 }).level).toBe("unknown");
    expect(feasibility({ ...base, gained: null, gainedDays: 0 }).level).toBe("unknown");
    expect(feasibility({ ...base, now: null, gained: 100, gainedDays: 30 }).level).toBe("unknown");
    expect(feasibility({ ...base, metric: "views_30d", gained: 100, gainedDays: 30 }).level).toBe("unknown");
  });
  it("never states a chance of success", () => {
    for (const g of [100, 900, 3000]) expect(feasibility({ ...base, gained: g, gainedDays: 30 }).line).not.toMatch(/%|chance|likely|will reach/i);
  });
});

describe("the reveal", () => {
  const input = { mainGoal: "followers" as const, goal: { kind: "primary" as const, metric: "followers" as const, platforms: ["instagram" as const], baseline: 2450, target: 10000, due_date: "2027-02-13" }, nowValues: { followers: { value: 2450, platforms: ["instagram" as const] }, views_30d: { value: 18400, platforms: ["instagram" as const] } }, strategy, gained: 100, gainedDays: 30, plan: "free" as const, competitors: 2, today: "2026-11-15" };
  it("is built from what was read and written", () => {
    const r = buildReveal(input);
    expect(r.target).toBe("10,000 followers");
    expect(r.goal.sentence).toBe("2,450 now, 10,000 in 90 days.");
    expect(r.start.map((x) => `${x.label}: ${x.value} (${x.where})`)).toEqual(["Followers or subscribers: 2,450 (Instagram)", "Views in the last 30 days: 18,400 (Instagram)"]);
    expect(r.priorities).toHaveLength(3);
    expect(r.week).toMatchObject({ posts: 3 });
    // Every tool is listed, worded with this strategy's own numbers and marked against the person's plan.
    const tools = r.tools.flatMap((g) => g.tools);
    expect(tools.length).toBeGreaterThan(15);
    expect(tools.find((t) => t.name === "Content Plan")!.what).toContain("Writes your 3 posts for the week");
    expect(tools.find((t) => t.name === "Analytics")!.what).toContain("10,000 followers");
    expect(tools.find((t) => t.name === "Animated videos")!.from).toBe("From Starter");
    expect(r.basedOn).toEqual(["25 Instagram posts", "Your goal"]);
  });
  it("leaves out what it doesn't have instead of filling it in", () => {
    const r = buildReveal({ ...input, goal: null, nowValues: {}, strategy: null });
    expect(r.target).toBeNull();
    expect(r.goal.sentence).toBeNull();
    expect(r.goal.feasibility).toBeNull();
    expect(r.start).toEqual([]);
    expect(r.priorities).toEqual([]);
    expect(r.week).toBeNull();
  });
});
