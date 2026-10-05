// Stripe: the server-side client and the mapping between SOCIA plans and the
// Prices Noah created in the Stripe Dashboard. Server only — never import this
// from a client component.
//
// Environment (Vercel; test-mode values first, live values when launching):
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//   STRIPE_PRICE_STARTER, STRIPE_PRICE_GROWTH, STRIPE_PRICE_PRO   (the monthly
//   Price id, or the Product id — the monthly price is then looked up; the
//   longer STRIPE_PRICE_<PLAN>_MONTHLY names are accepted too)
//   (optional, only if yearly prices are ever created: STRIPE_PRICE_<PLAN>_ANNUAL)
import Stripe from "stripe";
import { PLAN_ORDER, type BillingInterval, type PlanId } from "@/lib/plans";

let client: Stripe | null = null;

/** The Stripe client, or null when the secret key is not configured. */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (!client) client = new Stripe(key);
  return client;
}

export type PaidPlan = Exclude<PlanId, "free">;

// Each price can be set under either name; the first one found wins.
const PRICE_ENV: Record<PaidPlan, Record<BillingInterval, string[]>> = {
  starter: { month: ["STRIPE_PRICE_STARTER", "STRIPE_PRICE_STARTER_MONTHLY"], year: ["STRIPE_PRICE_STARTER_ANNUAL"] },
  growth: { month: ["STRIPE_PRICE_GROWTH", "STRIPE_PRICE_GROWTH_MONTHLY"], year: ["STRIPE_PRICE_GROWTH_ANNUAL"] },
  pro: { month: ["STRIPE_PRICE_PRO", "STRIPE_PRICE_PRO_MONTHLY"], year: ["STRIPE_PRICE_PRO_ANNUAL"] },
};

export const isPaidPlan = (p: string): p is PaidPlan => p === "starter" || p === "growth" || p === "pro";
export const isBillingInterval = (i: string): i is BillingInterval => i === "month" || i === "year";

/** The configured id for a plan and interval: a Price (price_…) or, as pasted
 *  from the product page, a Product (prod_…). null when not configured. */
export function priceIdFor(plan: PaidPlan, interval: BillingInterval): string | null {
  for (const name of PRICE_ENV[plan][interval]) {
    const v = process.env[name]?.trim();
    if (v) return v;
  }
  return null;
}

export const isProductId = (id: string | null | undefined): boolean => Boolean(id && id.startsWith("prod_"));

const resolved = new Map<string, string>();

/** The Price to charge for a plan: the configured price, or the product's
 *  active recurring price for that interval (looked up once, then remembered). */
export async function resolvePriceId(stripe: Stripe, plan: PaidPlan, interval: BillingInterval): Promise<string | null> {
  const configured = priceIdFor(plan, interval);
  if (!configured) return null;
  if (!isProductId(configured)) return configured;
  const key = `${configured}:${interval}`;
  const hit = resolved.get(key);
  if (hit) return hit;
  const prices = await stripe.prices.list({ product: configured, active: true, type: "recurring", limit: 20 });
  const match = prices.data.find((p) => p.recurring?.interval === interval) ?? null;
  if (!match) return null;
  resolved.set(key, match.id);
  return match.id;
}

/** The plan and interval a subscription item stands for, matched by its Price
 *  id or by its Product id (whichever the environment holds). null when SOCIA
 *  does not sell it. */
export function planForPrice(priceId: string | null | undefined, productId?: string | null): { plan: PaidPlan; interval: BillingInterval } | null {
  if (!priceId && !productId) return null;
  for (const plan of PLAN_ORDER) {
    if (!isPaidPlan(plan)) continue;
    for (const interval of ["month", "year"] as const) {
      const configured = priceIdFor(plan, interval);
      if (!configured) continue;
      if (configured === priceId || (productId && configured === productId)) return { plan, interval };
    }
  }
  return null;
}

/** Every price the pricing page sells (the monthly ones) is configured. */
export function pricesConfigured(): boolean {
  return (["starter", "growth", "pro"] as const).every((p) => priceIdFor(p, "month"));
}
