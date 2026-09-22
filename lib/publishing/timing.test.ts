import { describe, it, expect, beforeAll } from "vitest";
import { recommendedWindows, nextOccurrence, betweenPhrase, formatWhen, toLocalInput, fromLocalInput, zonedToUtc, historySentence, NO_HISTORY_SENTENCE, SMALL_SAMPLE_SENTENCE, YOUTUBE_NO_HISTORY_SENTENCE } from "./timing";
import type { TimedPost } from "../postingTimes";

// buildWindows buckets by the runtime's local clock (the browser's zone in
// production). Pin the test runtime to UTC so bucket assertions are stable.
beforeAll(() => { process.env.TZ = "UTC"; });

const NY = "America/New_York";
// Monday 2026-09-21, 08:00 in New York (12:00Z).
const now = new Date("2026-09-21T12:00:00Z");

const post = (id: string, t: string, e: number): TimedPost => ({ id, t, e, format: "reel" });

describe("nextOccurrence", () => {
  it("lands 15 minutes into the block on the next matching weekday in the zone", () => {
    // Tuesday (1), 6 to 9 PM block (6) -> Tue Sep 22 18:15 EDT = 22:15Z
    expect(nextOccurrence(1, 6, now, NY)).toBe("2026-09-22T22:15:00.000Z");
  });
  it("uses today when the block is still ahead", () => {
    expect(nextOccurrence(0, 6, now, NY)).toBe("2026-09-21T22:15:00.000Z");
  });
  it("rolls a week forward when today's block has passed", () => {
    // Monday 12 to 3 AM already passed at 8 AM -> next Monday 00:15 EDT = 04:15Z
    expect(nextOccurrence(0, 0, now, NY)).toBe("2026-09-28T04:15:00.000Z");
  });
  it("respects a DST change between now and the occurrence", () => {
    const late = new Date("2026-10-30T12:00:00Z"); // Friday; DST ends Nov 1
    expect(nextOccurrence(1, 6, late, NY)).toBe("2026-11-03T23:15:00.000Z"); // 18:15 EST
  });
  it("is never in the past", () => {
    for (let day = 0; day < 7; day++) for (let block = 0; block < 8; block++) {
      expect(new Date(nextOccurrence(day, block, now, NY)).getTime()).toBeGreaterThan(now.getTime());
    }
  });
});

describe("betweenPhrase", () => {
  it("collapses the period when both ends share it", () => {
    expect(betweenPhrase(6)).toBe("between 6 and 9 PM");
    expect(betweenPhrase(0)).toBe("between 12 and 3 AM");
    expect(betweenPhrase(4)).toBe("between 12 and 3 PM");
  });
  it("names both periods when they differ", () => {
    expect(betweenPhrase(3)).toBe("between 9 AM and 12 PM");
    expect(betweenPhrase(7)).toBe("between 9 PM and 12 AM");
  });
});

describe("recommendedWindows", () => {
  it("says nothing below MIN_POSTS", () => {
    const few = Array.from({ length: 7 }, (_, i) => post(`p${i}`, `2026-08-0${i + 1}T18:30:00Z`, 100 + i));
    const r = recommendedWindows(few, now, "UTC");
    expect(r.enough).toBe(false);
    expect(r.posts).toBe(7);
    expect(r.best).toEqual([]);
    expect(r.sentence).toBeNull();
  });

  it("names the window with higher median engagement and the sample size", () => {
    // 6 Tuesdays 18:30Z at 200, 8 Thursdays 09:30Z at 50 -> baseline 50, Tuesday block rel 4.
    const tuesdays = ["2026-06-02", "2026-06-09", "2026-06-16", "2026-06-23", "2026-06-30", "2026-07-07"].map((d, i) => post(`t${i}`, `${d}T18:30:00Z`, 200));
    const thursdays = ["2026-06-04", "2026-06-11", "2026-06-18", "2026-06-25", "2026-07-02", "2026-07-09", "2026-07-16", "2026-07-23"].map((d, i) => post(`h${i}`, `${d}T09:30:00Z`, 50));
    const r = recommendedWindows([...tuesdays, ...thursdays], now, "UTC");
    expect(r.enough).toBe(true);
    expect(r.posts).toBe(14);
    expect(r.best[0]).toMatchObject({ day: 1, block: 6, n: 6, confidence: "high" });
    expect(r.best[0].nextAt).toBe("2026-09-22T18:15:00.000Z");
    expect(r.sentence).toBe("Your Instagram posts between 6 and 9 PM on Tuesdays have had higher median engagement in the available sample. Based on 14 Instagram posts.");
  });

  it("is honest when the sample is large enough but nothing stands out", () => {
    const flat = Array.from({ length: 8 }, (_, i) => post(`f${i}`, `2026-06-0${i + 1}T${String(9 + i).padStart(2, "0")}:30:00Z`, 100));
    const r = recommendedWindows(flat, now, "UTC");
    expect(r.enough).toBe(false);
    expect(r.best).toEqual([]);
    expect(r.sentence).toBe("Your 8 Instagram posts do not show a time window with clearly higher median engagement yet.");
    expect(r.sentence).not.toContain("have had higher");
  });

  it("names Instagram in every sentence it produces", () => {
    const tuesdays = Array.from({ length: 10 }, (_, i) => post(`t${i}`, new Date(Date.UTC(2026, 5, 2 + i * 7, 18, 30)).toISOString(), 300));
    const others = Array.from({ length: 10 }, (_, i) => post(`o${i}`, new Date(Date.UTC(2026, 5, 4 + i * 7, 9, 30)).toISOString(), 40));
    expect(recommendedWindows([...tuesdays, ...others], now, "UTC").sentence).toContain("Instagram");
    const flat = Array.from({ length: 8 }, (_, i) => post(`f${i}`, `2026-06-0${i + 1}T${String(9 + i).padStart(2, "0")}:30:00Z`, 100));
    expect(recommendedWindows(flat, now, "UTC").sentence).toContain("Instagram");
  });

  it("never contains an em dash or exclamation mark", () => {
    const tuesdays = Array.from({ length: 10 }, (_, i) => post(`t${i}`, new Date(Date.UTC(2026, 5, 2 + i * 7, 18, 30)).toISOString(), 300));
    const others = Array.from({ length: 10 }, (_, i) => post(`o${i}`, new Date(Date.UTC(2026, 5, 4 + i * 7, 9, 30)).toISOString(), 40));
    const r = recommendedWindows([...tuesdays, ...others], now, "UTC");
    expect(r.sentence).not.toMatch(/[—!]/);
  });
});

