import { describe, it, expect, beforeEach, vi } from "vitest";
import type Stripe from "stripe";
import { planForPrice, priceIdFor, resolvePriceId } from "./stripe";

type P = { id: string; active: boolean; recurring: { interval: "month" | "year" } | null };
function fakeStripe(defaultPrice: P | null, list: P[]) {
  return {
    products: { retrieve: vi.fn(async () => ({ id: "prod_x", default_price: defaultPrice })) },
    prices: { list: vi.fn(async () => ({ data: list })) },
  } as unknown as Stripe;
}

describe("Growth's price under its Vercel spelling", () => {
  it("is read from STRIPE_PRICE_GRWOTH when STRIPE_PRICE_GROWTH isn't set", () => {
    const keep = { a: process.env.STRIPE_PRICE_GROWTH, b: process.env.STRIPE_PRICE_GROWTH_MONTHLY, c: process.env.STRIPE_PRICE_GRWOTH };
    delete process.env.STRIPE_PRICE_GROWTH; delete process.env.STRIPE_PRICE_GROWTH_MONTHLY;
    process.env.STRIPE_PRICE_GRWOTH = "price_growth_vercel";
    try {
      expect(priceIdFor("growth", "month")).toBe("price_growth_vercel");
      expect(planForPrice("price_growth_vercel")).toEqual({ plan: "growth", interval: "month" });
    } finally {
      for (const [k, v] of [["STRIPE_PRICE_GROWTH", keep.a], ["STRIPE_PRICE_GROWTH_MONTHLY", keep.b], ["STRIPE_PRICE_GRWOTH", keep.c]] as const) { if (v == null) delete process.env[k]; else process.env[k] = v; }
    }
  });
});

describe("resolving a plan's price from a product id", () => {
  beforeEach(() => { vi.resetModules(); });

  it("charges the product's default price", async () => {
    process.env.STRIPE_PRICE_STARTER = "prod_default_test";
    const s = fakeStripe({ id: "price_new19", active: true, recurring: { interval: "month" } }, [{ id: "price_old29", active: true, recurring: { interval: "month" } }]);
    expect(await resolvePriceId(s, "starter", "month")).toBe("price_new19");
  });

  it("falls back to an active monthly price when the default isn't one", async () => {
    process.env.STRIPE_PRICE_GROWTH = "prod_fallback_test";
    const s = fakeStripe({ id: "price_archived", active: false, recurring: { interval: "month" } }, [{ id: "price_year", active: true, recurring: { interval: "year" } }, { id: "price_49", active: true, recurring: { interval: "month" } }]);
    expect(await resolvePriceId(s, "growth", "month")).toBe("price_49");
  });

  it("uses a configured price id as is", async () => {
    process.env.STRIPE_PRICE_PRO = "price_direct";
    const s = fakeStripe(null, []);
    expect(await resolvePriceId(s, "pro", "month")).toBe("price_direct");
  });
});
