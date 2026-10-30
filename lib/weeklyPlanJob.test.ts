import { describe, it, expect } from "vitest";
import { comingWeekLabel, isTimeZone, localClock, sundayPlanDue } from "./weeklyPlanJob";

// Sunday 1 Nov 2026. Chicago is UTC-6 from 2 AM that day (DST ends); Tokyo is UTC+9.
const at = (iso: string) => new Date(iso);

describe("the person's clock", () => {
  it("reads weekday and hour in their time zone", () => {
    expect(localClock(at("2026-11-02T00:30:00Z"), "America/Chicago")).toEqual({ weekday: 0, hour: 18, minute: 30 });
    expect(localClock(at("2026-11-02T00:30:00Z"), "Asia/Tokyo")).toEqual({ weekday: 1, hour: 9, minute: 30 });
  });
  it("accepts real IANA zones only", () => {
    expect(isTimeZone("America/Chicago")).toBe(true);
    expect(isTimeZone("Mars/Olympus")).toBe(false);
    expect(isTimeZone("")).toBe(false);
  });
});

describe("the Sunday plan is due at 6 PM their time", () => {
  it("not at 5:59 PM, yes at 6 PM, in Chicago", () => {
    expect(sundayPlanDue(at("2026-11-01T23:59:00Z"), "America/Chicago", null)).toBe(false); // Sun 5:59 PM
    expect(sundayPlanDue(at("2026-11-02T00:00:00Z"), "America/Chicago", null)).toBe(true); // Sun 6:00 PM
  });

  it("at the same instant, is due in one zone and not in another", () => {
    const t = at("2026-11-01T09:00:00Z"); // Sun 6 PM in Tokyo, Sun 3 AM in Chicago
    expect(sundayPlanDue(t, "Asia/Tokyo", null)).toBe(true);
    expect(sundayPlanDue(t, "America/Chicago", null)).toBe(false);
  });

  it("catches up until Monday noon, then stops", () => {
    expect(sundayPlanDue(at("2026-11-02T17:59:00Z"), "America/Chicago", null)).toBe(true); // Mon 11:59 AM
    expect(sundayPlanDue(at("2026-11-02T18:00:00Z"), "America/Chicago", null)).toBe(false); // Mon noon
  });

  it("isn't due again when a plan was made since Thursday, but is after an older one", () => {
    const sun6pm = at("2026-11-02T00:00:00Z");
    expect(sundayPlanDue(sun6pm, "America/Chicago", "2026-10-31T15:00:00Z")).toBe(false); // Sat morning
    expect(sundayPlanDue(sun6pm, "America/Chicago", "2026-10-30T06:00:00Z")).toBe(false); // Fri 1 AM
    expect(sundayPlanDue(sun6pm, "America/Chicago", "2026-10-29T03:00:00Z")).toBe(true); // Wed 10 PM
    expect(sundayPlanDue(sun6pm, "America/Chicago", "2026-10-26T15:00:00Z")).toBe(true); // last Monday
  });

  it("falls back to UTC for an unknown zone", () => {
    expect(sundayPlanDue(at("2026-11-01T18:00:00Z"), "Nowhere/Else", null)).toBe(true);
  });

  it("labels the coming Monday in their zone", () => {
    expect(comingWeekLabel(at("2026-11-02T00:00:00Z"), "America/Chicago")).toBe("Nov 2");
  });
});
