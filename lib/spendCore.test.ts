import { describe, expect, it } from "vitest";
import { PLANS } from "./plans";
import { forecastMonth, monthProgress, paymentFees, reloadFor, summarizeSpend, type SpendFacts } from "./spendCore";

const now = new Date("2026-11-16T00:00:00Z"); // 15 of 30 days gone
const base: SpendFacts = { now, aiMonthMicros: null, aiMonthCalls: null, aiLastMonthMicros: null, topAccounts: null, generations: null, subscriptions: null, lastAlarms: null };

describe("spend arithmetic", () => {
  it("projects the month from the pace so far", () => {
    expect(monthProgress(now)).toMatchObject({ elapsed: 15, days: 30 });
    expect(forecastMonth(50, now)).toBe(100);
  });
  it("sizes a top-up at about a week, rounded up to $5, never under $25", () => {
    expect(reloadFor(300, now)).toBe(70);
    expect(reloadFor(10, now)).toBe(25);
  });
  it("takes Managed Payments fees off each payment", () => {
    expect(paymentFees(7999)).toBe(598);
  });
  it("keeps unknown parts unknown instead of zero", () => {
    const s = summarizeSpend(base);
    expect(s.ai).toBeNull();
    expect(s.higgsfield).toBeNull();
    expect(s.revenue).toBeNull();
    expect(s.costShare).toBeNull();
  });
  it("adds up AI, AI Studio and revenue, with the last seven days of generations", () => {
    const s = summarizeSpend({
      ...base,
      aiMonthMicros: 30_000_000, aiMonthCalls: 1200, aiLastMonthMicros: 41_500_000,
      generations: [
        { at: "2026-11-15T10:00:00Z", usd: 0.357, model: "kling-3.0-standard" },
        { at: "2026-11-15T11:00:00Z", usd: 0.375, model: "wan-3.0" },
        { at: "2026-11-02T11:00:00Z", usd: 1.3235, model: "seedance-2.5" },
      ],
      subscriptions: [{ plan: "scale", cents: 7999 }, { plan: "starter", cents: null }],
    });
    expect(s.ai).toMatchObject({ month: 30, forecast: 60, lastMonth: 41.5, calls: 1200 });
    expect(s.higgsfield?.count).toBe(3);
    expect(s.higgsfield?.days).toHaveLength(7);
    expect(s.higgsfield?.days.find((d) => d.day === "2026-11-15")).toMatchObject({ count: 2 });
    expect(s.higgsfield?.models[0].model).toBe("seedance-2.5");
    // Starter's missing price falls back to the plan's listed price.
    expect(s.revenue?.monthly).toBeCloseTo(79.99 + PLANS.starter.priceMonthly, 2);
    expect(s.costShare).toBeGreaterThan(0);
  });
});
