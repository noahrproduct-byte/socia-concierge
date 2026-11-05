import { describe, expect, it } from "vitest";
import { buildWeek, compareBars, coverOf, describeDay, kindOfFormat, planWeekday, scoreTone, shortNum, type Competitors } from "./overviewVisual";

// A Wednesday at noon local time.
const now = new Date(2026, 10, 4, 12, 0, 0);
const iso = (y: number, m: number, d: number, h = 10) => new Date(y, m, d, h).toISOString();

describe("buildWeek", () => {
  it("runs Monday to Sunday around today and marks past and today", () => {
    const week = buildWeek({ now, published: [], calendar: [], plan: null });
    expect(week.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(week.map((d) => d.dayNum)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(week.map((d) => d.isToday)).toEqual([false, false, true, false, false, false, false]);
    expect(week.map((d) => d.isPast)).toEqual([true, true, false, false, false, false, false]);
  });

  it("places published posts, calendar posts and plan lines on their days, once each", () => {
    const week = buildWeek({
      now,
      published: [{ t: iso(2026, 10, 2), format: "Reel", cover: { src: "https://cdn.example/poster.jpg", video: false } }],
      calendar: [
        { id: "z", at: iso(2026, 10, 2, 14), status: "published", mediaType: "REELS", title: "Same reel, from the Calendar" },
        { id: "a", at: iso(2026, 10, 5), status: "scheduled", mediaType: "REELS", title: "Thursday reel", mediaUrl: "https://files.example/u/clip.mp4" },
        { id: "b", at: iso(2026, 10, 6), status: "draft", mediaType: "IMAGE", title: "Friday photo" },
        { id: "c", at: iso(2026, 10, 7), status: "cancelled", mediaType: "IMAGE", title: "Dropped" },
      ],
      plan: [{ day: "Saturday", format: "carousel", title: "Menu carousel" }, { day: "Thursday", format: "Reel", title: "Ignored: day already has a post" }],
    });
    expect(week[0].items).toEqual([{ kind: "reel", status: "posted", title: "Reel", cover: { src: "https://cdn.example/poster.jpg", video: false } }]);
    expect(week[3].items).toEqual([{ kind: "reel", status: "scheduled", title: "Thursday reel", cover: { src: "https://files.example/u/clip.mp4", video: true } }]);
    // No media yet, and a plan line that is only an idea: no cover, the icon stands in.
    expect(week[4].items).toEqual([{ kind: "photo", status: "draft", title: "Friday photo", cover: null }]);
    expect(week[5].items).toEqual([{ kind: "carousel", status: "planned", title: "Menu carousel", cover: null }]);
    expect(week[6].items).toEqual([]);
  });

  it("describes a day in words for assistive tech", () => {
    const week = buildWeek({ now, published: [{ t: iso(2026, 10, 2), format: "Reel" }], calendar: [], plan: null });
    expect(describeDay(week[0])).toBe("Mon 2: reel posted");
    expect(describeDay(week[1])).toBe("Tue 3: nothing posted");
    expect(describeDay(week[6])).toBe("Sun 8: nothing planned");
  });
});

describe("coverOf", () => {
  it("goes by the file's own type, else by what the post says it is", () => {
    expect(coverOf("https://files.example/a.MP4?x=1", false)).toEqual({ src: "https://files.example/a.MP4?x=1", video: true });
    expect(coverOf("https://files.example/a.jpg", true)).toEqual({ src: "https://files.example/a.jpg", video: false });
    expect(coverOf("https://files.example/a", true)).toEqual({ src: "https://files.example/a", video: true });
  });
  it("gives nothing without a web address", () => {
    expect(coverOf(null, true)).toBeNull();
    expect(coverOf("x", false)).toBeNull();
  });
});

describe("kinds and weekdays", () => {
  it("reads formats loosely", () => {
    expect(kindOfFormat("Reel")).toBe("reel");
    expect(kindOfFormat("Carousel")).toBe("carousel");
    expect(kindOfFormat("Static image")).toBe("photo");
    expect(kindOfFormat("Story")).toBe("story");
    expect(kindOfFormat("")).toBe("post");
  });
  it("reads plan day names", () => {
    expect(planWeekday("Monday")).toBe(1);
    expect(planWeekday("Day 2: Tuesday")).toBe(2);
    expect(planWeekday("Day 2")).toBeNull();
  });
});

describe("compareBars", () => {
  const c: Competitors = {
    tracked: 4,
    rows: [
      { handle: "a", name: "A", avatar: null, engagement: 120, followers: 5000 },
      { handle: "b", name: "B", avatar: null, engagement: 300, followers: null },
      { handle: "c", name: "C", avatar: null, engagement: 50, followers: 900 },
      { handle: "d", name: "D", avatar: null, engagement: 80, followers: 20000 },
    ],
    you: { engagement: 100, followers: 1200 },
  };
  it("ranks you with the top three on the chosen measure", () => {
    expect(compareBars(c, "engagement").map((r) => r.handle)).toEqual(["b", "a", "you", "d"]);
    expect(compareBars(c, "followers").map((r) => r.handle)).toEqual(["d", "a", "you", "c"]);
  });
  it("leaves out accounts without that number, including you", () => {
    expect(compareBars({ ...c, you: { engagement: null, followers: null } }, "followers").map((r) => r.handle)).toEqual(["d", "a", "c"]);
  });
});

describe("score and figures", () => {
  it("pairs each range with a word", () => {
    expect(scoreTone(80)).toEqual({ tone: "good", word: "Strong" });
    expect(scoreTone(60)).toEqual({ tone: "ok", word: "Building" });
    expect(scoreTone(20)).toEqual({ tone: "low", word: "Needs work" });
  });
  it("shortens figures", () => {
    expect(shortNum(950)).toBe("950");
    expect(shortNum(1250)).toBe("1.3K");
    expect(shortNum(48000)).toBe("48K");
    expect(shortNum(2_400_000)).toBe("2.4M");
  });
});
