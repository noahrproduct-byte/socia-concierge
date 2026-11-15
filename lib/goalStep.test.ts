import { describe, expect, it } from "vitest";
import { dueFor, dueIn, goalStepError, goalStepSummary, targetNumber } from "./goalStep";

const today = "2026-11-15";
const ok = { metric: "followers" as const, target: "10,000", frame: 90 as const, custom: "", today, now: 2450 };

describe("the goal step", () => {
  it("turns a timeframe into a date", () => {
    expect(dueIn(30, today)).toBe("2026-12-15");
    expect(dueFor(90, "", today)).toBe("2027-02-13");
    expect(dueFor("custom", "2027-01-01", today)).toBe("2027-01-01");
    expect(dueFor("custom", "", today)).toBeNull();
    expect(dueFor(null, "", today)).toBeNull();
  });
  it("reads a typed target", () => {
    expect(targetNumber("10,000")).toBe(10000);
    expect(targetNumber(" 2 500 ")).toBe(2500);
    expect(targetNumber("")).toBeNull();
    expect(targetNumber("lots")).toBeNull();
  });
  it("accepts a real target with a timeframe", () => {
    expect(goalStepError(ok)).toBeNull();
    expect(goalStepError({ ...ok, frame: "custom", custom: "2027-03-01" })).toBeNull();
    // A number SOCIA can't read (bookings, customers) has no starting point to check against.
    expect(goalStepError({ ...ok, metric: "bookings", target: "40", now: null })).toBeNull();
  });
  it("asks for what is missing, one thing at a time", () => {
    expect(goalStepError({ ...ok, target: "" })).toBe("Set a target above zero.");
    expect(goalStepError({ ...ok, target: "2,000" })).toBe("Set a target above where you are now (2,450).");
    expect(goalStepError({ ...ok, frame: null })).toBe("Choose when you want to reach it.");
    expect(goalStepError({ ...ok, frame: "custom", custom: "" })).toBe("Choose the date you want to reach it by.");
    expect(goalStepError({ ...ok, frame: "custom", custom: "2026-11-15" })).toBe("Choose a date after today.");
    expect(goalStepError({ ...ok, metric: "engagement_rate", target: "140", now: 3 })).toBe("An engagement rate is a percentage, at most 100.");
  });
  it("says the goal back plainly", () => {
    expect(goalStepSummary("followers", 2450, 10000, "2027-02-13", today)).toBe("2,450 to 10,000 in 90 days");
    expect(goalStepSummary("bookings", null, 40, "2026-12-15", today)).toBe("40 in 30 days");
  });
});
