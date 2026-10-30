import { describe, it, expect } from "vitest";
import { dailyRecommendations, planWeekStart, MAX_RECS, type TodayFacts, type TodayPost } from "./dailyRecs";
import { pickBreakout, todayPosts } from "./dailyRecsLoad";
import type { TimedPost } from "./postingTimes";
import type { ScheduledPost } from "./scheduling";
import type { IgMediaItem } from "./instagramSync";

const TZ = "America/Chicago";
// Monday 12 Oct 2026, 3:00 PM in Chicago (CDT, UTC-5).
const NOW = new Date("2026-10-12T20:00:00Z");
const dayNumOf = (iso: string) => Math.floor(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000);

const empty = (over: Partial<TodayFacts> = {}): TodayFacts => ({ plan: null, posts: [], timed: null, comments: null, breakout: null, studio: null, ...over });
let n = 0;
const post = (over: Partial<TodayPost>): TodayPost => ({ id: `p${++n}`, at: NOW.toISOString(), status: "scheduled", planId: null, planDay: null, title: "Fall menu drop", hasMedia: true, image: false, ...over });
// Something scheduled tomorrow keeps the "nothing in the next 3 days" line out of tests about other things.
const tomorrow = () => post({ at: "2026-10-13T23:00:00Z", title: "Tuesday post" });
const kinds = (f: TodayFacts) => dailyRecommendations(f, NOW, TZ).recs.map((r) => r.kind);

describe("planWeekStart", () => {
  it("treats a plan made Monday to Wednesday as this week's and Thursday to Sunday as next week's", () => {
    expect(planWeekStart("2026-10-12T14:00:00Z", TZ)).toBe(dayNumOf("2026-10-12")); // Mon
    expect(planWeekStart("2026-10-14T14:00:00Z", TZ)).toBe(dayNumOf("2026-10-12")); // Wed
    expect(planWeekStart("2026-10-08T14:00:00Z", TZ)).toBe(dayNumOf("2026-10-12")); // Thu, previous week
    expect(planWeekStart("2026-10-11T14:00:00Z", TZ)).toBe(dayNumOf("2026-10-12")); // Sun
    expect(planWeekStart("2026-10-01T14:00:00Z", TZ)).toBe(dayNumOf("2026-10-05")); // Thu, two weeks back
  });

  it("reads the creation day in the viewer's zone", () => {
    // 2:00 AM UTC Thursday is still Wednesday evening in Chicago: this week's plan.
    expect(planWeekStart("2026-10-15T02:00:00Z", TZ)).toBe(dayNumOf("2026-10-12"));
  });
});

describe("dailyRecommendations: posts", () => {
  it("puts a failed post first", () => {
    const s = dailyRecommendations(empty({ posts: [tomorrow(), post({ status: "failed", at: "2026-10-11T23:00:00Z", title: "Sunday special" })] }), NOW, TZ);
    expect(s.recs[0].kind).toBe("failed");
    expect(s.recs[0].tone).toBe("urgent");
    expect(s.recs[0].detail).toContain("“Sunday special” was due yesterday at 6:00 PM");
  });

  it("ignores failures older than a week", () => {
    expect(kinds(empty({ posts: [tomorrow(), post({ status: "failed", at: "2026-10-01T23:00:00Z" })] }))).not.toContain("failed");
  });

  it("flags today's draft that has no media", () => {
    const s = dailyRecommendations(empty({ posts: [tomorrow(), post({ status: "draft", hasMedia: false, at: "2026-10-12T23:00:00Z", planId: "plan1", planDay: "Monday" })] }), NOW, TZ);
    const r = s.recs.find((x) => x.kind === "today_post")!;
    expect(r.title).toBe("Today's post has no video yet");
    expect(r.detail).toBe("From your Content Plan: “Fall menu drop” is set for 6:00 PM. Attach the video and schedule it, or nothing publishes.");
    expect(r.cta).toBe("Add the video");
  });

  it("says when today's draft has media but was never scheduled, and when its time has passed", () => {
    const s = dailyRecommendations(empty({ posts: [tomorrow(), post({ status: "draft", image: true, at: "2026-10-12T15:00:00Z" })] }), NOW, TZ);
    const r = s.recs.find((x) => x.kind === "today_post")!;
    expect(r.title).toBe("Today's post isn't scheduled yet");
    expect(r.detail).toContain("was set for 10:00 AM and hasn't gone out");
  });

  it("confirms today's scheduled post, ranked after things to do", () => {
    const s = dailyRecommendations(empty({
      posts: [post({ at: "2026-10-12T23:00:00Z" }), tomorrow()],
      comments: { waiting: 2, oldestAt: "2026-10-09T15:00:00Z" },
    }), NOW, TZ);
    expect(s.recs.map((r) => r.kind)).toEqual(["comments", "today_post"]);
    expect(s.recs[1]).toMatchObject({ tone: "ok", title: "Today's post goes out at 6:00 PM" });
  });

  it("does not call tomorrow's post today's (by the viewer's calendar, not UTC)", () => {
    // 1:00 AM UTC Tuesday is 8:00 PM Monday in Chicago: today.
    expect(kinds(empty({ posts: [post({ at: "2026-10-13T01:00:00Z" }), tomorrow()] }))).toContain("today_post");
    // 6:00 AM UTC Tuesday is 1:00 AM Tuesday in Chicago: tomorrow.
    expect(kinds(empty({ posts: [post({ at: "2026-10-13T06:00:00Z" })] }))).not.toContain("today_post");
  });
});

