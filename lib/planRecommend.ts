// Which plan SOCIA recommends at the end of onboarding. Noah, 2026-11-16:
// "always recommend growth plan". So the recommendation is Growth, and it
// moves up to a bigger plan only when the brand already needs more than
// Growth holds (more brands or competitors than it allows). The reasons stay
// checkable: each is a sentence built from the strategy and the plan's own
// numbers, and none says a smaller plan couldn't cover the posting when it
// could. `fit` keeps the cheapest plan that covers the strategy, so the rule
// is still visible in the data. Pure and browser-safe.
import { FEATURE_MIN_PLAN, PLANS, SALE_ORDER, planRank, type FeatureKey, type PlanId } from "./plans";
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

/** The plan SOCIA recommends unless the brand needs a bigger one. */
export const RECOMMENDED: PlanId = "growth";

/** What the recommended plan adds over the ones below it, said when it is recommended above the fit. */
const ADDS: [FeatureKey, string][] = [
  ["comment_replies", "AI comment replies you approve before they send"],
  ["daily_recommendations", "one recommendation each day"],
  ["trend_alerts", "trend alerts"],
  ["competitor_alerts", "competitor alerts"],
];

export type Recommendation = {
  plan: PlanId;
  /** The cheapest plan on sale that covers the strategy on its own. */
  fit: PlanId;
  /** Why this plan, each a sentence built from the plan's own numbers. */
  reasons: string[];
  /** Credits a month the strategy uses. */
  credits: number;
  /** Nothing on sale covers the strategy's credits: the top plan is named and the gap is said. */
  short: boolean;
};

const max = (a: PlanId, b: PlanId): PlanId => (planRank(a) >= planRank(b) ? a : b);

/** The plan to recommend from `order`, and why. */
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

  let fit = [byCredits ?? top, byCompetitors, byBrands, byGoal, byPlatforms].reduce(max, order[0]);
  if (!order.includes(fit)) fit = top;
  // Growth, unless what the brand already has needs a bigger plan.
  const plan = order.includes(RECOMMENDED) ? max(fit, RECOMMENDED) : fit;
  const raised = planRank(plan) > planRank(fit);
  const cfg = PLANS[plan];
  const n = (v: number) => v.toLocaleString("en-US");

  const reasons: string[] = [];
  reasons.push(
    byCredits
      ? `At ${posts} ${posts === 1 ? "post" : "posts"} a week, a weekly plan plus a caption and a rating for each post use about ${n(credits)} AI credits a month. ${cfg.name} includes ${n(creditsOnSale(plan))}${raised && creditsOnSale(plan) > credits ? ", so there is room left for animated videos, voiceovers and the Clipper" : ""}.`
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
  if (raised) {
    const engagement = need.mainGoal === "engagement";
    const adds = ADDS.filter(([k]) => FEATURE_MIN_PLAN[k] === plan && !(engagement && k === "comment_replies")).map(([, words]) => words);
    if (adds.length) reasons.push(`${cfg.name} adds ${adds.length > 1 ? `${adds.slice(0, -1).join(", ")} and ${adds[adds.length - 1]}` : adds[0]}.`);
    reasons.push(`It tracks ${cfg.limits.competitors} competitors per brand and runs ${cfg.limits.workspaces} brands.`);
  }
  if (plan === order[0]) reasons.push("Free covers this to start. You can move up when you need more.");
  return { plan, fit, reasons, credits, short: !byCredits };
}
