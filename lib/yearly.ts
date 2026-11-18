// Yearly plans (Noah, 2026-11-17). Monthly plans sell at their full price
// (lib/plans.ts priceMonthly); a yearly plan costs what the launch price was
// each month, paid once for twelve months. The saving shown is always the
// difference from paying the full monthly price for a year, so every number
// on the page is a price someone can really pay. Client-safe and pure.
import { PLANS, type PlanId } from "./plans";

export type PaidPlanId = Exclude<PlanId, "free">;

/** What a yearly plan works out to each month, in USD. Stripe charges twelve times this once a year. */
export const YEARLY_PER_MONTH: Record<PaidPlanId, number> = {
  starter: 19.99,
  growth: 34.99,
  pro: 49.99,
  scale: 79.99,
};

const cents = (usd: number) => Math.round(usd * 100);
const fromCents = (c: number) => c / 100;
const yearOfMonthly = (plan: PaidPlanId) => cents(PLANS[plan].priceMonthly) * 12;
const yearOfYearly = (plan: PaidPlanId) => cents(YEARLY_PER_MONTH[plan]) * 12;

/** The yearly price Stripe charges, in USD ($239.88 for Starter). */
export const yearlyTotal = (plan: PaidPlanId): number => fromCents(yearOfYearly(plan));

/** The yearly price in cents, as Stripe states it (23988 for Starter). */
export const yearlyTotalCents = (plan: PaidPlanId): number => yearOfYearly(plan);

/** A year of the monthly plan, in USD. */
export const monthlyForAYear = (plan: PaidPlanId): number => fromCents(yearOfMonthly(plan));

/** Dollars saved over a year by paying yearly ($120 for Starter). Never below zero. */
export const yearlySaving = (plan: PaidPlanId): number => Math.max(0, fromCents(yearOfMonthly(plan) - yearOfYearly(plan)));

/** The saving as a whole percent, rounded down so it is never overstated (33 for Starter). */
export const yearlyPercent = (plan: PaidPlanId): number => {
  const year = yearOfMonthly(plan);
  return year > 0 ? Math.max(0, Math.floor(((year - yearOfYearly(plan)) * 100) / year)) : 0;
};

/** The largest saving across the plans, for "Save up to 37%" beside the switch. */
export const bestYearlyPercent = (plans: PaidPlanId[]): number => Math.max(0, ...plans.map(yearlyPercent));

/** "$120", "$239.88", "$1,439.88": whole dollars without cents. */
export const money = (n: number): string =>
  `$${Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const isPaidPlanId = (p: PlanId): p is PaidPlanId => p !== "free";