describe("historySentence", () => {
  it("distinguishes no snapshot from a small sample", () => {
    expect(historySentence(null, false)).toBe(NO_HISTORY_SENTENCE);
    expect(historySentence(recommendedWindows([], now, "UTC"), true)).toBe(SMALL_SAMPLE_SENTENCE);
    expect(NO_HISTORY_SENTENCE).not.toBe(SMALL_SAMPLE_SENTENCE);
  });
  it("uses the recommendation's own sentence when there is one", () => {
    const flat = Array.from({ length: 8 }, (_, i) => post(`f${i}`, `2026-06-0${i + 1}T${String(9 + i).padStart(2, "0")}:30:00Z`, 100));
    const r = recommendedWindows(flat, now, "UTC");
    expect(historySentence(r, true)).toBe(r.sentence);
  });
  it("keeps every shared sentence free of em dashes and exclamation marks", () => {
    for (const s of [NO_HISTORY_SENTENCE, SMALL_SAMPLE_SENTENCE, YOUTUBE_NO_HISTORY_SENTENCE]) expect(s).not.toMatch(/[—!]/);
  });
});

describe("display and input helpers", () => {
  it("formats relative days in the viewer's zone", () => {
    expect(formatWhen("2026-09-21T22:15:00Z", now, NY)).toBe("Today · 6:15 PM");
    expect(formatWhen("2026-09-22T22:15:00Z", now, NY)).toBe("Tomorrow · 6:15 PM");
    expect(formatWhen("2026-09-25T22:15:00Z", now, NY)).toBe("Fri, Sep 25 · 6:15 PM");
    expect(formatWhen("2027-01-05T23:15:00Z", now, NY)).toBe("Tue, Jan 5, 2027 · 6:15 PM");
  });
  it("treats a late UTC instant as today when the zone says so", () => {
    // 03:30Z on Sep 22 is still 11:30 PM Sep 21 in New York.
    expect(formatWhen("2026-09-22T03:30:00Z", now, NY)).toBe("Today · 11:30 PM");
  });
  it("round-trips datetime-local values through the zone", () => {
    const iso = fromLocalInput("2026-09-22T18:15", NY);
    expect(iso).toBe("2026-09-22T22:15:00.000Z");
    expect(toLocalInput(iso, NY)).toBe("2026-09-22T18:15");
    expect(fromLocalInput("2026-11-03T18:15", NY)).toBe("2026-11-03T23:15:00.000Z");
  });
  it("returns empty or null for missing and partial values", () => {
    expect(toLocalInput(null, NY)).toBe("");
    expect(toLocalInput("not a date", NY)).toBe("");
    expect(fromLocalInput("", NY)).toBeNull();
    expect(fromLocalInput("2026-09-22", NY)).toBeNull();
  });
  it("converts wall-clock parts to the right instant across zones", () => {
    expect(zonedToUtc(2026, 9, 22, 18, 15, "UTC").toISOString()).toBe("2026-09-22T18:15:00.000Z");
    expect(zonedToUtc(2026, 9, 22, 18, 15, "Asia/Tokyo").toISOString()).toBe("2026-09-22T09:15:00.000Z");
  });
});
