// Reads, from Stripe, the facts lib/billingCheck.ts judges: each plan's price
// and product, the webhook endpoints and the Customer Portal configuration.
// Read-only; returns no secret. Server only.
import type Stripe from "stripe";
import { getStripe, priceIdFor, isProductId, resolvePriceId, type PaidPlan } from "./stripe";
import { checkoutAvailable } from "./plans";
import type { BillingFacts, PriceFacts, PromoFacts } from "./billingCheck";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

function keyMode(): BillingFacts["keyMode"] {
  const k = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (!k) return "missing";
  return /^(sk|rk)_live_/.test(k) ? "live" : "test";
}

async function priceFacts(stripe: Stripe, plan: PaidPlan): Promise<PriceFacts> {
  const configured = priceIdFor(plan, "month");
  if (!configured) return { plan, configured: "missing", price: null, product: null, error: null };
  try {
    const priceId = await resolvePriceId(stripe, plan, "month");
    const price = priceId ? await stripe.prices.retrieve(priceId, { expand: ["product"] }) : null;
    const prod = price && typeof price.product === "object" && !("deleted" in price.product && price.product.deleted) ? (price.product as Stripe.Product)
      : isProductId(configured) ? await stripe.products.retrieve(configured) : null;
    const taxCode = prod?.tax_code == null ? null : typeof prod.tax_code === "string" ? prod.tax_code : prod.tax_code.id;
    return {
      plan, configured: isProductId(configured) ? "product" : "price", error: null,
      price: price ? { id: price.id, active: price.active, currency: price.currency, unitAmount: price.unit_amount, interval: price.recurring?.interval ?? null, taxBehavior: price.tax_behavior ?? null } : null,
      product: prod ? { id: prod.id, name: prod.name, active: prod.active, taxCode } : null,
    };
  } catch (e) {
    return { plan, configured: isProductId(configured) ? "product" : "price", price: null, product: null, error: msg(e) };
  }
}

export async function loadBillingFacts(appUrl: string): Promise<BillingFacts> {
  const stripe = getStripe();
  const base: BillingFacts = {
    keyMode: keyMode(), checkoutSwitch: checkoutAvailable(), webhookSecretSet: Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()),
    appUrl, prices: [], webhooks: null, portal: null, errors: [],
  };
  if (!stripe) return base;
  const [prices, hooks, portal, promos] = await Promise.all([
    Promise.all((["starter", "growth", "pro"] as const).map((p) => priceFacts(stripe, p))),
    stripe.webhookEndpoints.list({ limit: 50 }).then((r) => r.data.map((w) => ({ url: w.url, status: w.status, events: w.enabled_events })), (e) => { base.errors.push(`Webhook endpoints: ${msg(e)}`); return null; }),
    stripe.billingPortal.configurations.list({ active: true, limit: 20 }).then((r) => {
      const c = r.data.find((x) => x.is_default) ?? null;
      if (!c) return null;
      const f = c.features;
      return {
        active: c.active, isDefault: c.is_default,
        updateEnabled: f.subscription_update.enabled, productIds: (f.subscription_update.products ?? []).map((p) => p.product),
        updateProration: f.subscription_update.proration_behavior ?? null,
        cancelEnabled: f.subscription_cancel.enabled, cancelMode: f.subscription_cancel.mode ?? null,
        cardUpdate: f.payment_method_update.enabled,
      };
    }, (e) => { base.errors.push(`Customer Portal: ${msg(e)}`); return null; }),
    stripe.promotionCodes.list({ active: true, limit: 20, expand: ["data.promotion.coupon"] }).then((r) => r.data.map((pc): PromoFacts => {
      const c = pc.promotion?.coupon && typeof pc.promotion.coupon === "object" ? pc.promotion.coupon : null;
      return {
        code: pc.code, percentOff: c?.percent_off ?? null, amountOff: c?.amount_off ?? null,
        duration: c?.duration ?? "unknown", durationMonths: c?.duration_in_months ?? null,
        expiresAt: pc.expires_at ?? c?.redeem_by ?? null,
        maxRedemptions: pc.max_redemptions ?? c?.max_redemptions ?? null,
        timesRedeemed: pc.times_redeemed, firstTimeOnly: Boolean(pc.restrictions?.first_time_transaction),
        couponValid: c?.valid ?? false, appliesTo: c?.applies_to?.products ?? [],
      };
    }), () => null),
  ]);
  return { ...base, prices, webhooks: hooks, portal, promos };
}
