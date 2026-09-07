import { describe, expect, it } from "vitest";
import { buildWindows, inBestWindows, MIN_POSTS } from "./postingTimes";

// Local-time posts: Tue 20:00 strong, Fri 11:00 medium, others weak.
const at = (dow: number, hour: number, i: number) => {
  const d = new Date(2026, 8, 7 + dow, hour, 15); // Sep 7 2026 is a Monday
  d.setDate(d.getDate() + 7 * i);
  return d.toISOString();
};
const mk = (dow: number, hour: number, e: number, i: number, id: string) => ({ id, t: at(dow, hour, i), e, format: "Reel" });

describe("posting windows", () => {
  it("refuses to name a time below the minimum sample", () => {
    const w = buildWindows([mk(1, 20, 900, 0, "a")]);
    expect(w.enough).toBe(false);
    expect(w.best).toEqual([]);
  });
  it("uses medians so one viral post cannot win a bucket alone", () => {
    const posts = [
      ...[0, 1, 2, 3].map((i) => mk(1, 20, 300 + i, i, `t${i}`)),   // Tue 6–9 PM: 4 posts, median ~301
      mk(3, 10, 9000, 0, "viral"),                                    // Thu 9 AM–12: one viral post
      ...[0, 1, 2].map((i) => mk(4, 11, 250 + i, i, `f${i}`)),       // Fri 9 AM–12: 3 posts
      ...[0, 1, 2].map((i) => mk(2, 14, 60 + i, i, `w${i}`)),        // Wed: weak
      ...[0, 1, 2, 3, 4, 5].map((i) => mk(6, 9, 40 + i, i, `s${i}`)), // Sun: weak
    ];
    expect(posts.length).toBeGreaterThanOrEqual(MIN_POSTS);
    const w = buildWindows(posts);
    expect(w.enough).toBe(true);
    expect(w.best[0].day).toBe(1);
    expect(w.best[0].confidence).toBe("high");
    expect(w.best.find((b) => b.postIds.includes("viral"))).toBeUndefined();
    const fri = w.best.find((b) => b.day === 4);
    expect(fri?.confidence).toBe("early");
  });
  it("counts recent posts inside the best windows", () => {
    const posts = [...[0, 1, 2, 3].map((i) => mk(1, 20, 300, i, `t${i}`)), ...[0, 1, 2, 3].map((i) => mk(6, 9, 40, i, `s${i}`))];
    const w = buildWindows(posts);
    const r = inBestWindows(posts, w, 8);
    expect(r.total).toBe(8);
    expect(r.inWindow).toBe(4);
  });
});
