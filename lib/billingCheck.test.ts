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
  prices: [price("starter", 2999), price("growth", 4999), price("pro", 7999)],
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
    const f = { ...good, checkoutSwitch: false, prices: [price("starter", 1500), price("growth", 4999, { product: { id: "prod_growth", name: "Growth", active: true, taxCode: null } }), price("pro", 7999)] };
    expect(fixes(f)).toEqual(["switch", "price-starter", "tax-growth"]);
    expect(assessBilling(f).find((l) => l.id === "price-starter")?.detail).toContain("$15");
  });
  it("flags a price that includes tax or doesn't say, since prices are shown before tax", () => {
    const withTax = (plan: PriceFacts["plan"], cents: number, taxBehavior: string | null) => price(plan, cents, { price: { id: `price_${plan}`, active: true, currency: "usd", unitAmount: cents, interval: "month", taxBehavior } });
    const f = { ...good, prices: [withTax("starter", 2999, "inclusive"), withTax("growth", 4999, null), price("pro", 7999)] };
    expect(fixes(f)).toEqual(["taxmode-starter", "taxmode-growth"]);
    expect(assessBilling(f).find((l) => l.id === "taxmode-starter")?.detail).toContain("add a new $29.99 monthly price");
    expect(assessBilling(good).find((l) => l.id === "taxmode-pro")?.detail).toContain("plus any sales tax");
  });
  it("says when yearly plans are not set up, and checks each yearly price once they are", () => {
    expect(assessBilling(good).find((l) => l.id === "yearly")).toMatchObject({ state: "info" });
    const y = (plan: PriceFacts["plan"], cents: number, extra: Partial<NonNullable<PriceFacts["price"]>> = {}): PriceFacts =>
      price(plan, cents, { price: { id: `price_${plan}_y`, active: true, currency: "usd", unitAmount: cents, interval: "year", taxBehavior: "exclusive", ...extra } });
    const right = { ...good, yearly: [y("starter", 23988), y("growth", 41988), y("pro", 59988), y("scale", 95988)] };
    expect(fixes(right)).toEqual([]);
    expect(assessBilling(right).find((l) => l.id === "yearly-pro")?.detail).toContain("$599.88 a year");
    const wrong = { ...good, yearly: [y("starter", 29990), y("growth", 41988, { interval: "month" }), y("pro", 59988, { taxBehavior: "inclusive" }), { plan: "scale" as const, configured: "missing" as const, price: null, product: null, error: null }] };
    expect(fixes(wrong)).toEqual(["yearly-starter", "yearly-growth", "yearly-pro", "yearly-scale"]);
    expect(assessBilling(wrong).find((l) => l.id === "yearly-starter")?.detail).toContain("$239.88 a year");
  });
  it("flags a webhook missing events and a portal that cancels at once", () => {
    const f = { ...good, webhooks: [{ url: "https://sociaos.com/api/stripe/webhook/", status: "enabled", events: ["checkout.session.completed"] }], portal: { ...good.portal!, cancelMode: "immediately" } };
    expect(fixes(f)).toEqual(["webhook", "portal"]);
  });
  it("flags no webhook for this site and no portal", () => {
    expect(fixes({ ...good, webhooks: [{ url: "https://old.example.com/api/stripe/webhook", status: "enabled", events: ["*"] }], portal: null })).toEqual(["webhook", "portal"]);
  });
});
