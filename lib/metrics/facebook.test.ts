import { describe, it, expect } from "vitest";
import { buildFacebookAnalytics, fbPostEngagement } from "./facebook";
import type { FbSnapshot, FbPost } from "../facebookSync";
import type { PlatformSnapshotRow } from "../platformSnapshots";
import type { FbInsights, FbInsightPoint } from "../facebookInsights";

const NOW = new Date("2026-09-30T12:00:00Z");
const DAY = 86400000;
const dayStr = (d: Date) => d.toISOString().slice(0, 10);
const ago = (n: number) => dayStr(new Date(NOW.getTime() - n * DAY));

const snap = (over: Partial<FbSnapshot> = {}): FbSnapshot => ({
  page_id: "p1",
  page_name: "Salvo's Hermitage",
  username: "salvos",
  followers_count: 1200,
  picture_url: null,
  posts: [],
  last_synced_at: NOW.toISOString(),
  status: "connected",
  capabilities: { followers: true, reactions: true, comments: true, shares: true, posts: true, views: false },
  ...over,
});

let seq = 0;
const post = (over: Partial<FbPost> = {}): FbPost => ({
  id: `x${++seq}`,
  message: "A post",
  created_time: "2026-09-28T10:00:00Z",
  permalink_url: "https://facebook.com/x",
  ...over,
});

const snapRow = (d: string, followers: number | null): PlatformSnapshotRow => ({
  day: d, followers, views: null, followers_gained: null, watch_time_minutes: null, source: "socia_snapshot",
});

/** `cur` per day for the last 30 days, `prev` per day for the 30 before. */
const daily = (cur: number, prev: number): FbInsightPoint[] => {
  const out: FbInsightPoint[] = [];
  for (let i = 60; i >= 1; i--) out.push({ day: ago(i), value: i <= 30 ? cur : prev });
  return out;
};
const insights = (over: Partial<FbInsights> = {}): FbInsights => ({
  available: true,
  views: daily(10, 5),
  videoViews: daily(2, 1),
  dailyFollows: daily(3, 2),
  dailyUnfollows: daily(1, 1),
  postEngagements: null,
  ...over,
});

const build = (s: FbSnapshot, extra: { snapshots?: PlatformSnapshotRow[]; insights?: FbInsights | null } = {}) =>
  buildFacebookAnalytics({ snap: s, snapshots: extra.snapshots ?? [], days: 30, rangeLabel: "Last 30 days", now: NOW, insights: extra.insights });

describe("fbPostEngagement", () => {
  it("sums only the counts Facebook returned, and is null when it returned none", () => {
    expect(fbPostEngagement(post({ reactions: 10, comments: 3, shares: 2 }))).toBe(15);
    expect(fbPostEngagement(post({ reactions: 10 }))).toBe(10);
    expect(fbPostEngagement(post({}))).toBeNull(); // no counts → unavailable, never 0
    expect(fbPostEngagement(post({ shares: 0 }))).toBe(0); // a real 0 is kept
  });
});

describe("buildFacebookAnalytics — followers", () => {
  it("builds a real snapshot series and the net change inside the range", () => {
    const d = build(snap(), { snapshots: [snapRow("2026-09-25", 1180), snapRow("2026-09-28", 1195), snapRow("2026-09-30", 1200)] });
    expect(d.followers.provenance).toBe("snapshot");
    expect(d.followers.total).toBe(1200);
    expect(d.followerStats.net).toBe(20);
    const k = d.kpis.find((x) => x.key === "followers")!;
    expect(k.value).toBe("1,200");
    expect(k.delta).toBe("↑ 20");
    expect(d.followerPoints).toHaveLength(3);
  });

  it("stays honest with no history yet: count shown as collecting, no invented trend", () => {
    const d = build(snap());
    expect(d.followers.provenance).toBe("unavailable");
    expect(d.followers.note).toMatch(/builds from here/i);
    const k = d.kpis.find((x) => x.key === "followers")!;
    expect(k.value).toBe("1,200");
    expect(k.status).toBe("collecting");
    expect(k.delta).toBeNull();
  });

  it("uses Facebook's own follows and unfollows for NET follows when Insights serve them", () => {
    const d = build(snap(), { insights: insights() });
    expect(d.newFollows).toBe(90);
    expect(d.unfollows).toBe(30);
    expect(d.netFollows).toBe(60);
    expect(d.kpis.find((x) => x.key === "followers")!.note).toMatch(/\+90 new follows/);
    expect(d.changes.find((c) => c.key === "follows")).toMatchObject({ label: "Net follows", current: "+60", previous: "+30" });
  });
});

