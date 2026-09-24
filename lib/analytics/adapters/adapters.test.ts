import { describe, it, expect } from "vitest";
import { adaptInstagram } from "./instagram";
import { adaptYouTube } from "./youtube";
import { adaptFacebook } from "./facebook";
import { computeBaselines, multiplierFor } from "../baseline";
import type { IgSnapshot } from "../../instagramSync";
import type { YouTubeAnalytics } from "../../youtubeData";
import type { FbSnapshot } from "../../facebookSync";

// A fixed "now" is passed into adapters (never Date.now inside) so day math is
// deterministic in tests.
const NOW = new Date("2026-09-24T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe("baseline engine", () => {
  it("needs a minimum sample before an account-wide typical, and segments by format", () => {
    const few = computeBaselines([
      { format: "reel", engagement: 100 },
      { format: "reel", engagement: 200 },
    ]);
    expect(few.all).toBeUndefined(); // < minAll
    expect(multiplierFor(100, "reel", few)).toBeNull();

    const many = computeBaselines([
      { format: "reel", engagement: 100 },
      { format: "reel", engagement: 300 },
      { format: "reel", engagement: 200 },
      { format: "photo", engagement: 10 },
      { format: "photo", engagement: 20 },
      { format: "photo", engagement: 30 },
    ]);
    expect(many.all).toBeGreaterThan(0);
    expect(many.reel).toBe(200); // median of 100,300,200
    expect(many.photo).toBe(20); // median of 10,20,30
    // a reel is compared to the reel median, not the account median
    expect(multiplierFor(400, "reel", many)).toBe(2);
  });

  it("excludes unknown engagement rather than treating it as zero", () => {
    const b = computeBaselines(
      [
        { format: "reel", engagement: null },
        { format: "reel", engagement: 100 },
        { format: "reel", engagement: 100 },
        { format: "reel", engagement: 100 },
        { format: "reel", engagement: 100 },
        { format: "reel", engagement: 100 },
      ],
    );
    expect(b.all).toBe(100); // the null post didn't drag the median toward 0
  });
});

describe("YouTube adapter", () => {
  const data: YouTubeAnalytics = {
    channel: { title: "Discipline Theory", handle: "@discipline", avatar: null, subscribers: 5000, totalViews: 900000, videoCount: 42 },
    range: { views: 12000, minutes: 30000, subs: 120 },
    series: [
      { day: "2026-09-22", views: 4000, minutes: 10000, subs: 40 },
      { day: "2026-09-23", views: 8000, minutes: 20000, subs: 80 },
    ],
    topVideos: [
      { videoId: "v1", title: "A", publishedAt: daysAgo(2), thumb: null, views: 5000, likes: 300, comments: 40, durationSec: 30 },
      { videoId: "v2", title: "B", publishedAt: daysAgo(3), thumb: null, views: 7000, likes: 500, comments: 60, durationSec: 600 },
    ],
    demographics: [
      { label: "25-34", value: 55 },
      { label: "35-44", value: 45 },
    ],
    note: null,
  };

  it("emits real daily series with true-series provenance", () => {
    const n = adaptYouTube({ data, days: 7 });
    expect(n.series.views?.trueSeries).toBe(true);
    expect(n.series.views?.provenance).toBe("platform_daily");
    expect(n.series.views?.total).toBe(12000);
    expect(n.series.watch_time?.unit).toBe("minutes");
    expect(n.series.net_followers?.total).toBe(120);
  });

  it("reports subscribers as a verified snapshot and labels audience Subscribers", () => {
    const n = adaptYouTube({ data, days: 7 });
    expect(n.kpis.followers?.value).toBe(5000);
    expect(n.kpis.followers?.status).toBe("VERIFIED");
    expect(n.account.audienceLabel).toBe("Subscribers");
  });

  it("classifies shorts by duration and never emits shares or saves", () => {
    const n = adaptYouTube({ data, days: 7 });
    const v1 = n.posts.find((p) => p.id === "v1")!;
    expect(v1.format).toBe("short"); // 30s
    expect(n.posts.find((p) => p.id === "v2")!.format).toBe("video"); // 600s
    expect(v1.metrics.shares).toBeUndefined();
    expect(v1.metrics.saves).toBeUndefined();
    expect(v1.engagement).toBe(340); // 300 likes + 40 comments
  });

  it("maps age demographics and degrades honestly when analytics is empty", () => {
    const ok = adaptYouTube({ data, days: 7 });
    expect(ok.demographics.status).toBe("ok");
    expect(ok.demographics.dimensions.age?.length).toBe(2);

    const empty = adaptYouTube({ data: { ...data, range: null, series: [], demographics: [], note: "No data yet." }, days: 7 });
    expect(empty.series.views?.provenance).toBe("unavailable");
    expect(empty.series.views?.trueSeries).toBe(false);
    expect(empty.demographics.status).toBe("unavailable");
    expect(empty.demographics.reason).toBe("No data yet.");
  });
});

