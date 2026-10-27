import { describe, it, expect } from "vitest";
import { spreadDays, spreadSlots } from "./spread";

const now = new Date(2026, 9, 26, 15, 0); // Monday 26 Oct 2026, 3pm local
const at = (dayOffset: number, hour: number) => new Date(2026, 9, 27 + dayOffset, hour, 0);

describe("spreadDays", () => {
  it("spaces a few posts evenly over free days", () => {
    expect(spreadDays(3, [0, 0, 0, 0, 0, 0, 0])).toEqual([1, 3, 5]);
    expect(spreadDays(1, [0, 0, 0, 0, 0, 0, 0])).toEqual([3]);
    expect(spreadDays(7, [0, 0, 0, 0, 0, 0, 0])).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("uses empty days before days that already have a post", () => {
    const days = spreadDays(2, [1, 0, 1, 0, 1, 1, 1]);
    expect(days.sort()).toEqual([1, 3]);
  });

  it("fills round-robin by load once the free days are used up", () => {
    const days = spreadDays(10, [0, 0, 0, 0, 0, 0, 0]);
    const perDay = Array.from({ length: 7 }, (_, i) => days.filter((d) => d === i).length);
    expect(perDay).toEqual([2, 2, 2, 1, 1, 1, 1]);
  });
});

describe("spreadSlots", () => {
  it("starts tomorrow, uses the audience hour, and sorts by time", () => {
    const slots = spreadSlots({ count: 3, now, existing: [], hourFor: (wd) => (wd === 1 ? 18 : 11) });
    expect(slots.map((s) => s.dayOffset)).toEqual([1, 3, 5]);
    expect(slots[0].at.getTime()).toBe(at(1, 11).getTime()); // Wednesday
    expect(slots.every((s) => s.at.getTime() > now.getTime())).toBe(true);
  });

  it("puts a second post on the same day three hours later, never within an hour of an existing one", () => {
    const slots = spreadSlots({ count: 8, now, existing: [at(0, 12)], hourFor: () => 12, days: 7 });
    const dayZero = slots.filter((s) => s.dayOffset === 0).map((s) => s.at.getHours());
    expect(dayZero.length).toBeGreaterThan(0);
    for (const h of dayZero) expect(Math.abs(h - 12)).toBeGreaterThanOrEqual(1);
    const twice = slots.filter((s) => s.onDay >= 2);
    expect(twice.length).toBeGreaterThan(0);
    for (const s of slots) { expect(s.at.getHours()).toBeGreaterThanOrEqual(8); expect(s.at.getHours()).toBeLessThanOrEqual(21); }
  });

  it("returns nothing for a count of zero", () => {
    expect(spreadSlots({ count: 0, now, existing: [], hourFor: () => 12 })).toEqual([]);
  });
});