describe("dailyRecommendations: Content Plan", () => {
  const plan = (createdAt: string) => ({ id: "plan1", createdAt, items: [
    { day: "Monday", concept: "Behind the counter at opening", format: "Reel" },
    { day: "Wednesday", concept: "Customer question of the week", format: "Carousel" },
  ] });

  it("names today's plan item when it isn't on the Calendar", () => {
    const s = dailyRecommendations(empty({ plan: plan("2026-10-12T13:00:00Z"), posts: [tomorrow()] }), NOW, TZ);
    const r = s.recs.find((x) => x.kind === "plan_item")!;
    expect(r.detail).toBe("“Behind the counter at opening” (Reel). It isn't on your Calendar, so nothing is set to go out for it.");
    expect(r.href).toBe("/plan");
  });

  it("stays quiet when that day is on the Calendar, even on another date", () => {
    const onCal = post({ planId: "plan1", planDay: "Mon", at: "2026-10-19T23:00:00Z" });
    expect(kinds(empty({ plan: plan("2026-10-12T13:00:00Z"), posts: [onCal, tomorrow()] }))).not.toContain("plan_item");
  });

  it("stays quiet for a plan that belongs to another week", () => {
    expect(kinds(empty({ plan: plan("2026-10-01T13:00:00Z"), posts: [tomorrow()] }))).not.toContain("plan_item");
    expect(kinds(empty({ plan: plan("2026-10-15T13:00:00Z"), posts: [tomorrow()] }))).not.toContain("plan_item");
  });

  it("only matches real weekdays", () => {
    const p = { id: "plan1", createdAt: "2026-10-12T13:00:00Z", items: [{ day: "Day 1", concept: "Launch", format: "Reel" }] };
    expect(kinds(empty({ plan: p, posts: [tomorrow()] }))).not.toContain("plan_item");
  });
});

