import { describe, expect, it } from "vitest";
import { FULL_PRICE, LAUNCH_ENDS_AT, launchFullPrice, launchOn, timeLeft } from "./launch";
import { PLANS } from "./plans";

describe("launch prices", () => {
  it("ends at the end of December 31, 2026, Central time", () => {
    expect(launchOn(Date.parse("2026-12-31T23:59:59-06:00"))).toBe(true);
    expect(launchOn(Date.parse("2027-01-01T00:00:00-06:00"))).toBe(false);
    expect(new Date(LAUNCH_ENDS_AT).toISOString()).toBe("2027-01-01T06:00:00.000Z");
  });

  it("crosses out a full price that is really higher, never on Free or after the end", () => {
    const during = Date.parse("2026-11-20T12:00:00-06:00");
    expect(launchFullPrice("starter", PLANS.starter.priceMonthly, during)).toBe(29.99);
    expect(launchFullPrice("free", 0, during)).toBeNull();
    expect(launchFullPrice("starter", PLANS.starter.priceMonthly, LAUNCH_ENDS_AT)).toBeNull();
    // Once priceMonthly is raised to the full price there is nothing to cross out.
    expect(launchFullPrice("pro", FULL_PRICE.pro, during)).toBeNull();
  });

  it("every full price is above today's launch price", () => {
    for (const plan of ["starter", "growth", "pro", "scale"] as const) expect(FULL_PRICE[plan]).toBeGreaterThan(PLANS[plan].priceMonthly);
  });

  it("counts down in days, hours, minutes and seconds, stopping at zero", () => {
    expect(timeLeft(LAUNCH_ENDS_AT - (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
    expect(timeLeft(LAUNCH_ENDS_AT + 5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});
