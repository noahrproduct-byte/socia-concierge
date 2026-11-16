// Which plan fits a strategy (Noah, 2026-11-15: "Recommended for your goal").
// Deterministic and explainable: the cheapest plan on sale that covers what
// the strategy needs, with each reason said in a sentence the person can
// check against the plan's own numbers. It never picks a bigger plan than the
// needs call for, and it says so when Free is enough. Pure and browser-safe.
import { FEATURE_MIN_PLAN, PLANS, SALE_ORDER, planRank, type PlanId } from "./plans";
import { actionCredits, creditsOnSale } from "./credits/config";
import type { MainGoalId } from "./growth";

/** Weeks in a month, for turning a weekly strategy into a month of credits. */
const WEEKS = 52 / 12;

export type PlanNeed = {
  /** Posts a week in the strategy. */
  postsPerWeek: number;
  /** Competitors tracked for the brand now. */
  competitors: number;
  /** Platforms connected now. */
  platforms: number;
  /** Brands this person runs. */
  brands: number;
  mainGoal: MainGoalId | null | undefined;
};

/**
 * AI credits a month that following the strategy uses: one Content Plan a
 * week, and for each post one caption and one video rating. It is what the
 * plan asks for at a minimum, not everything a person could do.
 */
export function creditsForStrategy(postsPerWeek: number): number {
  const posts = Math.max(0, Math.min(21, Math.round(postsPerWeek)));
  const week = actionCredits("content_plan") + posts * (actionCredits("content_generation") + actionCredits("content_studio"));
  return Math.ceil(week * WEEKS);
}

export type Recommendation = {
  plan: PlanId;
  /** Why this plan, each a sentence built from the plan's own numbers. */
  reasons: string[];
  /** Credits a month the strategy uses. */
  credits: number;
  /** Nothing on sale covers the strategy's credits: the top plan is named and the gap is said. */
  short: boolean;
};

const max = (a: PlanId, b: PlanId): PlanId => (planRank(a) >= planRank(b) ? a : b);

/** The cheapest plan in `order` that covers the need, and why. */
export function recommendPlan(need: PlanNeed, order: PlanId[] = SALE_ORDER): Recommendation {
  const credits = creditsForStrategy(need.postsPerWeek);
  const posts = Math.max(0, Math.round(need.postsPerWeek));
  const first = (ok: (p: PlanId) => boolean): PlanId | null => order.find(ok) ?? null;
  const top = order[order.length - 1];

  const byCredits = first((p) => creditsOnSale(p) >= credits);
  const byCompetitors = first((p) => PLANS[p].limits.competitors >= need.competitors) ?? top;
  const byBrands = first((p) => PLANS[p].limits.workspaces >= Math.max(1, need.brands)) ?? top;
  // Replying to comments is where an engagement goal is worked on; reading platforms side by side needs two of them.
  const byGoal: PlanId = need.mainGoal === "engagement" ? FEATURE_MIN_PLAN.comment_replies : order[0];
  const byPlatforms: PlanId = need.platforms >= 2 ? FEATURE_MIN_PLAN.cross_platform_analytics : order[0];

  let plan = [byCredits ?? top, byCompetitors, byBrands, byGoal, byPlatforms].reduce(max, order[0]);
  if (!order.includes(plan)) plan = top;
  const cfg = PLANS[plan];
  const n = (v: number) => v.toLocaleString("en-US");

  const reasons: string[] = [];
  reasons.push(
    byCredits
      ? `At ${posts} ${posts === 1 ? "post" : "posts"} a week, a weekly plan plus a caption and a rating for each post use about ${n(credits)} AI credits a month. ${cfg.name} includes ${n(creditsOnSale(plan))}.`
      : `At ${posts} posts a week you would use about ${n(credits)} AI credits a month. That is more than any plan includes (${cfg.name} has ${n(creditsOnSale(plan))}), so you would add credits when you need them.`,
  );
  if (planRank(byCompetitors) === planRank(plan) && need.competitors > PLANS[order[0]].limits.competitors) {
    reasons.push(`You track ${need.competitors} competitors. ${cfg.name} allows ${cfg.limits.competitors} per brand.`);
  }
  if (planRank(byBrands) === planRank(plan) && need.brands > PLANS[order[0]].limits.workspaces) {
    reasons.push(`You run ${need.brands} brands. ${cfg.name} includes ${cfg.limits.workspaces} Brand Workspaces.`);
  }
  if (planRank(byGoal) === planRank(plan) && need.mainGoal === "engagement" && plan !== order[0]) {
    reasons.push(`Your goal is engagement. ${cfg.name} is the first plan with AI comment replies, which you approve before they send.`);
  }
  if (planRank(byPlatforms) === planRank(plan) && need.platforms >= 2 && plan !== order[0]) {
    reasons.push(`You connected ${need.platforms} platforms. ${cfg.name} is the first plan that compares them side by side.`);
  }
  if (plan === order[0]) reasons.push("Free covers this to start. You can move up when you need more.");
  return { plan, reasons, credits, short: !byCredits };
}
