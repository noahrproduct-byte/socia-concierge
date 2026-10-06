import { describe, it, expect } from "vitest";
import { buildPlanOutcome, type DestinationLite } from "./planOutcomes";
import { EMPTY_SOURCES, type MeasureSources } from "./postResults";
import type { ScheduledPost } from "./scheduling";
import type { Deliverable } from "./schema";
import type { IgMediaItem } from "./instagramSync";

const NOW = new Date("2026-10-05T12:00:00Z");
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

const plan = {
  id: "plan1",
  created_at: ago(200),
  data: {
    weeklyPlan: [
      { day: "Monday", concept: "Behind the oven", hook: "h", format: "Reel", rationale: "", evidence: "", predictedPerformance: "High confidence" },
      { day: "Wednesday", concept: "Staff pick", hook: "h", format: "Carousel", rationale: "", evidence: "", predictedPerformance: "Experiment" },
      { day: "Friday", concept: "Free slices", hook: "h", format: "Reel", rationale: "", evidence: "", predictedPerformance: "High confidence" },
      { day: "Saturday", concept: "Game day", hook: "h", format: "Static", rationale: "", evidence: "", predictedPerformance: "Medium" },
    ],
  } as unknown as Deliverable,
};

const post = (over: Partial<ScheduledPost>): ScheduledPost => ({
  id: "p", user_id: "u", ig_user_id: null, plan_id: "plan1", plan_day: "Monday", scheduled_at: ago(100), caption: "c", media_type: "REELS",
  media_path: null, media_url: null, status: "draft", container_id: null, published_media_id: null, permalink: null, error: null, attempts: 0,
  created_at: ago(150), updated_at: ago(100), ...over,
});

const ig = (id: string, likes: number): IgMediaItem => ({ id, timestamp: ago(600), like_count: likes, comments_count: 0 } as IgMediaItem);
const sources: MeasureSources = { ...EMPTY_SOURCES, instagram: [ig("a", 10), ig("b", 20), ig("c", 30), ig("d", 40), ig("e", 50), ig("mon_media", 105)] };

describe("buildPlanOutcome", () => {
  const posts = [
    post({ id: "mon", plan_day: "Mon", status: "published", published_media_id: "mon_media", updated_at: ago(96) }),
    post({ id: "wed", plan_day: "Wednesday", status: "scheduled", scheduled_at: ago(-30) }),
    post({ id: "fri_old", plan_day: "Friday", status: "cancelled" }),
    post({ id: "other_plan", plan_id: "plan2", plan_day: "Saturday", status: "published", published_media_id: "x" }),
  ];
  const dests: DestinationLite[] = [];

  it("matches plan days to posts by weekday, ignores cancelled and other plans, and measures published ones", () => {
    const o = buildPlanOutcome(plan, posts, dests, sources, NOW);
    expect(o.items.map((i) => i.state)).toEqual(["published", "scheduled", "unscheduled", "unscheduled"]);
    const mon = o.items[0];
    expect(mon.postId).toBe("mon");
    expect(mon.result?.measured).toBe(true);
    expect(mon.result?.platform).toBe("instagram");
    expect(mon.result?.multiplier).toBeCloseTo(105 / 35, 5);
    expect(mon.result?.early).toBe(false);
    expect(o.summary).toMatchObject({ total: 4, onCalendar: 2, published: 1, measured: 1, skipped: ["Friday", "Saturday"] });
    expect(o.summary.best?.day).toBe("Monday");
    expect(o.summary.line).toBe("1 of 4 posted · best: Monday at 3× your median · 2 skipped");
  });

  it("uses destination rows when a post has them, and the newest post for a day", () => {
    const multi = [
      post({ id: "fri_a", plan_day: "Friday", status: "draft", created_at: ago(140) }),
      post({ id: "fri_b", plan_day: "Friday", status: "publishing", created_at: ago(120) }),
    ];
    const d: DestinationLite[] = [
      { postId: "fri_b", platform: "instagram", status: "published", externalPostId: "not_yet_synced", publishedAt: ago(5), permalink: "https://ig/x" },
      { postId: "fri_b", platform: "youtube", status: "uploading", externalPostId: null, publishedAt: null, permalink: null },
    ];
    const o = buildPlanOutcome(plan, multi, d, sources, NOW);
    const fri = o.items[2];
    expect(fri.postId).toBe("fri_b");
    expect(fri.state).toBe("publishing");
    expect(fri.results).toHaveLength(1);
    expect(fri.results[0].measured).toBe(false); // Instagram hasn't synced it: measuring, never 0
    expect(fri.result?.short).toBe("measuring");
    expect(fri.permalink).toBe("https://ig/x");
  });

  it("has no line before anything reaches the Calendar", () => {
    const o = buildPlanOutcome(plan, [], [], sources, NOW);
    expect(o.summary.onCalendar).toBe(0);
    expect(o.summary.line).toBeNull();
    expect(o.items.every((i) => i.state === "unscheduled")).toBe(true);
  });

  it("says results are still arriving when posts are out but unmeasured", () => {
    const p = [post({ id: "mon", plan_day: "Monday", status: "published", published_media_id: "unsynced", updated_at: ago(2) })];
    const o = buildPlanOutcome(plan, p, [], sources, NOW);
    expect(o.summary.line).toBe("1 of 4 posted · results still arriving · 3 skipped");
  });
});
