import { describe, expect, it } from "vitest";
import { PLANS } from "./plans";
import { YEARLY_PER_MONTH, bestYearlyPercent, money, monthlyForAYear, yearlyPercent, yearlySaving, yearlyTotal, yearlyTotalCents } from "./yearly";

describe("yearly plans", () => {
  it("charge twelve months of the yearly monthly price, as entered in Stripe", () => {
    expect(yearlyTotal("starter")).toBe(239.88);
    expect(yearlyTotal("growth")).toBe(419.88);
    expect(yearlyTotal("pro")).toBe(599.88);
    expect(yearlyTotal("scale")).toBe(959.88);
    expect(yearlyTotalCents("scale")).toBe(95988);
  });
  it("save against a year of the full monthly price", () => {
    expect(monthlyForAYear("starter")).toBe(359.88);
    expect(yearlySaving("starter")).toBe(120);
    expect(yearlySaving("growth")).toBe(180);
    expect(yearlySaving("pro")).toBe(360);
    expect(yearlySaving("scale")).toBe(480);
  });
  it("round the percent down, so it is never overstated", () => {
    expect(yearlyPercent("starter")).toBe(33);
    expect(yearlyPercent("growth")).toBe(30);
    expect(yearlyPercent("pro")).toBe(37);
    expect(yearlyPercent("scale")).toBe(33);
    expect(bestYearlyPercent(["starter", "growth", "pro", "scale"])).toBe(37);
  });
  it("are always cheaper each month than the monthly plan", () => {
    for (const p of ["starter", "growth", "pro", "scale"] as const) expect(YEARLY_PER_MONTH[p]).toBeLessThan(PLANS[p].priceMonthly);
  });
  it("write money plainly", () => {
    expect(money(120)).toBe("$120");
    expect(money(239.88)).toBe("$239.88");
    expect(money(1439.88)).toBe("$1,439.88");
  });
});
