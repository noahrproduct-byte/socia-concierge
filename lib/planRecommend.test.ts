import { describe, expect, it } from "vitest";
import { FEATURE_MIN_PLAN, PLANS } from "./plans";
import { actionCredits, creditsOnSale } from "./credits/config";
import { creditsForStrategy, recommendPlan, type PlanNeed } from "./planRecommend";

const need = (o: Partial<PlanNeed> = {}): PlanNeed => ({ postsPerWeek: 3, competitors: 0, platforms: 1, brands: 1, mainGoal: "followers", ...o });
const ORDER = ["free", "starter", "growth", "pro"] as const;
const rec = (o: Partial<PlanNeed> = {}) => recommendPlan(need(o), [...ORDER]);

describe("what a strategy uses", () => {
  it("is a weekly plan plus a caption and a rating for each post", () => {
    const week = actionCredits("content_plan") + 3 * (actionCredits("content_generation") + actionCredits("content_studio"));
    expect(creditsForStrategy(3)).toBe(Math.ceil(week * (52 / 12)));
    expect(creditsForStrategy(0)).toBe(Math.ceil(actionCredits("content_plan") * (52 / 12)));
    expect(creditsForStrategy(5)).toBeGreaterThan(creditsForStrategy(3));
  });
});

describe("the plan recommended for a strategy", () => {
  it("is Growth, with reasons that are true of this strategy (Noah, 2026-11-16)", () => {
    const r = rec();
    expect(r.plan).toBe("growth");
    // The cheapest plan that covers the posting is still worked out and kept.
    expect(r.fit).toBe("starter");
    expect(creditsOnSale("starter")).toBeGreaterThanOrEqual(r.credits);
    expect(r.reasons[0]).toContain("3 posts a week");
    expect(r.reasons[0]).toContain(`Growth includes ${creditsOnSale("growth").toLocaleString("en-US")}, so there is room left`);
    expect(r.reasons.join(" ")).toContain("Growth adds AI comment replies you approve before they send");
    expect(r.reasons.join(" ")).toContain(`It tracks ${PLANS.growth.limits.competitors} competitors per brand and runs ${PLANS.growth.limits.workspaces} brands.`);
    // Nothing says a smaller plan couldn't cover it, and nothing is promised.
    expect(r.reasons.join(" ")).not.toMatch(/need|only plan|guarantee|will grow|most popular/i);
    expect(r.short).toBe(false);
    expect(rec({ postsPerWeek: 7 }).plan).toBe("growth");
    expect(rec({ postsPerWeek: 0 }).plan).toBe("growth");
  });
  it("only names features Growth really starts on", () => {
    const text = rec().reasons.join(" ");
    for (const [key, words] of [["comment_replies", "AI comment replies"], ["daily_recommendations", "one recommendation each day"], ["trend_alerts", "trend alerts"], ["competitor_alerts", "competitor alerts"]] as const) {
      expect(text.includes(words)).toBe(FEATURE_MIN_PLAN[key] === "growth");
    }
  });
  it("falls back to the cheapest fit when Growth isn't on sale", () => {
    const tiny = recommendPlan(need({ postsPerWeek: 0 }), ["free", "starter"]);
    expect(tiny.plan).toBe("free");
    expect(tiny.reasons.at(-1)).toBe("Free covers this to start. You can move up when you need more.");
  });
  it("moves above Growth only for a real need, and names it", () => {
    const comp = rec({ competitors: PLANS.starter.limits.competitors + 1 });
    expect(comp.plan).toBe("growth");
    expect(comp.reasons.join(" ")).toContain(`Growth allows ${PLANS.growth.limits.competitors} per brand`);
    const brands = rec({ brands: PLANS.growth.limits.workspaces + 1 });
    expect(brands.plan).toBe("pro");
    expect(brands.fit).toBe("pro");
    expect(brands.reasons.join(" ")).toContain(`Pro includes ${PLANS.pro.limits.workspaces} Brand Workspaces`);
    expect(brands.reasons.join(" ")).not.toContain("Pro adds");
  });
  it("follows the goal and the platforms to the first plan with the feature", () => {
    const e = rec({ mainGoal: "engagement" });
    expect(PLANS[e.plan].features.comment_replies).toBe(true);
    expect(e.reasons.join(" ")).toContain("AI comment replies");
    const two = rec({ platforms: 2 });
    expect(PLANS[two.plan].features.cross_platform_analytics).toBe(true);
  });
  it("says so when no plan covers the credits, instead of pretending one does", () => {
    const r = rec({ postsPerWeek: 21 });
    if (creditsOnSale("pro") < r.credits) {
      expect(r.short).toBe(true);
      expect(r.plan).toBe("pro");
      expect(r.reasons[0]).toContain("more than any plan includes");
    } else {
      expect(r.short).toBe(false);
    }
  });
  it("never recommends a plan that isn't on sale", () => {
    expect(ORDER).toContain(rec({ brands: 99, competitors: 99 }).plan);
  });
});
