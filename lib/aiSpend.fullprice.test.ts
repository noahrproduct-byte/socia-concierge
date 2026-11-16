import { describe, it, expect } from "vitest";
import { fullPriceCapUsd } from "./aiSpend";
import { CREDIT_USD, FULL_PRICE_CREDITS, MARGIN, MONTHLY_CREDITS } from "./credits/config";
import { FULL_PRICE } from "./launch";
import { PLANS } from "./plans";

describe("the AI ceiling for full-price Pro", () => {
  it("adds room for the extra credits, so they can all be spent", () => {
    const full = { plan: "pro" as const, priceCents: Math.round(FULL_PRICE.pro * 100) };
    const costUsd = ((FULL_PRICE_CREDITS.pro ?? 0) * CREDIT_USD) / MARGIN;
    expect(PLANS.pro.aiSpendCapUsd + fullPriceCapUsd(full)).toBeGreaterThan(costUsd);
  });
  it("adds nothing for launch-price or unknown subscribers, or other plans", () => {
    expect(fullPriceCapUsd({ plan: "pro", priceCents: 4999 })).toBe(0);
    expect(fullPriceCapUsd({ plan: "pro", priceCents: null })).toBe(0);
    expect(fullPriceCapUsd({ plan: "growth", priceCents: 4999 })).toBe(0);
    expect(MONTHLY_CREDITS.pro).toBeLessThan(FULL_PRICE_CREDITS.pro ?? 0);
  });
});
