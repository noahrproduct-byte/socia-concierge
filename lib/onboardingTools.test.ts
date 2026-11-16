import { describe, expect, it } from "vitest";
import { FEATURE_MIN_PLAN, PLANS } from "./plans";
import { startsOn, toolCount, toolGroups } from "./onboardingTools";

const base = { plan: "free" as const, posts: 5, target: "5,000 followers", competitors: 3 };

describe("what you get in SOCIA, on the strategy reveal", () => {
  it("marks each tool with the plan it really starts on", () => {
    expect(startsOn({ feature: "comment_replies" })).toBe(FEATURE_MIN_PLAN.comment_replies);
    // A metered tool starts on the first plan that gives any of it.
    expect(PLANS.free.meters.animated_videos).toBe(0);
    expect(startsOn({ meter: "animated_videos" })).toBe("starter");
    expect(startsOn({ meter: "content_studio" })).toBe("free");
    const tools = toolGroups(base).flatMap((g) => g.tools);
    const by = (name: string) => tools.find((t) => t.name === name)!;
    expect(by("Content Plan")).toMatchObject({ included: true, from: "Included on your plan" });
    expect(by("Animated videos")).toMatchObject({ included: false, from: "From Starter" });
    expect(by("Comment replies")).toMatchObject({ included: false, from: `From ${PLANS[FEATURE_MIN_PLAN.comment_replies].name}` });
  });
  it("never says a plan includes what it doesn't", () => {
    for (const plan of ["free", "starter", "growth", "pro"] as const) {
      for (const t of toolGroups({ ...base, plan }).flatMap((g) => g.tools)) {
        if (t.included) expect(t.from).toBe("Included on your plan");
        else expect(t.from).toMatch(/^From (Starter|Growth|Pro|Scale)$/);
      }
    }
    // Everything listed is included by the top plan on this list.
    expect(toolGroups({ ...base, plan: "pro" }).flatMap((g) => g.tools).every((t) => t.included)).toBe(true);
  });
  it("uses the person's own numbers where there are some", () => {
    const text = toolGroups(base).flatMap((g) => g.tools).map((t) => t.what).join(" ");
    expect(text).toContain("Writes your 5 posts for the week");
    expect(text).toContain("your target of 5,000 followers");
    expect(text).toContain("Watches your 3 competitors");
    const plain = toolGroups({ plan: "free", posts: null, target: null, competitors: 0 }).flatMap((g) => g.tools).map((t) => t.what).join(" ");
    expect(plain).toContain("Writes your posts for the week");
    expect(plain).toContain("the goal you just set");
    expect(plain).not.toMatch(/\d/);
  });
  it("counts what is listed and what the plan includes", () => {
    const g = toolGroups(base);
    const c = toolCount(g);
    expect(c.all).toBe(g.flatMap((x) => x.tools).length);
    expect(c.included).toBeGreaterThan(0);
    expect(c.included).toBeLessThan(c.all);
    expect(g.flatMap((x) => x.tools).every((t) => !/—|guarantee|viral/i.test(t.what))).toBe(true);
  });
});