describe("dailyRecommendations: comments, gaps, windows", () => {
  it("counts comment replies waiting and dates the oldest", () => {
    const r = dailyRecommendations(empty({ posts: [tomorrow()], comments: { waiting: 1, oldestAt: "2026-10-09T15:00:00Z" } }), NOW, TZ).recs[0];
    expect(r.title).toBe("1 comment waiting for a reply");
    expect(r.detail).toBe("SOCIA drafted a reply; nothing is sent until you approve it. The oldest comment is from 3 days ago.");
    expect(kinds(empty({ posts: [tomorrow()], comments: { waiting: 0, oldestAt: null } }))).toEqual([]);
    expect(kinds(empty({ posts: [tomorrow()], comments: null }))).toEqual([]);
  });

  it("says when nothing is set to publish in the next three days, counting drafts", () => {
    const s = dailyRecommendations(empty({ posts: [post({ status: "draft", at: "2026-10-14T23:00:00Z" }), post({ at: "2026-10-16T23:00:00Z" })] }), NOW, TZ);
    const r = s.recs.find((x) => x.kind === "gap")!;
    expect(r.title).toBe("Nothing is set to publish in the next 3 days");
    expect(r.detail).toBe("1 draft in that time isn't scheduled.");
    expect(r.href).toBe("/create");
  });

  it("doesn't count today's draft twice", () => {
    const today = post({ status: "draft", at: "2026-10-12T23:00:00Z" });
    expect(dailyRecommendations(empty({ posts: [today] }), NOW, TZ).recs.find((x) => x.kind === "gap")!.detail).toBe("Create or schedule a post for the days ahead.");
    const both = dailyRecommendations(empty({ posts: [today, post({ status: "draft", at: "2026-10-14T23:00:00Z" })] }), NOW, TZ);
    expect(both.recs.find((x) => x.kind === "gap")!.detail).toBe("1 other draft in that time isn't scheduled.");
  });

  it("has no gap when a post is scheduled within three days", () => {
    expect(kinds(empty({ posts: [post({ at: "2026-10-15T15:00:00Z" })] }))).not.toContain("gap");
  });

  // Four Monday 6:30 PM posts at twice the engagement of six weekday-morning posts.
  const mondays = ["2026-10-05", "2026-09-28", "2026-09-21", "2026-09-14"].map((d, i): TimedPost => ({ id: `m${i}`, t: `${d}T23:30:00Z`, e: 200, format: "Reel" }));
  const mornings = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-09-29", "2026-09-30", "2026-10-01"].map((d, i): TimedPost => ({ id: `w${i}`, t: `${d}T15:00:00Z`, e: 100, format: "Reel" }));
  const timed = [...mondays, ...mornings];

  it("names today's best window from the account's own posts, with the sample", () => {
    const s = dailyRecommendations(empty({ timed, posts: [tomorrow()] }), NOW, TZ);
    const r = s.recs.find((x) => x.kind === "best_time")!;
    expect(r.title).toBe("Your best window today: 6–9 PM");
    expect(r.detail).toBe("Your Instagram posts on Mondays between 6 and 9 PM get 100% more engagement than your typical post (median of 4 posts).");
    expect(r.tone).toBe("chance");
  });

  it("notes whether today's post lands in the window", () => {
    const inside = dailyRecommendations(empty({ timed, posts: [post({ at: "2026-10-12T23:15:00Z" })] }), NOW, TZ).recs.find((x) => x.kind === "best_time")!;
    expect(inside.detail).toContain("Your post at 6:15 PM lands in it.");
    expect(inside.tone).toBe("ok");
    const outside = dailyRecommendations(empty({ timed, posts: [post({ at: "2026-10-12T21:00:00Z" }), tomorrow()] }), NOW, TZ).recs.find((x) => x.kind === "best_time")!;
    expect(outside.detail).toContain("Your post today is set for 4:00 PM, outside it.");
  });

  it("drops today's window once it has closed, and points the gap line at the next one", () => {
    const late = new Date("2026-10-13T03:00:00Z"); // Monday 10:00 PM in Chicago
    const s = dailyRecommendations(empty({ timed }), late, TZ);
    expect(s.recs.map((r) => r.kind)).not.toContain("best_time");
    // The next Monday window is 7 days out, past the 3-day horizon: the gap line says only what it knows.
    expect(s.recs.find((r) => r.kind === "gap")!.detail).toBe("Your last Instagram post went out 4 days ago.");
  });

  it("says nothing about windows without enough history", () => {
    expect(kinds(empty({ timed: timed.slice(0, 7), posts: [tomorrow()] }))).not.toContain("best_time");
  });
});

