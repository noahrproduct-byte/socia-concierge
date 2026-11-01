import { describe, it, expect } from "vitest";
import { planReschedule, minutesOf, clockOf, type RescheduleRule } from "./reschedule";

const TZ = "America/Chicago";
const NOW = new Date("2026-11-03T15:00:00Z"); // Tuesday 9 AM in Chicago
const posts = ["a", "b", "c"].map((id) => ({ id, title: id }));
const rule = (r: Partial<RescheduleRule>): RescheduleRule => ({ startLocal: null, spacingMinutes: 0, perDay: 0, times: [], days: 0, ...r });
const local = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

describe("Ask SOCIA scheduling rules", () => {
  it("every 2 hours from a start the person names", () => {
    const p = planReschedule({ posts, rule: rule({ spacingMinutes: 120, startLocal: "2026-11-04T09:00" }), existing: [], history: null, now: NOW, tz: TZ });
    expect(p.slots.map((s) => local(s.at))).toEqual(["Wed 9:00 AM", "Wed 11:00 AM", "Wed 1:00 PM"]);
    expect(p.summary).toBe("3 posts, 2 hours apart, from Wed, Nov 4 at 9:00 AM.");
  });

  it("every 2 hours with no start begins at the next whole hour at least half an hour away", () => {
    const p = planReschedule({ posts, rule: rule({ spacingMinutes: 120 }), existing: [], history: null, now: new Date("2026-11-03T15:40:00Z"), tz: TZ });
    expect(local(p.slots[0].at)).toBe("Tue 11:00 AM");
  });

  it("refuses a start that has passed", () => {
    const p = planReschedule({ posts, rule: rule({ spacingMinutes: 60, startLocal: "2026-11-03T08:00" }), existing: [], history: null, now: NOW, tz: TZ });
    expect(p.slots).toEqual([]);
    expect(p.unplaced).toHaveLength(3);
  });

  it("one a day at a named time for the rest of the week, and says what doesn't fit", () => {
    const p = planReschedule({ posts: [...posts, { id: "d", title: "d" }, { id: "e", title: "e" }], rule: rule({ perDay: 1, times: ["18:00"], startLocal: "2026-11-04", days: 4 }), existing: [], history: null, now: NOW, tz: TZ });
    expect(p.slots.map((s) => local(s.at))).toEqual(["Wed 6:00 PM", "Thu 6:00 PM", "Fri 6:00 PM", "Sat 6:00 PM"]);
    expect(p.unplaced.map((u) => u.id)).toEqual(["e"]);
    expect(p.summary).toBe("4 posts, 1 a day at 6:00 PM, from Wed, Nov 4. 1 didn't fit in 4 days.");
  });

  it("two a day at the default times from tomorrow when nothing more is said", () => {
    const p = planReschedule({ posts, rule: rule({ perDay: 2 }), existing: [], history: null, now: NOW, tz: TZ });
    expect(p.slots.map((s) => local(s.at))).toEqual(["Wed 11:00 AM", "Wed 6:00 PM", "Thu 11:00 AM"]);
  });

  it("a start with a time and nothing else means one a day at that time", () => {
    const p = planReschedule({ posts: posts.slice(0, 2), rule: rule({ startLocal: "2026-11-05T07:30" }), existing: [], history: null, now: NOW, tz: TZ });
    expect(p.slots.map((s) => local(s.at))).toEqual(["Thu 7:30 AM", "Fri 7:30 AM"]);
  });

  it("parses and prints times", () => {
    expect(minutesOf("9:05")).toBe(545);
    expect(minutesOf("24:00")).toBeNull();
    expect(clockOf(0)).toBe("12:00 AM");
    expect(clockOf(13 * 60 + 30)).toBe("1:30 PM");
  });
});
