import { describe, it, expect, beforeAll } from "vitest";
import type Stripe from "stripe";
import { stateFromSubscription, hasLiveSubscription, trialEligible, type BillingInfo } from "./billing";
import { planForPrice, priceIdFor, pricesConfigured } from "./stripe";

// Short names for two plans, the long name for the third: both must work.
const PRICES = {
  STRIPE_PRICE_STARTER: "price_starter_m",
  STRIPE_PRICE_STARTER_ANNUAL: "price_starter_y",
  STRIPE_PRICE_GROWTH_MONTHLY: "price_growth_m",
  STRIPE_PRICE_GROWTH_ANNUAL: "price_growth_y",
  STRIPE_PRICE_PRO: "price_pro_m",
  STRIPE_PRICE_PRO_ANNUAL: "price_pro_y",
};
beforeAll(() => Object.assign(process.env, PRICES));

const DAY = 86400;
const now = 1_790_000_000;

function sub(over: Record<string, unknown> = {}, item: Record<string, unknown> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    cancel_at: null,
    cancel_at_period_end: false,
    trial_end: null,
    metadata: {},
    items: { data: [{ id: "si_1", current_period_end: now + 20 * DAY, price: { id: "price_growth_m", recurring: { interval: "month" } }, ...item }] },
    ...over,
  } as unknown as Stripe.Subscription;
}

describe("price mapping", () => {
  it("maps each configured price to its plan and interval, and nothing else", () => {
    expect(planForPrice("price_growth_y")).toEqual({ plan: "growth", interval: "year" });
    expect(planForPrice("price_starter_m")).toEqual({ plan: "starter", interval: "month" });
    expect(planForPrice("price_unknown")).toBeNull();
    expect(planForPrice(null)).toBeNull();
    expect(priceIdFor("pro", "year")).toBe("price_pro_y");
    expect(pricesConfigured()).toBe(true);
  });
});

describe("stateFromSubscription", () => {
  it("derives the plan from the live price, with the renewal date from the item", () => {
    const s = stateFromSubscription(sub());
    expect(s.plan).toBe("growth");
    expect(s.interval).toBe("month");
    expect(s.status).toBe("active");
    expect(s.currentPeriodEnd).toBe(new Date((now + 20 * DAY) * 1000).toISOString());
    expect(s.cancelAt).toBeNull();
    expect(s.customerId).toBe("cus_1");
  });

  it("falls back to the subscription-level period end on older API shapes", () => {
    const s = stateFromSubscription(sub({ current_period_end: now + 5 * DAY }, { current_period_end: undefined }));
    expect(s.currentPeriodEnd).toBe(new Date((now + 5 * DAY) * 1000).toISOString());
  });

  it("keeps the plan while past due; a trial keeps its end date", () => {
    expect(stateFromSubscription(sub({ status: "past_due" })).plan).toBe("growth");
    const t = stateFromSubscription(sub({ status: "trialing", trial_end: now + 7 * DAY }));
    expect(t.plan).toBe("growth");
    expect(t.trialEnd).toBe(new Date((now + 7 * DAY) * 1000).toISOString());
  });

  it("means Free once the subscription has ended, with no cancellation pending", () => {
    for (const status of ["canceled", "unpaid", "incomplete_expired", "paused"]) {
      const s = stateFromSubscription(sub({ status, cancel_at_period_end: true }));
      expect(s.plan).toBe("free");
      expect(s.cancelAt).toBeNull();
    }
  });

  it("reports a scheduled cancellation at the period end, or at Stripe's explicit cancel_at", () => {
    const atEnd = stateFromSubscription(sub({ cancel_at_period_end: true }));
    expect(atEnd.plan).toBe("growth");
    expect(atEnd.cancelAt).toBe(atEnd.currentPeriodEnd);
    const explicit = stateFromSubscription(sub({ cancel_at: now + 3 * DAY }));
    expect(explicit.cancelAt).toBe(new Date((now + 3 * DAY) * 1000).toISOString());
  });

  it("leaves the plan alone for a price SOCIA does not sell", () => {
    const s = stateFromSubscription(sub({}, { price: { id: "price_mystery", recurring: { interval: "year" } } }));
    expect(s.plan).toBeNull();
    expect(s.interval).toBe("year");
  });
});

describe("billing info helpers", () => {
  const base: BillingInfo = { plan: "free", status: null, interval: null, currentPeriodEnd: null, cancelAt: null, trialEnd: null, hasCustomer: false, hasSubscription: false };
  it("offers the trial once, and only to someone without a subscription", () => {
    expect(trialEligible(base)).toBe(true);
    expect(trialEligible({ ...base, trialEnd: "2026-01-01T00:00:00.000Z" })).toBe(false);
    expect(trialEligible({ ...base, hasSubscription: true })).toBe(false);
  });
  it("treats trialing, active and past_due as live; canceled as not", () => {
    expect(hasLiveSubscription({ ...base, hasSubscription: true, status: "trialing" })).toBe(true);
    expect(hasLiveSubscription({ ...base, hasSubscription: true, status: "past_due" })).toBe(true);
    expect(hasLiveSubscription({ ...base, hasSubscription: true, status: "canceled" })).toBe(false);
    expect(hasLiveSubscription(base)).toBe(false);
  });
});
