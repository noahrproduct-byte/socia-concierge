// Is SOCIA's Stripe set up so a person can actually pay? The rules here take
// plain facts read from Stripe (lib/billingCheckLoad.ts) and say, line by
// line, what is right and what to fix. Nothing secret is read or returned:
// the key's mode comes from its prefix, and ids are Stripe object ids. Pure.

import { PLANS, type PlanId } from "./plans";

export type CheckState = "ok" | "fix" | "info";
export type CheckLine = { id: string; state: CheckState; label: string; detail: string };

export type PriceFacts = {
  plan: Exclude<PlanId, "free">;
  /** what the environment holds: a price, a product, or nothing */
  configured: "price" | "product" | "missing";
  /** the price checkout would charge; null when none was found */
  price: { id: string; active: boolean; currency: string; unitAmount: number | null; interval: string | null; taxBehavior: string | null } | null;
  product: { id: string; name: string; active: boolean; taxCode: string | null } | null;
  /** a Stripe error reading it, in Stripe's own words */
  error: string | null;
};

export type BillingFacts = {
  keyMode: "test" | "live" | "missing";
  checkoutSwitch: boolean;
  webhookSecretSet: boolean;
  appUrl: string;
  prices: PriceFacts[];
  webhooks: { url: string; status: string; events: string[] }[] | null;
  portal: { active: boolean; isDefault: boolean; updateEnabled: boolean; productIds: string[]; updateProration: string | null; cancelEnabled: boolean; cancelMode: string | null; cardUpdate: boolean } | null;
  /** Active promotion codes (what people type at checkout) and their coupon; null when they couldn't be read. */
  promos?: PromoFacts[] | null;
  /** errors reading the webhook or portal lists */
  errors: string[];
};

export type PromoFacts = {
  code: string;
  percentOff: number | null;
  amountOff: number | null;
  duration: string;
  durationMonths: number | null;
  /** the code's own end, else the coupon's (unix seconds) */
  expiresAt: number | null;
  /** the code's own cap, else the coupon's */
  maxRedemptions: number | null;
  timesRedeemed: number;
  firstTimeOnly: boolean;
  couponValid: boolean;
  /** products the coupon is limited to; empty = every product */
  appliesTo: string[];
};

export const WEBHOOK_EVENTS = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];
/** Stripe Managed Payments needs a tax code on each product; this is SaaS for business use. */
export const SAAS_TAX_CODE = "txcd_10103001";

const usd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

