import { describe, expect, it } from "vitest";
import { assessBilling, readyToSell, SAAS_TAX_CODE, WEBHOOK_EVENTS, type BillingFacts, type PriceFacts } from "./billingCheck";

const price = (plan: PriceFacts["plan"], cents: number, extra: Partial<PriceFacts> = {}): PriceFacts => ({
  plan, configured: "product", error: null,
  price: { id: `price_${plan}`, active: true, currency: "usd", unitAmount: cents, interval: "month", taxBehavior: "exclusive" },
  product: { id: `prod_${plan}`, name: plan, active: true, taxCode: SAAS_TAX_CODE },
  ...extra,
});
const good: BillingFacts = {
  keyMode: "test", checkoutSwitch: true, webhookSecretSet: true, appUrl: "https://sociaos.com",
  prices: [price("starter", 1900), price("growth", 4900), price("pro", 9900)],
  webhooks: [{ url: "https://sociaos.com/api/stripe/webhook", status: "enabled", events: WEBHOOK_EVENTS }],
  portal: { active: true, isDefault: true, updateEnabled: true, productIds: ["prod_starter", "prod_growth", "prod_pro"], updateProration: "none", cancelEnabled: true, cancelMode: "at_period_end", cardUpdate: true },
  errors: [],
};
const fixes = (f: BillingFacts) => assessBilling(f).filter((l) => l.state === "fix").map((l) => l.id);

describe("is Stripe ready to take a payment", () => {
  it("passes a complete setup", () => {
    expect(fixes(good)).toEqual([]);
    expect(readyToSell(assessBilling(good))).toBe(true);
  });
  it("flags the checkout switch, a wrong amount and a missing tax code", () => {
    const f = { ...good, checkoutSwitch: false, prices: [price("starter", 1500), price("growth", 4900, { product: { id: "prod_growth", name: "Growth", active: true, taxCode: null } }), price("pro", 9900)] };
    expect(fixes(f)).toEqual(["switch", "price-starter", "tax-growth"]);
    expect(assessBilling(f).find((l) => l.id === "price-starter")?.detail).toContain("$15");
  });
  it("flags a webhook missing events and a portal that cancels at once", () => {
    const f = { ...good, webhooks: [{ url: "https://sociaos.com/api/stripe/webhook/", status: "enabled", events: ["checkout.session.completed"] }], portal: { ...good.portal!, cancelMode: "immediately" } };
    expect(fixes(f)).toEqual(["webhook", "portal"]);
  });
  it("flags no webhook for this site and no portal", () => {
    expect(fixes({ ...good, webhooks: [{ url: "https://old.example.com/api/stripe/webhook", status: "enabled", events: ["*"] }], portal: null })).toEqual(["webhook", "portal"]);
  });
});