describe("dailyRecommendations: breakouts, Studio, the whole card", () => {
  const breakout = { platform: "instagram" as const, title: "Pumpkin latte is back", format: "Reel", multiplier: 3.4, metric: "interactions" as const, sample: 5, postedAt: "2026-10-10T17:00:00Z", permalink: "https://www.instagram.com/reel/abc/" };
  const studio = { projectId: "proj 1", title: "Saturday market", found: 6, notStarted: 4, next: "How we set up at 5 AM" };

  it("follows up a post that is taking off, linking to it", () => {
    const r = dailyRecommendations(empty({ posts: [tomorrow()], breakout }), NOW, TZ).recs[0];
    expect(r.title).toBe("Your Instagram reel is taking off");
    expect(r.detail).toBe("“Pumpkin latte is back”, posted 2 days ago, has 3.4× the engagement of your typical reel (median of 5 other reels). Worth a follow-up on the same idea while people are still finding it.");
    expect(r.external).toEqual({ href: "https://www.instagram.com/reel/abc/", label: "See post" });
  });

  it("points at Content Studio posts not started yet", () => {
    const r = dailyRecommendations(empty({ posts: [tomorrow()], studio }), NOW, TZ).recs[0];
    expect(r.title).toBe("4 videos ready to make in Content Studio");
    expect(r.detail).toBe("“Saturday market”: SOCIA found 6 posts in your clips and 4 aren't started yet. Next up: “How we set up at 5 AM”.");
    expect(r.href).toBe("/studio?mode=clips&project=proj%201");
  });

  it("ranks by urgency and keeps at most five", () => {
    const s = dailyRecommendations(empty({
      plan: { id: "plan1", createdAt: "2026-10-12T13:00:00Z", items: [{ day: "Monday", concept: "Opening", format: "Reel" }] },
      posts: [post({ status: "failed", at: "2026-10-11T23:00:00Z" }), post({ status: "draft", hasMedia: false, at: "2026-10-12T23:00:00Z" })],
      comments: { waiting: 3, oldestAt: null }, breakout, studio,
    }), NOW, TZ);
    expect(s.recs).toHaveLength(MAX_RECS);
    expect(s.recs.map((r) => r.kind)).toEqual(["failed", "today_post", "plan_item", "comments", "gap"]);
  });

  it("returns nothing to do with the next post when all is set", () => {
    const s = dailyRecommendations(empty({ posts: [tomorrow()] }), NOW, TZ);
    expect(s.recs).toEqual([]);
    expect(s.next).toEqual({ title: "Tuesday post", when: "tomorrow at 6:00 PM" });
  });
});

describe("loaders", () => {
  it("maps Calendar posts, dropping cancelled ones", () => {
    const row = (over: Partial<ScheduledPost>): ScheduledPost => ({
      id: "s1", user_id: "u", ig_user_id: null, plan_id: null, plan_day: null, scheduled_at: "2026-10-12T23:00:00Z", caption: "Fall menu drop\n\n#coffee",
      media_type: "REELS", media_path: null, media_url: null, status: "draft", container_id: null, published_media_id: null, permalink: null, error: null,
      attempts: 0, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", ...over,
    });
    const out = todayPosts([row({}), row({ id: "s2", status: "cancelled" }), row({ id: "s3", caption: "", media_path: "x.mp4", media_type: "IMAGE" })]);
    expect(out.map((p) => p.id)).toEqual(["s1", "s3"]);
    expect(out[0]).toMatchObject({ title: "Fall menu drop", hasMedia: false, image: false });
    expect(out[1]).toMatchObject({ title: "Untitled post", hasMedia: true, image: true });
  });

  it("picks the strongest recent post across platforms, judged like the breakout alerts", () => {
    const ig = (id: string, daysAgo: number, likes: number): IgMediaItem => ({
      id, media_type: "VIDEO", timestamp: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString(), like_count: likes, comments_count: 0,
      caption: `Post ${id}`, permalink: `https://instagram.com/p/${id}`,
    } as IgMediaItem);
    const media = [ig("a", 20, 100), ig("b", 18, 100), ig("c", 16, 100), ig("d", 2, 500)];
    const b = pickBreakout({ ig: media }, NOW.getTime())!;
    expect(b).toMatchObject({ platform: "instagram", title: "Post d", format: "Reel", multiplier: 5, sample: 3, permalink: "https://instagram.com/p/d" });
    expect(pickBreakout({ ig: media.slice(0, 3) }, NOW.getTime())).toBeNull();
  });
});
