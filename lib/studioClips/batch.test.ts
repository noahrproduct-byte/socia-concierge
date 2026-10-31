import { describe, it, expect } from "vitest";
import { scheduleBatch, batchOrder, tomorrowIn, dayFrom, type BatchItem } from "./batch";
import type { TimedPost } from "@/lib/postingTimes";

const TZ = "America/Chicago";
const NOW = new Date("2026-11-03T15:00:00Z"); // Tuesday 9 AM in Chicago (after DST ended)
const item = (key: string, clipIds: string[], strength: BatchItem["strength"] = "possible", tags: string[] = []): BatchItem => ({ key, title: key, strength, clipIds, tags });
const local = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

describe("make and schedule: spreading a batch", () => {
  it("starts tomorrow and puts one a day at the default time without history", () => {
    const plan = scheduleBatch({ items: [item("a", ["c1"]), item("b", ["c2"]), item("c", ["c3"])], perDay: 1, startDate: tomorrowIn(NOW, TZ), existing: [], history: null, now: NOW, tz: TZ });
    expect(plan.slots.map((s) => s.date)).toEqual(["2026-11-04", "2026-11-05", "2026-11-06"]);
    expect(plan.slots.map((s) => local(s.at))).toEqual(["Wed 12:00 PM", "Thu 12:00 PM", "Fri 12:00 PM"]);
    expect(plan.slots.every((s) => !s.timeChosen && s.reason === "Default time.")).toBe(true);
    expect(plan.timing).toMatch(/hasn't read this account's posting history/);
    expect(plan.unplaced).toEqual([]);
  });

  it("puts two a day at 11 AM and 6 PM", () => {
    const plan = scheduleBatch({ items: ["a", "b", "c", "d", "e"].map((k, i) => item(k, [`c${i}`])), perDay: 2, startDate: "2026-11-04", existing: [], history: null, now: NOW, tz: TZ });
    expect(plan.slots.map((s) => local(s.at))).toEqual(["Wed 11:00 AM", "Wed 6:00 PM", "Thu 11:00 AM", "Thu 6:00 PM", "Fri 11:00 AM"]);
  });

  it("counts a day's existing posts toward the number and keeps two hours from them", () => {
    const existing = [{ id: "x", at: "2026-11-04T17:30:00Z", label: "Lunch special" }]; // Wed 11:30 AM
    const plan = scheduleBatch({ items: [item("a", ["c1"]), item("b", ["c2"])], perDay: 2, startDate: "2026-11-04", existing, history: null, now: NOW, tz: TZ });
    expect(plan.slots.map((s) => local(s.at))).toEqual(["Wed 6:00 PM", "Thu 11:00 AM"]);
    const full = scheduleBatch({ items: [item("a", ["c1"])], perDay: 1, startDate: "2026-11-04", existing, history: null, now: NOW, tz: TZ });
    expect(full.slots[0].date).toBe("2026-11-05");
    const three = scheduleBatch({ items: [item("a", ["c1"]), item("b", ["c2"])], perDay: 3, startDate: "2026-11-04", existing: [{ id: "y", at: "2026-11-04T19:00:00Z", label: "x" }], history: null, now: NOW, tz: TZ });
    expect(three.slots.map((s) => local(s.at))).toEqual(["Wed 9:00 AM", "Wed 7:00 PM"]);
  });

  it("keeps posts that share footage apart when there is a choice", () => {
    const plan = scheduleBatch({ items: [item("a", ["c1"]), item("b", ["c1"]), item("c", ["c2"])], perDay: 1, startDate: "2026-11-04", existing: [], history: null, now: NOW, tz: TZ });
    expect(plan.slots.map((s) => s.key)).toEqual(["a", "c", "b"]);
  });

  it("uses the history's window for that weekday as the first post of the day", () => {
    // 10 Wednesday posts at 6:30 PM doing far better than 10 others at 9:30 AM on other days.
    const hist: TimedPost[] = [];
    for (let i = 0; i < 10; i++) hist.push({ id: `w${i}`, t: new Date(Date.UTC(2026, 8, 2 + i * 7, 23, 30)).toISOString(), e: 100, format: "Reel" });
    for (let i = 0; i < 10; i++) hist.push({ id: `o${i}`, t: new Date(Date.UTC(2026, 8, 3 + i * 7, 14, 30)).toISOString(), e: 10, format: "Reel" });
    const plan = scheduleBatch({ items: [item("a", ["c1"])], perDay: 1, startDate: "2026-11-04", existing: [], history: hist, now: NOW, tz: TZ });
    expect(plan.slots[0].timeChosen).toBe(true);
    expect(local(plan.slots[0].at)).toBe("Wed 6:15 PM");
    expect(plan.slots[0].reason).toMatch(/Wednesdays/);
    // Three a day: the window takes the place of the nearest default (7 PM).
    const three = scheduleBatch({ items: ["a", "b", "c"].map((k, i) => item(k, [`c${i}`])), perDay: 3, startDate: "2026-11-04", existing: [], history: hist, now: NOW, tz: TZ });
    expect(three.slots.map((s) => local(s.at))).toEqual(["Wed 9:00 AM", "Wed 1:00 PM", "Wed 6:15 PM"]);
  });

  it("never schedules sooner than half an hour from now, and reports what doesn't fit", () => {
    const today = scheduleBatch({ items: [item("a", ["c1"])], perDay: 1, startDate: "2026-11-03", existing: [], history: null, now: new Date("2026-11-03T17:45:00Z"), tz: TZ });
    expect(today.slots[0].date).toBe("2026-11-04");
    const tight = scheduleBatch({ items: [item("a", ["c1"]), item("b", ["c2"])], perDay: 1, startDate: "2026-11-04", existing: [], history: null, now: NOW, tz: TZ, horizonDays: 1 });
    expect(tight.slots).toHaveLength(1);
    expect(tight.unplaced[0]).toMatchObject({ key: "b" });
  });

  it("orders strong ideas, then possible ones, then single clips", () => {
    expect(batchOrder([item("c", [], "clip"), item("p", [], "possible"), item("s", [], "strong")]).map((i) => i.key)).toEqual(["s", "p", "c"]);
    expect(dayFrom("2026-12-31", 1).date).toBe("2027-01-01");
  });
});