export function assessBilling(f: BillingFacts): CheckLine[] {
  const out: CheckLine[] = [];
  const line = (id: string, state: CheckState, label: string, detail: string) => out.push({ id, state, label, detail });

  line("key", f.keyMode === "missing" ? "fix" : "info", "Stripe key",
    f.keyMode === "missing" ? "STRIPE_SECRET_KEY is not set in Vercel." : f.keyMode === "test" ? "Test mode (sandbox): payments use test cards; no real money moves." : "Live mode: real cards are charged.");
  line("switch", f.checkoutSwitch ? "ok" : "fix", "Checkout switched on",
    f.checkoutSwitch ? "STRIPE_CHECKOUT_ENABLED is true." : "Add STRIPE_CHECKOUT_ENABLED = true in Vercel (Production), then redeploy. Until then the plan buttons say Contact us.");
  line("whsecret", f.webhookSecretSet ? "ok" : "fix", "Webhook signing secret",
    f.webhookSecretSet ? "STRIPE_WEBHOOK_SECRET is set." : "Add STRIPE_WEBHOOK_SECRET (the endpoint's signing secret) in Vercel.");

  for (const p of f.prices) {
    const name = PLANS[p.plan].name;
    const want = Math.round(PLANS[p.plan].priceMonthly * 100);
    const id = `price-${p.plan}`;
    if (p.configured === "missing") { line(id, "fix", `${name} price`, `No STRIPE_PRICE_${p.plan.toUpperCase()} in Vercel.`); continue; }
    if (p.error) { line(id, "fix", `${name} price`, `Stripe said: ${p.error}`); continue; }
    if (!p.price) { line(id, "fix", `${name} price`, "The product has no active monthly price. Add one in Stripe and make it the default."); continue; }
    const problems: string[] = [];
    if (!p.price.active) problems.push("the price is archived");
    if (p.price.interval !== "month") problems.push(`it bills every ${p.price.interval ?? "one time"}, not monthly`);
    if (p.price.currency !== "usd") problems.push(`it is in ${p.price.currency.toUpperCase()}, not USD`);
    if (p.price.unitAmount !== want) problems.push(`it charges ${p.price.unitAmount == null ? "a custom amount" : usd(p.price.unitAmount)}, but SOCIA's pricing page says ${usd(want)}`);
    if (p.product && !p.product.active) problems.push("the product is archived");
    line(id, problems.length ? "fix" : "ok", `${name} price`, problems.length ? `Fix in Stripe: ${problems.join("; ")}.` : `${usd(want)} a month (${p.price.id}).`);
    const tax = p.product?.taxCode ?? null;
    line(`tax-${p.plan}`, tax ? "ok" : "fix", `${name} tax code`,
      tax ? `Product tax code ${tax}${tax === SAAS_TAX_CODE ? " (SaaS, business use)" : ""}.` : `Managed Payments needs a tax code on the product. Set ${SAAS_TAX_CODE} (Software as a service, business use) on "${p.product?.name ?? name}".`);
  }

  const target = `${f.appUrl.replace(/\/$/, "")}/api/stripe/webhook`;
  if (f.webhooks == null) line("webhook", "fix", "Webhook endpoint", "SOCIA couldn't list the webhook endpoints with this key.");
  else {
    const ep = f.webhooks.find((w) => w.url.replace(/\/$/, "") === target);
    if (!ep) line("webhook", "fix", "Webhook endpoint", `No endpoint for ${target}. Add one in Stripe (Developers, Webhooks) in the same mode as the key.`);
    else {
      const missing = ep.events.includes("*") ? [] : WEBHOOK_EVENTS.filter((e) => !ep.events.includes(e));
      const problems = [ep.status !== "enabled" ? `it is ${ep.status}` : null, missing.length ? `it doesn't send ${missing.join(", ")}` : null].filter(Boolean);
      line("webhook", problems.length ? "fix" : "ok", "Webhook endpoint", problems.length ? `Fix the endpoint for ${target}: ${problems.join("; ")}.` : `${target} receives all four events.`);
    }
  }

  if (!f.portal) line("portal", "fix", "Customer Portal", "No active default Customer Portal configuration. Set it up in Stripe (Settings, Billing, Customer portal), or Manage billing won't open.");
  else {
    const sold = f.prices.map((p) => p.product?.id).filter((x): x is string => Boolean(x));
    const notSwitchable = sold.filter((id) => !f.portal!.productIds.includes(id));
    const problems = [
      !f.portal.updateEnabled ? "switching plans is off" : notSwitchable.length ? `${notSwitchable.length} of the plan products can't be switched to` : null,
      !f.portal.cancelEnabled ? "cancelling is off" : f.portal.cancelMode !== "at_period_end" ? "cancelling ends the plan at once instead of at the period end" : null,
      !f.portal.cardUpdate ? "updating the card is off" : null,
    ].filter(Boolean);
    line("portal", problems.length ? "fix" : "ok", "Customer Portal", problems.length ? `Fix in Stripe: ${problems.join("; ")}.` : "Switch plans, update the card and cancel at period end are all on.");
    if (f.portal.updateEnabled && f.portal.updateProration && f.portal.updateProration !== "none") {
      line("proration", "info", "Plan switch proration", `Set to "${f.portal.updateProration}". Managed Payments can't bill one-off proration invoices; if a switch fails, set proration to none.`);
    }
  }
  if (f.promos !== undefined) {
    if (f.promos == null) line("promos", "info", "Promo codes", "SOCIA couldn't list the promotion codes with this key.");
    else if (!f.promos.length) line("promos", "info", "Promo codes", "No active promotion code. Customers pay the full price.");
    const sold = f.prices.map((p) => p.product?.id).filter((x): x is string => Boolean(x));
    for (const pc of f.promos ?? []) {
      const off = pc.percentOff != null ? `${pc.percentOff}% off` : pc.amountOff != null ? `${usd(pc.amountOff)} off` : "a discount";
      const how = pc.duration === "once" ? "the first month" : pc.duration === "forever" ? "every month, forever" : `${pc.durationMonths ?? "?"} months`;
      const until = pc.expiresAt ? `, until ${new Date(pc.expiresAt * 1000).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short" })}` : ", with no end date";
      const cap = pc.maxRedemptions != null ? `, ${pc.timesRedeemed} of ${pc.maxRedemptions} used` : `, used ${pc.timesRedeemed} times`;
      const problems = [
        !pc.couponValid ? "its coupon is no longer valid" : null,
        pc.maxRedemptions === 1 ? "it can be used only once in total, by one customer" : null,
        pc.appliesTo.length && sold.some((id) => !pc.appliesTo.includes(id)) ? "its coupon doesn't apply to every plan" : null,
      ].filter(Boolean);
      line(`promo-${pc.code.toLowerCase()}`, problems.length ? "fix" : "ok", `Promo code ${pc.code}`,
        `${off} ${how}${until}${cap}${pc.firstTimeOnly ? ", new customers only" : ""}.${problems.length ? ` Fix: ${problems.join("; ")}.` : ""}`);
    }
  }
  for (const e of f.errors) line(`err-${out.length}`, "fix", "Stripe error", e);
  return out;
}

export const readyToSell = (lines: CheckLine[]): boolean => lines.every((l) => l.state !== "fix");
