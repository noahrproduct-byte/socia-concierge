// Launch prices (Noah, 2026-11-15). ENDED EARLY on November 17, 2026 (Noah): the
// launch prices became the yearly plans' monthly price (lib/yearly.ts) and the
// monthly plans moved to the full price. Everything below now reads "over", so
// the crossed-out prices and the countdown no longer show anywhere.
//
// Original: until the end of December 15, 2026
// (Central time, where SOCIA LLC is), each paid plan sells at its launch price
// (PLANS[plan].priceMonthly, what Stripe charges today) and the pricing shows
// the full price crossed out next to it, with a countdown to the end.
//
// This is only honest if the full price really starts on December 16: on that
// day new sign-ups pay FULL_PRICE (a new default price in Stripe and
// priceMonthly raised to match), while subscriptions started before then keep
// their launch price. The billing check (lib/billingCheck.ts) turns red once
// the launch is over and a plan still charges its launch price.
// After the end, nothing here shows any more. Client-safe.
import type { PlanId } from "./plans";

/** The first moment after the launch. Planned for December 16; it ended at midnight starting November 17, 2026, Central time. */
export const LAUNCH_ENDS_AT = Date.parse("2026-11-17T00:00:00-06:00");

/** How the end reads in copy. */
export const LAUNCH_END_TEXT = "December 15";
/** The day the full prices start. */
export const FULL_PRICE_FROM_TEXT = "December 16";
export const LAUNCH_END_LONG = "December 15, 2026 at 11:59 PM Central time";

/** The full monthly price from December 16, 2026, in USD. */
export const FULL_PRICE: Record<Exclude<PlanId, "free">, number> = {
  starter: 29.99,
  growth: 49.99,
  pro: 79.99,
  scale: 119.99,
};

export const launchOn = (now: number = Date.now()): boolean => now < LAUNCH_ENDS_AT;

/** The crossed-out full price for a plan while the launch runs, or null (Free, after the launch, or no real saving). */
export function launchFullPrice(plan: PlanId, launchPrice: number, now: number = Date.now()): number | null {
  if (plan === "free" || !launchOn(now)) return null;
  const full = FULL_PRICE[plan];
  return full > launchPrice ? full : null;
}

/** Days, hours, minutes and seconds left, all 0 once it has ended. */
export function timeLeft(now: number): { days: number; hours: number; minutes: number; seconds: number } {
  const s = Math.max(0, Math.floor((LAUNCH_ENDS_AT - now) / 1000));
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

export const usdText = (n: number) => `$${n}`;
