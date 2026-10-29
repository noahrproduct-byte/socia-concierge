import { describe, it, expect } from "vitest";
import { buildBriefing, currentFor, type Extras } from "./briefing";
import type { PlatformSummary } from "./metrics/allPlatforms";
import type { Goal } from "./growth";

const row = (over: Partial<PlatformSummary>): PlatformSummary => ({
  platform: "instagram", connected: false, label: "Instagram", audience: null, audienceLabel: "followers", views: null, viewsNote: null, engagement: null, contentPublished: null, ...over,
});
const ig = row({ connected: true, label: "@salvos", audience: 1200, views: 34000, contentPublished: 9 });
const yt = row({ platform: "youtube", connected: true, label: "Salvo's", audience: 300, audienceLabel: "subscribers", views: 5000 });
const fb = row({ platform: "facebook", label: "Facebook" });
const tt = row({ platform: "tiktok", label: "TikTok" });
const X: Extras = { days: 30, igEngagementRate: 3.2, igPostsPerWeek: 2.1, ttPostsPerWeek: null };
const goal = (over: Partial<Goal>): Goal => ({ id: "g1", kind: "primary", metric: "followers", platforms: ["instagram"], baseline: null, target: 2000, due_date: null, ...over });

describe("currentFor", () => {
  it("adds up platforms for counts", () => {
    expect(currentFor(goal({ platforms: ["instagram", "youtube"] }), [ig, yt, fb, tt], X)).toEqual({ value: 1500, why: null });
    expect(currentFor(goal({ metric: "views_30d", platforms: ["instagram", "youtube"] }), [ig, yt], X).value).toBe(39000);
  });

  it("says why a number can't be read instead of returning zero", () => {
    expect(currentFor(goal({ platforms: ["tiktok"] }), [ig, tt], X)).toEqual({ value: null, why: "TikTok isn't connected." });
    expect(currentFor(goal({ metric: "bookings", platforms: [] }), [ig], X).why).toMatch(/You report this/);
    expect(currentFor(goal({ metric: "views_30d" }), [ig], { ...X, days: 7 })).toEqual({ value: null, why: "Your plan shows 7 days of history, not 30." });
  });

  it("reads engagement rate and cadence from the extras", () => {
    expect(currentFor(goal({ metric: "engagement_rate" }), [ig], X).value).toBe(3.2);
    expect(currentFor(goal({ metric: "posts_per_week" }), [ig], X).value).toBe(2.1);
  });
});

describe("buildBriefing", () => {
  const base = { days: 30, growth: null, trackedCompetitors: 0, hasPlan: false };

  it("reports real numbers, what's missing, and at most three actions", () => {
    const g = goal({ baseline: 1200 });
    const b = buildBriefing({ ...base, rows: [ig, fb, yt, tt], goals: [g], currents: new Map([["g1", { value: 1200, why: null }]]) });
    expect(b.learned[0]).toBe("Instagram (@salvos): 1,200 followers, 34,000 views in the last 30 days, 9 posts in the last 30 days.");
    expect(b.missing).toContain("Facebook isn't connected.");
    expect(b.actions.map((a) => a.label)).toEqual(["Make your first weekly plan", "Add two accounts to watch", "Schedule your next post"]);
    expect(b.guidance).toHaveLength(1);
  });

  it("with nothing connected, says so and leads with connecting", () => {
    const b = buildBriefing({ ...base, rows: [row({}), fb], goals: [], currents: new Map() });
    expect(b.learned).toEqual([]);
    expect(b.missing[0]).toMatch(/No account is connected/);
    expect(b.actions[0].label).toBe("Connect an account");
    expect(b.actions[1].label).toBe("Set a goal");
  });

  it("asks to connect the platform a goal is measured on", () => {
    const b = buildBriefing({ ...base, hasPlan: true, rows: [ig, tt], goals: [goal({ platforms: ["tiktok"] })], currents: new Map([["g1", { value: null, why: "TikTok isn't connected." }]]) });
    expect(b.actions[0]).toMatchObject({ label: "Connect TikTok" });
    expect(b.missing).toContain("Followers or subscribers: TikTok isn't connected.");
  });
});
