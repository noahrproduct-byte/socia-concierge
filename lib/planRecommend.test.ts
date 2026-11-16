import { describe, expect, it } from "vitest";
import { PLANS } from "./plans";
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
  it("is the cheapest plan that covers it, never the biggest by default", () => {
    const r = rec();
    expect(r.plan).toBe("starter");
    expect(creditsOnSale("starter")).toBeGreaterThanOrEqual(r.credits);
    expect(creditsOnSale("free")).toBeLessThan(r.credits);
    expect(r.reasons[0]).toContain("3 posts a week");
    expect(r.reasons[0]).toContain(`Starter includes ${creditsOnSale("starter").toLocaleString("en-US")}`);
    expect(r.short).toBe(false);
    expect(rec({ postsPerWeek: 7 }).plan).toBe("starter");
  });
  it("says Free is enough when it is", () => {
    const tiny = recommendPlan(need({ postsPerWeek: 0 }), [...ORDER]);
    expect(tiny.plan).toBe("free");
    expect(tiny.reasons.at(-1)).toBe("Free covers this to start. You can move up when you need more.");
  });
  it("moves up only for a real need, and names it", () => {
    const comp = rec({ competitors: PLANS.starter.limits.competitors + 1 });
    expect(comp.plan).toBe("growth");
    expect(comp.reasons.join(" ")).toContain(`Growth allows ${PLANS.growth.limits.competitors} per brand`);
    const brands = rec({ brands: PLANS.growth.limits.workspaces + 1 });
    expect(brands.plan).toBe("pro");
    expect(brands.reasons.join(" ")).toContain(`Pro includes ${PLANS.pro.limits.workspaces} Brand Workspaces`);
    expect(rec({ competitors: 2 }).plan).toBe("starter");
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
