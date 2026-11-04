import { describe, expect, it } from "vitest";
import { approvalTime, DEFAULT_HOUR, planWeekMonday, plannedTime, slotFor } from "./schedule";

const TZ = "America/Chicago";

describe("planWeekMonday: the week a plan is for", () => {
  it("is the coming week for the Sunday plan", () => {
    // Sunday 1 Nov 2026, 18:30 in Chicago.
    expect(planWeekMonday(new Date("2026-11-02T00:30:00Z"), TZ)).toEqual({ year: 2026, month: 11, day: 2 });
  });
  it("is this week for a plan made on Monday to Wednesday", () => {
    expect(planWeekMonday(new Date("2026-11-04T15:00:00Z"), TZ)).toEqual({ year: 2026, month: 11, day: 2 });
  });
  it("is next week for a plan made on Thursday or later", () => {
    expect(planWeekMonday(new Date("2026-11-05T15:00:00Z"), TZ)).toEqual({ year: 2026, month: 11, day: 9 });
  });
  it("reads the day in the owner's zone, not UTC", () => {
    // 04:00 UTC Monday is still Sunday evening in Chicago.
    expect(planWeekMonday(new Date("2026-11-09T04:00:00Z"), TZ)).toEqual({ year: 2026, month: 11, day: 9 });
  });
});

describe("plannedTime", () => {
  const sunday = new Date("2026-11-08T00:30:00Z"); // Saturday 7 Nov 18:30 Chicago, so next week starts 9 Nov
  it("puts a post on its weekday at 6 PM local without posting history", () => {
    expect(plannedTime(sunday, "Wednesday", TZ)).toBe("2026-11-12T00:00:00.000Z");
    expect(DEFAULT_HOUR).toBe(18);
  });
  it("uses the account's best window that day", () => {
    // Wednesday (day 2), block 4 = 12:00, posted 15 minutes in.
    expect(plannedTime(sunday, "Wed", TZ, [{ day: 2, block: 4, rel: 1.4 }, { day: 2, block: 6, rel: 1.1 }])).toBe("2026-11-11T18:15:00.000Z");
  });
  it("puts Sunday at the end of the week", () => {
    expect(plannedTime(sunday, "Sunday", TZ)).toBe("2026-11-16T00:00:00.000Z");
  });
  it("gives no time for a day that isn't a weekday", () => {
    expect(plannedTime(sunday, "Someday", TZ)).toBeNull();
  });
});

describe("slotFor and approvalTime", () => {
  it("falls back to the default hour on days without a window", () => {
    expect(slotFor(5, [{ day: 2, block: 4, rel: 2 }])).toEqual({ hour: 18, minute: 0 });
  });
  it("keeps a planned time that is still ahead", () => {
    expect(approvalTime("2026-11-12T00:00:00.000Z", new Date("2026-11-10T12:00:00Z"))).toBe("2026-11-12T00:00:00.000Z");
  });
  it("moves a passed or too-close time to the next quarter hour after 15 minutes", () => {
    expect(approvalTime("2026-11-10T12:05:00.000Z", new Date("2026-11-10T12:01:00Z"))).toBe("2026-11-10T12:30:00.000Z");
    expect(approvalTime(null, new Date("2026-11-10T12:00:00Z"))).toBe("2026-11-10T12:15:00.000Z");
  });
});
