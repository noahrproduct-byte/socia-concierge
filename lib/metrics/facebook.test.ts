import { describe, it, expect } from "vitest";
import { buildFacebookAnalytics, fbPostEngagement } from "./facebook";
import type { FbSnapshot, FbPost } from "../facebookSync";
import type { PlatformSnapshotRow } from "../platformSnapshots";

const NOW = new Date("2026-09-30T12:00:00Z");
const day = (d: string): string => d;

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

const post = (over: Partial<FbPost> = {}): FbPost => ({
  id: "x",
  message: "A post",
  created_time: "2026-09-28T10:00:00Z",
  permalink_url: "https://facebook.com/x",
  ...over,
});

const snapRow = (d: string, followers: number | null): PlatformSnapshotRow => ({
  day: day(d), followers, views: null, followers_gained: null, watch_time_minutes: null, source: "socia_snapshot",
});

describe("fbPostEngagement", () => {
  it("sums only the counts Facebook returned, and is null when it returned none", () => {
    expect(fbPostEngagement(post({ reactions: 10, comments: 3, shares: 2 }))).toBe(15);
    expect(fbPostEngagement(post({ reactions: 10 }))).toBe(10);
    expect(fbPostEngagement(post({}))).toBeNull(); // no counts → unavailable, never 0
    expect(fbPostEngagement(post({ shares: 0 }))).toBe(0); // a real 0 is kept
  });
});

describe("buildFacebookAnalytics — follower trend from SOCIA's own snapshots", () => {
  it("is a real snapshot series with the last value as the total", () => {
    const d = buildFacebookAnalytics({
      snap: snap(),
      snapshots: [snapRow("2026-09-25", 1180), snapRow("2026-09-28", 1195), snapRow("2026-09-30", 1200)],
      days: 30, rangeLabel: "Last 30 days", now: NOW,
    });
    expect(d.followers.provenance).toBe("snapshot");
    expect(d.followers.total).toBe(1200);
    expect(d.followers.current.some((p) => p.value === 1195)).toBe(true);
    expect(d.stats.find((s) => s.key === "followers")?.status).toBe("ok");
  });

  it("stays honest with no history yet: unavailable series, follower count still shown as collecting", () => {
    const d = buildFacebookAnalytics({ snap: snap(), snapshots: [], days: 30, rangeLabel: "Last 30 days", now: NOW });
    expect(d.followers.provenance).toBe("unavailable");
    expect(d.followers.note).toMatch(/builds from here/i);
    const f = d.stats.find((s) => s.key === "followers")!;
    expect(f.value).toBe("1,200");
    expect(f.status).toBe("collecting"); // count known, trend not yet — never "0"
  });
});

describe("buildFacebookAnalytics — engagement by publish date", () => {
  it("places each post's engagement on its publish day as content totals (bars)", () => {
    const d = buildFacebookAnalytics({
      snap: snap({ posts: [post({ created_time: "2026-09-28T10:00:00Z", reactions: 10, comments: 5, shares: 1 })] }),
      snapshots: [], days: 30, rangeLabel: "Last 30 days", now: NOW,
    });
    expect(d.engagement.provenance).toBe("publish_totals");
    expect(d.engagement.total).toBe(16);
    expect(d.engagement.current.find((p) => p.day === "2026-09-28")?.value).toBe(16);
  });

  it("reports engagement unavailable (not zero) when no post has any counts", () => {
    const d = buildFacebookAnalytics({
      snap: snap({ posts: [post({ created_time: "2026-09-28T10:00:00Z" })] }),
      snapshots: [], days: 30, rangeLabel: "Last 30 days", now: NOW,
    });
    expect(d.engagement.provenance).toBe("unavailable");
    expect(d.engagement.note).toMatch(/pages_read_user_content/);
    expect(d.stats.find((s) => s.key === "engagement")?.value).toBe("—");
  });
});

describe("buildFacebookAnalytics — top posts + honesty", () => {
  it("ranks posts by engagement and keeps null-engagement posts last", () => {
    const d = buildFacebookAnalytics({
      snap: snap({ posts: [
        post({ id: "low", reactions: 2 }),
        post({ id: "high", reactions: 50, comments: 10 }),
        post({ id: "none" }),
      ] }),
      snapshots: [], days: 30, rangeLabel: "Last 30 days", now: NOW,
    });
    expect(d.topPosts[0].id).toBe("high");
    expect(d.topPosts[d.topPosts.length - 1].id).toBe("none");
    expect(d.topPosts.find((p) => p.id === "none")?.engagement).toBeNull();
  });

  it("always lists reach/impressions and views as explicitly unavailable", () => {
    const d = buildFacebookAnalytics({ snap: snap(), snapshots: [], days: 30, rangeLabel: "Last 30 days", now: NOW });
    const labels = d.unavailable.map((u) => u.label.toLowerCase()).join(" ");
    expect(labels).toMatch(/reach/);
    expect(labels).toMatch(/views/);
  });
});
