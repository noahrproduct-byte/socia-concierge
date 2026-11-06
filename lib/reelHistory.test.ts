import { describe, it, expect } from "vitest";
import { HISTORY_DAYS, recordReelHistory, reelDayRows } from "./reelHistory";
import type { IgMediaItem } from "./instagramSync";

const NOW = new Date("2026-11-05T12:00:00.000Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const reel = (id: string, days: number, extra: Partial<IgMediaItem> = {}): IgMediaItem => ({ id, media_type: "VIDEO", timestamp: ago(days), like_count: 40, comments_count: 3, insights: { views: 900, reach: 700, saved: 5 }, ...extra });

describe("a Reel's numbers, kept once a day", () => {
  it("writes one row per recent Reel with only what Instagram reported", () => {
    const rows = reelDayRows("u1", "ig1", [reel("a", 2), reel("b", 10, { insights: { views: 1200 } })], NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ user_id: "u1", ig_user_id: "ig1", media_id: "a", day: "2026-11-05", views: 900, reach: 700, likes: 40, comments: 3, saved: 5, shares: null });
    // A metric Instagram did not return stays null, never 0.
    expect(rows[1]).toMatchObject({ views: 1200, reach: null, saved: null, shares: null });
  });
  it("leaves out photos, collab posts from another account, Reels past their first 30 days, and a Reel with nothing reported", () => {
    const rows = reelDayRows("u1", "ig1", [
      reel("photo", 2, { media_type: "IMAGE" }), reel("collab", 2, { collab_owner: "other" }), reel("old", HISTORY_DAYS + 1),
      { id: "bare", media_type: "VIDEO", timestamp: ago(1) }, { media_type: "VIDEO", timestamp: ago(1), like_count: 2 },
    ], NOW);
    expect(rows).toEqual([]);
  });
  it("keeps the day's first observation, and never throws when the table is missing or the write fails", async () => {
    const calls: unknown[] = [];
    const ok = { from: (t: string) => ({ upsert: async (rows: unknown, opts: unknown) => { calls.push([t, rows, opts]); return { error: null }; } }) };
    expect(await recordReelHistory(ok, "u1", "ig1", [reel("a", 2)], NOW)).toBe(1);
    expect(calls[0]).toMatchObject(["reel_history", [{ media_id: "a" }], { onConflict: "user_id,ig_user_id,media_id,day", ignoreDuplicates: true }]);
    const missing = { from: () => ({ upsert: async () => ({ error: { code: "42P01" } }) }) };
    expect(await recordReelHistory(missing, "u1", "ig1", [reel("a", 2)], NOW)).toBe(0);
    const broken = { from: () => { throw new Error("down"); } };
    expect(await recordReelHistory(broken, "u1", "ig1", [reel("a", 2)], NOW)).toBe(0);
    expect(await recordReelHistory(ok, "u1", null, [reel("a", 2)], NOW)).toBe(0);
  });
});