describe("buildFacebookAnalytics — Page views from Insights (read_insights)", () => {
  it("builds the daily series, the previous period and a real delta", () => {
    const d = build(snap(), { insights: insights() });
    expect(d.views?.provenance).toBe("platform_daily");
    expect(d.views?.total).toBe(300);
    expect(d.views?.prevTotal).toBe(150);
    const k = d.kpis.find((x) => x.key === "views")!;
    expect(k.value).toBe("300");
    expect(k.delta).toBe("↑ 100%");
    expect(d.videoViews).toBe(60);
    expect(d.insightsAvailable).toBe(true);
    expect(d.unavailable.map((u) => u.label).join(" ")).not.toMatch(/Page & video views/);
  });

  it("without read_insights: views stay null and are explicitly unavailable, never 0", () => {
    const d = build(snap(), { insights: { available: false, views: null, videoViews: null, dailyFollows: null, dailyUnfollows: null, postEngagements: null } });
    expect(d.views).toBeNull();
    expect(d.kpis.find((x) => x.key === "views")).toBeUndefined();
    expect(d.kpis.find((x) => x.key === "avg")).toBeDefined(); // the tile falls back to a metric we do have
    expect(d.unavailable.find((u) => /views/i.test(u.label))?.why).toMatch(/read_insights/);
    expect(d.weeks.median).toBeNull();
  });

  it("always says reach/impressions and audience demographics are not available", () => {
    const labels = build(snap()).unavailable.map((u) => u.label.toLowerCase()).join(" | ");
    expect(labels).toMatch(/reach/);
    expect(labels).toMatch(/audience/);
  });
});

describe("buildFacebookAnalytics — posts against the Page's own median", () => {
  const posts = [
    post({ id: "big", reactions: 300, comments: 40, shares: 60, full_picture: "https://x/p.jpg" }),
    post({ id: "a", reactions: 20, comments: 2, shares: 1 }),
    post({ id: "b", reactions: 18, comments: 3, shares: 1 }),
    post({ id: "c", reactions: 22, comments: 1, shares: 0 }),
    post({ id: "d", reactions: 4, comments: 0, shares: 0 }),
    post({ id: "none" }),
  ];

  it("places engagement on the publish day as content totals, with the posts behind each bar", () => {
    const d = build(snap({ posts }));
    expect(d.engagement.provenance).toBe("publish_totals");
    const pt = d.engagement.current.find((p) => p.day === "2026-09-28")!;
    expect(pt.value).toBe(400 + 23 + 22 + 23 + 4);
    expect(pt.postIds).toContain("big");
  });

  it("ranks posts, keeps unknown-engagement posts last, and scores each against the median", () => {
    const d = build(snap({ posts }));
    expect(d.posts[0].id).toBe("big");
    expect(d.posts[d.posts.length - 1].id).toBe("none");
    expect(d.posts.find((p) => p.id === "none")!.engagement).toBeNull();
    expect(d.medianEngagement).toBe(23);
    expect(d.posts[0].multiplier).toBeCloseTo(400 / 23, 5);
    expect(d.posts.find((p) => p.id === "none")!.multiplier).toBeNull();
  });

  it("raises a breakout insight with the post as evidence and a next step", () => {
    const d = build(snap({ posts }));
    const b = d.insights.find((i) => i.id === "breakout")!;
    expect(b.postIds).toEqual(["big"]);
    expect(d.nextSteps[0]).toMatch(/follow-up/i);
    expect(d.evidence.find((e) => e.id === "big")?.platform).toBe("facebook");
  });

  it("reports the reactions / comments / shares mix and the share insight", () => {
    const d = build(snap({ posts }));
    expect(d.mix).toMatchObject({ reactions: 364, comments: 46, shares: 62 });
    expect(d.mix.types).toBeNull(); // no per-type breakdown returned → not invented
    const typed = build(snap({ posts: [post({ reactions: 10, reactionTypes: { like: 7, love: 3 } })] }));
    expect(typed.mix.types?.map((t) => `${t.label}:${t.value}`)).toEqual(["Like:7", "Love:3"]);
  });

  it("reports engagement unavailable (not zero) when no post has any counts", () => {
    const d = build(snap({ posts: [post({})] }));
    expect(d.engagement.provenance).toBe("unavailable");
    expect(d.engagement.note).toMatch(/pages_read_user_content/);
    expect(d.kpis.find((x) => x.key === "engagement")!.value).toBe("—");
  });

  it("compares with the previous period only when the fetched posts cover it", () => {
    const covered = build(snap({ posts: [
      post({ created_time: `${ago(5)}T10:00:00Z`, reactions: 30 }),
      post({ created_time: `${ago(40)}T10:00:00Z`, reactions: 10 }),
    ] }));
    expect(covered.kpis.find((x) => x.key === "engagement")!.delta).toBe("↑ 200%");
    expect(covered.changes.find((c) => c.key === "posts")).toMatchObject({ current: "1", previous: "1" });

    // 100 posts all inside the current window: Facebook's per-sync maximum, so
    // the previous period is unknown — no delta is shown.
    const capped = build(snap({ posts: Array.from({ length: 100 }, () => post({ created_time: `${ago(3)}T10:00:00Z`, reactions: 5 })) }));
    expect(capped.publishing.capped).toBe(true);
    expect(capped.kpis.find((x) => x.key === "engagement")!.delta).toBeNull();
    expect(capped.changes.find((c) => c.key === "posts")!.previous).toBeNull();
  });
});
