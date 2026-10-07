import { describe, it, expect, beforeEach, vi } from "vitest";
import type Stripe from "stripe";
import { resolvePriceId } from "./stripe";

type P = { id: string; active: boolean; recurring: { interval: "month" | "year" } | null };
function fakeStripe(defaultPrice: P | null, list: P[]) {
  return {
    products: { retrieve: vi.fn(async () => ({ id: "prod_x", default_price: defaultPrice })) },
    prices: { list: vi.fn(async () => ({ data: list })) },
  } as unknown as Stripe;
}

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
