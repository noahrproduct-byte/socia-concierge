import { describe, expect, it } from "vitest";
import { FULL_PRICE, LAUNCH_ENDS_AT, launchFullPrice, launchOn, timeLeft } from "./launch";
import { PLANS } from "./plans";

describe("launch prices", () => {
  it("ended early, at the start of November 17, 2026, Central time (Noah)", () => {
    expect(launchOn(Date.parse("2026-11-16T23:59:59-06:00"))).toBe(true);
    expect(launchOn(Date.parse("2026-11-17T00:00:00-06:00"))).toBe(false);
    expect(new Date(LAUNCH_ENDS_AT).toISOString()).toBe("2026-11-17T06:00:00.000Z");
  });

  it("crosses out a full price that is really higher, never on Free or after the end", () => {
    const during = Date.parse("2026-11-10T12:00:00-06:00");
    expect(launchFullPrice("starter", 19.99, during)).toBe(29.99);
    expect(launchFullPrice("free", 0, during)).toBeNull();
    expect(launchFullPrice("starter", PLANS.starter.priceMonthly, LAUNCH_ENDS_AT)).toBeNull();
    // Once priceMonthly is raised to the full price there is nothing to cross out.
    expect(launchFullPrice("pro", FULL_PRICE.pro, during)).toBeNull();
  });

  it("the monthly plans now sell at the full price", () => {
    for (const plan of ["starter", "growth", "pro", "scale"] as const) expect(PLANS[plan].priceMonthly).toBe(FULL_PRICE[plan]);
  });

  it("counts down in days, hours, minutes and seconds, stopping at zero", () => {
    expect(timeLeft(LAUNCH_ENDS_AT - (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
    expect(timeLeft(LAUNCH_ENDS_AT + 5000)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  });
});
