import { describe, expect, it } from "vitest";
import { pickViral } from "./viralPick";
import type { ProvenReel } from "./trendSignals";

const reel = (url: string, handle: string, proven: boolean, extra: Partial<ProvenReel> = {}): ProvenReel => ({
  url, platform: "instagram", accountName: handle, accountHandle: handle, accountAvatar: null, title: "a title", thumb: "https://cdn/x.jpg",
  publishedAt: "2026-11-10T00:00:00Z", views: 50_000, likes: 900, comments: 40, multiplier: 6, basis: "views", format: "Reel",
  id: url, proven, line: null, structures: [], topics: [], ...extra,
});
const base = { nicheAccess: true, nicheUpgrade: null, lastRun: "2026-11-18T00:00:00Z", niche: "coffee", now: "2026-11-19T00:00:00Z" };

describe("Going viral in your niche", () => {
  it("shows only Reels that took off, competitors first, one per account, at most four", () => {
    const d = pickViral({
      ...base,
      reelsToCopy: [reel("c1", "acme", true), reel("c2", "acme", true), reel("c3", "beta", false), reel("c4", "gamma", true)],
      nicheReels: [reel("n1", "delta", true), reel("n2", "eps", true), reel("n3", "zeta", true)],
    });
    expect(d.reels.map((r) => [r.url, r.from])).toEqual([["c1", "competitor"], ["c4", "competitor"], ["n1", "niche"], ["n2", "niche"]]);
  });
  it("is empty, never padded, when nothing took off", () => {
    expect(pickViral({ ...base, reelsToCopy: [reel("c1", "a", false)], nicheReels: [] }).reels).toEqual([]);
  });
  it("shows nothing on a plan without niche intelligence, and says so", () => {
    const d = pickViral({ ...base, nicheAccess: false, nicheUpgrade: "/pricing?plan=starter", reelsToCopy: [reel("c1", "a", true)], nicheReels: [] });
    expect(d).toMatchObject({ access: false, upgrade: "/pricing?plan=starter", reels: [] });
  });
});
