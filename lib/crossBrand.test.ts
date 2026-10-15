import { describe, it, expect } from "vitest";
import { buildBrandRow, MIN_BASELINE, type BrandInput } from "./crossBrand";
import type { PostCard } from "./overview";
import type { FacebookAnalyticsData, FbPostRow } from "./metrics/facebook";
import type { YouTubeAnalytics } from "./youtubeData";
import type { TtVideo } from "./tiktokAuth";

const NOW = new Date("2026-10-14T12:00:00Z").getTime();
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
const card = (id: string, daysAgo: number, multiplier: number | null): PostCard => ({
  id, title: `Post ${id}`, caption: "", published: ago(daysAgo), format: "Reel", platform: "instagram", isVideo: true,
  views: null, reach: null, likes: null, comments: null, saves: null, shares: null, engagements: 10, multiplier, thumb: null, permalink: `https://instagram.com/p/${id}`,
});
const base = (over: Partial<BrandInput> = {}): BrandInput => ({ id: "w1", name: "Salvo's", active: true, now: NOW, days: 30, instagram: null, facebook: null, youtube: null, tiktok: null, ...over });

describe("buildBrandRow", () => {
  it("measures Instagram growth from daily counts and the typical post against the brand's own median", () => {
    const row = buildBrandRow(base({
      instagram: {
        handle: "salvos", followers: 1200, baselineSample: 20,
        posts: [card("a", 2, 1.4), card("b", 9, 0.8), card("c", 20, 1.1), card("old", 60, 5)],
        daily: [{ day: ago(40).slice(0, 10), followers: 900 }, { day: ago(29).slice(0, 10), followers: 1100 }, { day: ago(1).slice(0, 10), followers: 1180 }],
      },
    }));
    const ig = row.platforms[0];
    expect(ig).toMatchObject({ platform: "instagram", account: "@salvos", audience: 1200, posts: 3 });
    expect(ig.growth).toEqual({ value: 80, kind: "net", note: null }); // the 40-day-old count is outside the window
    expect(ig.typical).toEqual({ multiplier: 1.1, metric: "interactions", note: null });
    expect(row.best).toMatchObject({ platform: "instagram", title: "Post a", multiplier: 1.4 }); // the 60-day-old 5x is outside the window
    expect(row.postsTotal).toBe(3);
  });

  it("says why instead of guessing when there's too little to go on", () => {
    const few = buildBrandRow(base({ instagram: { handle: null, followers: 50, baselineSample: 20, posts: [card("a", 2, 2)], daily: [] } }));
    expect(few.platforms[0].growth.value).toBeNull();
    expect(few.platforms[0].growth.note).toContain("fewer than two daily follower counts");
    expect(few.platforms[0].typical).toMatchObject({ multiplier: null, note: "Fewer than 3 posts in this window." });
    const young = buildBrandRow(base({ instagram: { handle: null, followers: 50, baselineSample: MIN_BASELINE - 1, posts: [card("a", 2, 2), card("b", 3, 2), card("c", 4, 2)], daily: [] } }));
    expect(young.platforms[0].typical.note).toContain(`at least ${MIN_BASELINE} posts`);
    expect(young.best).toBeNull();
  });

  it("uses Facebook's net follower change and post multipliers", () => {
    const post = (id: string, daysAgo: number, m: number | null): FbPostRow => ({ id, title: `FB ${id}`, permalink: null, thumb: null, published: ago(daysAgo), hasImage: false, reactions: 1, comments: 1, shares: 1, engagement: 3, multiplier: m });
    const data = { posts: [post("1", 3, 2.5), post("2", 5, 1), post("3", 8, 0.5), post("4", 50, 1), post("5", 60, 1)], postsInRange: 3, followerStats: { now: 400, net: -4, growthPct: -1, days: 30, firstDay: null } } as unknown as FacebookAnalyticsData;
    const row = buildBrandRow(base({ facebook: { name: "Salvo's Page", followers: 400, data } }));
    expect(row.platforms[0]).toMatchObject({ platform: "facebook", growth: { value: -4, kind: "net" }, posts: 3, typical: { multiplier: 1, metric: "engagement" } });
    expect(row.best).toMatchObject({ platform: "facebook", multiplier: 2.5 });
  });

  it("labels YouTube's subscribers as gained and leaves its per-video comparison to the YouTube tab", () => {
    const yt = { channel: { title: "Salvo's TV", subscribers: 820 }, range: { views: 1000, minutes: 50, subs: 30 } } as unknown as YouTubeAnalytics;
    const p = buildBrandRow(base({ youtube: yt })).platforms[0];
    expect(p).toMatchObject({ platform: "youtube", audience: 820, audienceLabel: "subscribers", growth: { value: 30, kind: "gained" }, posts: null, typical: { multiplier: null } });
    expect(p.growth.note).toContain("not net");
  });

  it("measures TikTok videos by views against the account's own median and never claims follower growth", () => {
    const v = (id: string, daysAgo: number, views: number): TtVideo => ({ id, createdAt: ago(daysAgo), cover: null, url: `https://tiktok.com/v/${id}`, caption: `Clip ${id}`, durationSec: 20, views, likes: 0, comments: 0, shares: 0 });
    const videos = [v("1", 2, 900), v("2", 4, 300), v("3", 6, 300), v("4", 40, 300), v("5", 50, 300), v("6", 70, 300)];
    const row = buildBrandRow(base({ tiktok: { username: "salvos", followers: 2000, videos, videosInRange: 3 } }));
    expect(row.platforms[0]).toMatchObject({ platform: "tiktok", growth: { value: null }, posts: 3, typical: { multiplier: 1, metric: "views" } });
    expect(row.best).toMatchObject({ platform: "tiktok", title: "Clip 1", multiplier: 3, metric: "views" });
  });

  it("picks the brand's best post across platforms and totals its posts", () => {
    const row = buildBrandRow(base({
      instagram: { handle: "a", followers: 1, baselineSample: 10, posts: [card("ig", 2, 1.8), card("x", 3, 1), card("y", 4, 1)], daily: [] },
      tiktok: { username: "a", followers: 1, videosInRange: 2, videos: [
        { id: "t1", createdAt: ago(1), cover: null, url: null, caption: "Big one", durationSec: 1, views: 1000, likes: 0, comments: 0, shares: 0 },
        ...[2, 3, 4, 5, 6].map((i) => ({ id: `t${i}`, createdAt: ago(40 + i), cover: null, url: null, caption: "", durationSec: 1, views: 100, likes: 0, comments: 0, shares: 0 })),
      ] },
    }));
    expect(row.best).toMatchObject({ platform: "tiktok", multiplier: 10 });
    expect(row.postsTotal).toBe(5);
  });

  it("shows a brand with nothing connected as empty, not as zeros", () => {
    expect(buildBrandRow(base())).toEqual({ id: "w1", name: "Salvo's", active: true, platforms: [], postsTotal: 0, best: null });
  });
});