describe("Facebook adapter", () => {
  const snap: FbSnapshot = {
    page_id: "123",
    page_name: "Salvo's Pizza",
    username: "salvos",
    followers_count: 800,
    picture_url: null,
    posts: [
      { id: "p1", message: "Fresh slices", created_time: daysAgo(1), status_type: "added_photos", reactions: 20, comments: 5, shares: 2 },
      // a post where only reactions came back — comments/shares unknown
      { id: "p2", message: "Open late", created_time: daysAgo(2), status_type: "added_video", reactions: 10 },
    ],
    last_synced_at: NOW.toISOString(),
    status: "connected",
    capabilities: { followers: true, reactions: true, comments: true, shares: true, posts: true, views: false },
  };

  it("never fabricates views, reach, series or demographics", () => {
    const n = adaptFacebook({ snap, days: 30, now: NOW });
    expect(n.kpis.views).toBeUndefined();
    expect(n.kpis.reach).toBeUndefined();
    expect(Object.keys(n.series)).toHaveLength(0);
    expect(n.demographics.status).toBe("unavailable");
  });

  it("keeps unknown per-post metrics null, not zero", () => {
    const n = adaptFacebook({ snap, days: 30, now: NOW });
    const p2 = n.posts.find((p) => p.id === "p2")!;
    expect(p2.metrics.likes).toBe(10); // reactions present
    expect(p2.metrics.comments).toBeNull();
    expect(p2.metrics.shares).toBeNull();
    expect(p2.engagement).toBe(10); // only the known component
  });

  it("reports a verified follower snapshot and a calculated period engagement", () => {
    const n = adaptFacebook({ snap, days: 30, now: NOW });
    expect(n.kpis.followers?.value).toBe(800);
    expect(n.kpis.followers?.status).toBe("VERIFIED");
    expect(n.kpis.engagement?.value).toBe(20 + 5 + 2 + 10); // both posts in range
    expect(n.kpis.posts?.value).toBe(2);
  });
});

describe("Instagram adapter", () => {
  const media = [
    { id: "m1", caption: "Reel one", media_type: "VIDEO", like_count: 100, comments_count: 10, timestamp: daysAgo(1), insights: { views: 5000, reach: 4000, saved: 20, shares: 5 } },
    { id: "m2", caption: "Photo", media_type: "IMAGE", like_count: 40, comments_count: 4, timestamp: daysAgo(3), insights: { reach: 1000 } },
    { id: "m3", caption: "Reel two", media_type: "VIDEO", like_count: 200, comments_count: 20, timestamp: daysAgo(5), insights: { views: 8000 } },
  ];
  const snap: IgSnapshot = {
    ig_user_id: "ig1",
    username: "salvoshermitage",
    name: "Salvo's",
    followers_count: 1200,
    media_count: 3,
    biography: null,
    profile_picture_url: null,
    media,
    last_synced_at: NOW.toISOString(),
    insights_ok: true,
  };
  const daily = [
    { day: "2026-09-22", followers: 1190, reach: 3000, views: 4000, followers_gained: 5, source: "instagram_api" },
    { day: "2026-09-23", followers: 1200, reach: 4000, views: 5000, followers_gained: 10, source: "instagram_api" },
  ];
  const demographics = { status: "ok" as const, reason: null, age: [{ label: "25-34", value: 60, share: 0.6 }], gender: [], city: [{ label: "Nashville", value: 300, share: 0.5 }] };

  it("builds normalized series and renders followers as a level line", () => {
    const n = adaptInstagram({ snap, daily, demographics, days: 30, now: NOW });
    expect(n.series.followers?.render).toBe("line");
    expect(n.series.followers?.trueSeries).toBe(true);
    expect(n.series.net_followers?.trueSeries).toBe(true);
    expect(n.series.net_followers?.total).toBe(15); // 5 + 10 gained
    expect(n.series.views).toBeTruthy();
  });

  it("reports followers as verified and maps demographics", () => {
    const n = adaptInstagram({ snap, daily, demographics, days: 30, now: NOW });
    expect(n.kpis.followers?.value).toBe(1200);
    expect(n.kpis.followers?.status).toBe("VERIFIED");
    expect(n.account.audienceLabel).toBe("Followers");
    expect(n.demographics.status).toBe("ok");
    expect(n.demographics.dimensions.city?.[0].label).toBe("Nashville");
  });

  it("withholds vs-typical multipliers below the minimum sample", () => {
    const n = adaptInstagram({ snap, daily, demographics, days: 30, now: NOW });
    // only 3 posts — below minAll (5), so no baseline, no multiplier
    expect(n.posts.every((p) => p.multiplier === null)).toBe(true);
  });
});

describe("snapshot history → follower/subscriber series", () => {
  const fbSnap: FbSnapshot = {
    page_id: "123", page_name: "Salvo's", username: "salvos", followers_count: 800, picture_url: null,
    posts: [], last_synced_at: NOW.toISOString(), status: "connected",
    capabilities: { followers: true, reactions: true, comments: true, shares: true, posts: true, views: false },
  };
  it("builds a Facebook follower history line from recorded snapshots", () => {
    const history = [{ day: "2026-09-22", followers: 790 }, { day: "2026-09-23", followers: 800 }];
    const n = adaptFacebook({ snap: fbSnap, days: 30, now: NOW, history });
    expect(n.series.followers?.trueSeries).toBe(true);
    expect(n.series.followers?.provenance).toBe("snapshot");
    expect(n.series.followers?.total).toBe(800); // most recent level
  });
  it("no follower series until history exists", () => {
    const n = adaptFacebook({ snap: fbSnap, days: 30, now: NOW });
    expect(n.series.followers).toBeUndefined();
  });
});
