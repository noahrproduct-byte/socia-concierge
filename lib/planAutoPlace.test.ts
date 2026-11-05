import { describe, expect, it } from "vitest";
import { comingWeek, comingWeekDrafts, zonedInstant } from "./planAutoPlace";
import { planReadyAlert } from "./alertDetectors";

const TZ = "America/Chicago";
// Sunday 2026-11-08 at 6:30 PM in Chicago (CST, UTC-6).
const sundayEvening = new Date("2026-11-09T00:30:00Z");
const item = (day: string, over: Record<string, unknown> = {}) => ({ day, concept: `Concept for ${day}`, hook: `Hook for ${day}`, format: "Reel", ...over });

describe("zonedInstant", () => {
  it("finds the instant of a wall-clock time, across a daylight-saving change", () => {
    expect(zonedInstant(2026, 10, 9, 12, TZ).toISOString()).toBe("2026-11-09T18:00:00.000Z"); // CST
    expect(zonedInstant(2026, 6, 6, 12, TZ).toISOString()).toBe("2026-07-06T17:00:00.000Z"); // CDT
    expect(zonedInstant(2026, 10, 9, 12, "UTC").toISOString()).toBe("2026-11-09T12:00:00.000Z");
  });
});

describe("comingWeek", () => {
  it("is tomorrow's Monday on Sunday evening, today's on Monday morning, in the person's own zone", () => {
    expect(comingWeek(sundayEvening, TZ).start.toISOString()).toBe("2026-11-09T06:00:00.000Z");
    expect(comingWeek(sundayEvening, TZ).end.toISOString()).toBe("2026-11-16T06:00:00.000Z");
    const mondayMorning = new Date("2026-11-09T15:00:00Z"); // 9 AM Monday in Chicago
    expect(comingWeek(mondayMorning, TZ).start.toISOString()).toBe("2026-11-09T06:00:00.000Z");
    // The same instant is already Monday in Tokyo.
    expect(comingWeek(sundayEvening, "Asia/Tokyo").monday).toEqual({ y: 2026, m: 10, d: 9 });
  });
});

describe("comingWeekDrafts", () => {
  it("places each post at noon local on its day, with the plan's own words as the caption", () => {
    const drafts = comingWeekDrafts([item("Monday"), item("Wednesday", { format: "Static photo" }), item("Sunday")], sundayEvening, TZ);
    expect(drafts.map((d) => [d.plan_day, d.scheduled_at, d.media_type])).toEqual([
      ["Monday", "2026-11-09T18:00:00.000Z", "REELS"],
      ["Wednesday", "2026-11-11T18:00:00.000Z", "IMAGE"],
      ["Sunday", "2026-11-15T18:00:00.000Z", "REELS"],
    ]);
    expect(drafts[0].caption).toBe("Hook for Monday\n\nConcept for Monday");
  });

  it("leaves out what should not be placed", () => {
    const mondayAfternoon = new Date("2026-11-09T20:00:00Z"); // 2 PM Monday in Chicago: Monday's noon has passed
    const drafts = comingWeekDrafts([
      item("Monday"), item("Day 2"), item("Tuesday", { maker: "claude" }), item("Thursday", { decision: { status: "rejected" } }),
      item("Friday", { hook: "", concept: "" }), item("Saturday"),
    ], mondayAfternoon, TZ);
    expect(drafts.map((d) => d.plan_day)).toEqual(["Saturday"]);
  });
});

describe("the plan-ready alert", () => {
  it("says the posts are on the Calendar only when SOCIA placed them", () => {
    const base = { id: "p1", headline: "Reels lead.", posts: 5, weekLabel: "Nov 9" };
    expect(planReadyAlert(base).body).toBe("5 posts, built from your results, goals and competitors. Reels lead.");
    expect(planReadyAlert({ ...base, placed: 5 }).body).toBe("5 posts, built from your results, goals and competitors. They are on your Calendar as drafts: add the video to each and schedule it. Reels lead.");
    expect(planReadyAlert({ ...base, placed: 3 }).body).toContain("3 of them are on your Calendar as drafts");
  });
});
