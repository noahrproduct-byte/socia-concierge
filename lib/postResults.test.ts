import { describe, it, expect } from "vitest";
import { measureDestination, resultLine, fmtMultiplier, EMPTY_SOURCES, MIN_SAMPLE, type MeasureSources } from "./postResults";
import type { IgMediaItem } from "./instagramSync";
import type { FbPost } from "./facebookSync";
import type { YtVideo } from "./youtube";

const NOW = new Date("2026-10-05T12:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const ig = (id: string, likes: number, comments = 0): IgMediaItem => ({ id, timestamp: ago(500), like_count: likes, comments_count: comments } as IgMediaItem);
const fb = (id: string, reactions: number, comments = 0, shares = 0): FbPost => ({ id, created_time: ago(500), reactions, comments, shares });
const yt = (videoId: string, views: number | null): YtVideo => ({ videoId, title: videoId, publishedAt: ago(500), thumb: null, views, likes: null, comments: null, durationSec: null });

const igSources: MeasureSources = { ...EMPTY_SOURCES, instagram: [ig("a", 10), ig("b", 20), ig("c", 30), ig("d", 40), ig("e", 50), ig("target", 90, 10)] };

describe("measureDestination", () => {
  it("Instagram: compares the post's interactions with the account median", () => {
    const m = measureDestination("instagram", "target", igSources);
    expect(m.found).toBe(true);
    expect(m.value).toBe(100);
    expect(m.median).toBe(35); // median of 10,20,30,40,50,100
    expect(m.multiplier).toBeCloseTo(100 / 35, 5);
    expect(m.sampleSize).toBe(6);
  });

  it("is 'not found', never zero, when the platform has not reported the post", () => {
    const m = measureDestination("instagram", "not_synced", igSources);
    expect(m.found).toBe(false);
    expect(m.value).toBeNull();
    expect(m.median).toBe(35); // the baseline is still known
  });

  it("gives no multiplier below the minimum sample", () => {
    const few: MeasureSources = { ...EMPTY_SOURCES, instagram: [ig("a", 10), ig("target", 50)] };
    const m = measureDestination("instagram", "target", few);
    expect(m.found).toBe(true);
    expect(m.multiplier).toBeNull();
    expect(m.sampleSize).toBe(2);
    expect(MIN_SAMPLE).toBe(5);
  });

  it("Facebook: reactions + comments + shares against the Page's median, ignoring uncounted posts", () => {
    const src: MeasureSources = { ...EMPTY_SOURCES, facebook: [fb("p1", 10), fb("p2", 12), fb("p3", 8), fb("p4", 20), fb("p5", 10), { id: "nocounts" }, fb("hit", 30, 5, 5)] };
    const m = measureDestination("facebook", "hit", src);
    expect(m.found).toBe(true);
    expect(m.value).toBe(40);
    expect(m.sampleSize).toBe(6);
    expect(m.median).toBe(11); // 8,10,10,12,20,40
    expect(measureDestination("facebook", "nocounts", src).found).toBe(false);
  });

  it("YouTube: views against the channel's recent uploads, excluding the video itself", () => {
    const recent = [yt("v1", 100), yt("v2", 200), yt("v3", 300), yt("v4", 400), yt("v5", 500), yt("hit", 9999)];
    const src: MeasureSources = { ...EMPTY_SOURCES, youtube: { hit: yt("hit", 900) }, youtubeRecent: recent };
    const m = measureDestination("youtube", "hit", src);
    expect(m.metric).toBe("views");
    expect(m.value).toBe(900);
    expect(m.median).toBe(300);
    expect(m.multiplier).toBe(3);
  });

  it("TikTok cannot be matched yet", () => {
    expect(measureDestination("tiktok", "x", EMPTY_SOURCES).found).toBe(false);
  });
});

describe("resultLine", () => {
  it("says measuring until the platform reports the post", () => {
    const r = resultLine(measureDestination("instagram", "missing", igSources), ago(10), NOW);
    expect(r.measured).toBe(false);
    expect(r.short).toBe("measuring");
    expect(r.text).toMatch(/hasn't reported/);
  });

  it("marks a result early inside the settling window and settled after it", () => {
    const m = measureDestination("instagram", "target", igSources);
    const early = resultLine(m, ago(30), NOW);
    expect(early.early).toBe(true);
    expect(early.short).toBe("2.9× your median so far");
    expect(early.text).toMatch(/so far \(1 day after posting\)/);
    const settled = resultLine(m, ago(100), NOW);
    expect(settled.early).toBe(false);
    expect(settled.short).toBe("2.9× your median");
    expect(settled.text).toMatch(/2\.9× your typical Instagram post — 100 interactions against a median of 35 over 6 posts/);
  });

  it("shows the raw number when there is no baseline yet", () => {
    const few: MeasureSources = { ...EMPTY_SOURCES, instagram: [ig("a", 10), ig("target", 50)] };
    const r = resultLine(measureDestination("instagram", "target", few), ago(100), NOW);
    expect(r.measured).toBe(true);
    expect(r.multiplier).toBeNull();
    expect(r.short).toBe("50 interactions");
    expect(r.text).toMatch(/needs 5 Instagram posts/);
  });

  it("formats multipliers readably", () => {
    expect(fmtMultiplier(2.14)).toBe("2.1×");
    expect(fmtMultiplier(1)).toBe("1×");
    expect(fmtMultiplier(0.05)).toBe("0.05×");
    expect(fmtMultiplier(17.6)).toBe("18×");
  });
});
