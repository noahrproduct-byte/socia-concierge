import { describe, it, expect } from "vitest";
import { ownPostsBlock, ownPostRefs, calendarBlock, goalsBlock, competitorsBlock, igSnapLine, outcomesBlock } from "./planEvidence";
import type { PlanOutcome, ItemOutcome } from "./planOutcomes";

describe("plan evidence: own posts", () => {
  it("is empty with no posts", () => {
    expect(ownPostsBlock([], 100)).toBe("");
  });

  it("lists each post with its real numbers and the aggregates computed from them", () => {
    const media = [
      {
        timestamp: "2026-09-01T21:00:00+0000",
        media_type: "VIDEO",
        caption: "Two crusts. One pizza.\nWe're not going to explain ourselves.",
        like_count: 1900,
        comments_count: 109,
      },
      { timestamp: "2026-08-25T11:00:00+0000", media_type: "IMAGE", caption: "Menu update", like_count: 10, comments_count: 1 },
    ];
    const b = ownPostsBlock(media, 12177);
    expect(b).toContain('- [P1] 2026-09-01 · Reel · "Two crusts. One pizza." · 1,900 likes, 109 comments');
    expect(b).toContain('- [P2] 2026-08-25 · Static · "Menu update" · 10 likes, 1 comments');
    // No insights returned: views, saves and shares are left out, never shown as zero.
    expect(b).not.toMatch(/0 views|0 saves/);
    expect(b).toContain("Followers: 12,177");
    expect(b).toContain("Reel: 1 post, median 2009 engagement");
    expect(b).toContain("Static: 1 post, median 11 engagement");
    expect(b).toContain('Strongest posts: [P1] "Two crusts. One pizza." (Reel, 2009)');
    // Too few posts to call any of them "weakest".
    expect(b).not.toContain("Weakest posts");
  });
});

describe("plan evidence: own posts with insights", () => {
  it("adds views, reach, saves and shares where Instagram returned them, with a median of views", () => {
    const media = [1, 2, 3].map((i) => ({ timestamp: `2026-09-0${i}T10:00:00+0000`, media_type: "VIDEO", caption: `Reel ${i}`, like_count: 10 * i, comments_count: i, permalink: `https://www.instagram.com/reel/x${i}/`, insights: { views: 1000 * i, reach: 800 * i, saved: i, shares: i } }));
    const b = ownPostsBlock(media, 500);
    expect(b).toContain("[P1] 2026-09-01 · Reel · \"Reel 1\" · 10 likes, 1 comments, 1,000 views, 800 reached, 1 saves, 1 shares");
    expect(b).toContain("Median views per post: 2,000 (3 posts with views)");
    const refs = ownPostRefs(media);
    expect(refs[2]).toMatchObject({ id: "P3", url: "https://www.instagram.com/reel/x3/", views: 3000, saved: 3 });
  });
});

describe("plan evidence: calendar and goals", () => {
  it("lists drafts and scheduled posts, and nothing when there are none", () => {
    expect(calendarBlock([], "UTC")).toBe("");
    const b = calendarBlock([
      { scheduled_at: "2026-11-18T17:00:00Z", caption: "Pepperoni pull\nmore text", status: "scheduled", plan_id: "p1" },
      { scheduled_at: "2026-11-19T17:00:00Z", caption: "", status: "draft" },
      { scheduled_at: "2026-11-20T17:00:00Z", caption: "Gone", status: "published" },
    ], "UTC");
    expect(b).toContain('Wednesday, Nov 18 · scheduled · "Pepperoni pull" · from an earlier plan');
    expect(b).toContain("Thursday, Nov 19 · draft");
    expect(b).not.toContain("Gone");
  });
  it("states each live goal with where it stands, and says when SOCIA can't see the number", () => {
    expect(goalsBlock([])).toBe("");
    const b = goalsBlock([
      { kind: "primary", metric: "followers", platforms: ["instagram"], baseline: 12000, target: 15000, due_date: "2027-01-31", status: "active" },
      { kind: "secondary", metric: "bookings", platforms: [], baseline: null, current_value: 40, target: 60, due_date: null, status: "active" },
      { kind: "secondary", metric: "leads", platforms: [], baseline: 1, target: 2, due_date: null, status: "dropped" },
    ]);
    expect(b).toContain("Main goal: Followers or subscribers: from 12,000 to 15,000 by 2027-01-31");
    expect(b).toContain("Also: Bookings: from 40 to 60 (the person reports this number; SOCIA can't see it)");
    expect(b).not.toContain("Leads");
  });
});

describe("plan evidence: competitors", () => {
  it("is empty with nothing on file", () => {
    expect(competitorsBlock([], [], [])).toBe("");
  });

  it("states unavailable metrics instead of inventing them, and dedupes tracked handles", () => {
    const b = competitorsBlock(
      [
        {
          platform: "instagram",
          handle: "rivalpizza",
          display_name: "Rival Pizza",
          followers: null,
          location: "Nashville, TN",
          category: null,
          classification: "direct_competitor",
          relevance_score: 80,
        },
      ],
      [
        { platform: "instagram", handle: "@rivalpizza" },
        { platform: "youtube", handle: "someone" },
      ],
      [
        {
          platform: "youtube",
          account_name: "Pizza Guy",
          title: "I tried 5 crusts",
          views: 45000,
          likes: 1200,
          comments: null,
          multiplier: 3.4,
          trend_tags: ["Comparison"],
          why_recommended: "Format fits the account",
          published_at: "2026-08-20T00:00:00Z",
        },
      ],
    );
    expect(b).toContain("- @rivalpizza (Rival Pizza) · Instagram · direct competitor · followers not published · Nashville, TN");
    expect(b).not.toContain("@rivalpizza · Instagram · tracked by the user");
    expect(b).toContain("- @someone · YouTube · tracked by the user · no public numbers read for this account yet");
    expect(b).toContain(
      '- "I tried 5 crusts" by Pizza Guy (YouTube, 2026-08-20) · 45,000 views, 1,200 likes · 3.4× that creator\'s median · patterns: Comparison · why it matters: Format fits the account',
    );
    expect(b).toContain("Winning content SOCIA found in this niche (1");
  });
});

describe("plan evidence: the numbers SOCIA read from Instagram", () => {
  const snap = {
    handle: "rivalpizza", followers: 4310, posts_per_week: "3.5", median_engagement: "212.4", fetched_at: "2026-11-04T09:00:00Z",
    media: [{ views: 9000 }, { views: 12000 }, { views: 30000 }, { views: null }],
  };

  it("states only what was read, with its date", () => {
    expect(igSnapLine(snap)).toBe("4,310 followers, 3.5 posts a week, median 212 likes and comments a post (last 4), median 12,000 views (3 posts); read from Instagram 2026-11-04");
    // Fewer than three posts with views: no median views. Nothing read: nothing said.
    expect(igSnapLine({ ...snap, media: [{ views: 9000 }] })).not.toContain("views");
    expect(igSnapLine({ handle: "x", followers: null, posts_per_week: null, median_engagement: null })).toBe("");
  });

  it("puts those numbers on a discovered account and on a tracked one, in place of 'not published'", () => {
    const snaps = new Map([["rivalpizza", snap], ["doughbros", { ...snap, handle: "doughbros", followers: 900 }]]);
    const b = competitorsBlock(
      [{ platform: "instagram", handle: "rivalpizza", display_name: "Rival Pizza", followers: null, location: null, category: null, classification: "direct_competitor", relevance_score: 80 }],
      [{ platform: "instagram", handle: "@DoughBros" }, { platform: "instagram", handle: "unread" }],
      [],
      snaps,
    );
    expect(b).toContain("- @rivalpizza (Rival Pizza) · Instagram · direct competitor · 4,310 followers, 3.5 posts a week");
    expect(b).not.toContain("followers not published");
    expect(b).toContain("- @DoughBros · Instagram · tracked by the user · 900 followers, 3.5 posts a week");
    expect(b).toContain("- @unread · Instagram · tracked by the user · no public numbers read for this account yet");
  });
});

describe("plan evidence: what became of the last plan", () => {
  const item = (over: Partial<ItemOutcome>): ItemOutcome => ({
    index: 0, day: "Monday", concept: "Behind the oven", format: "Reel", predicted: "High confidence", state: "unscheduled",
    postId: null, scheduledAt: null, publishedAt: null, permalink: null, results: [], result: null, ...over,
  });
  const result = (multiplier: number | null, early = false, measured = true) => ({
    platform: "instagram" as const, measured, early, multiplier,
    short: measured ? (multiplier == null ? "40 interactions" : `${multiplier}× your median${early ? " so far" : ""}`) : "measuring",
    text: measured ? `${multiplier}× your typical Instagram post` : "Instagram hasn't reported this post yet.",
  });
  const plan = (over: Partial<PlanOutcome["summary"]>, items: ItemOutcome[]): PlanOutcome => ({
    planId: "p1", createdAt: "2026-09-28T09:00:00Z", items,
    summary: { total: items.length, onCalendar: 1, published: 1, measured: 1, skipped: [], best: null, line: "x", ...over },
  });

  it("is empty when no plan reached the Calendar", () => {
    expect(outcomesBlock([plan({ onCalendar: 0 }, [item({})])])).toBe("");
    expect(outcomesBlock([])).toBe("");
  });

  it("lists each planned post with its prediction and what actually happened, then the lessons", () => {
    const items = [
      item({ index: 0, day: "Monday", state: "published", result: result(2.1) }),
      item({ index: 1, day: "Wednesday", concept: "Staff pick", format: "Carousel", predicted: "Experiment", state: "published", result: result(0.5) }),
      item({ index: 2, day: "Friday", concept: "Free slices", state: "unscheduled" }),
      item({ index: 3, day: "Saturday", concept: "Game day", state: "published", result: result(1.5, true) }),
    ];
    const text = outcomesBlock([plan({ onCalendar: 3, published: 3, skipped: ["Friday"] }, items)]);
    expect(text).toMatch(/Plan of 2026-09-28: 3 of 4 posted, 1 never done/);
    expect(text).toMatch(/Monday · Reel · "Behind the oven" · predicted: High confidence · actual: posted; 2.1× your typical Instagram post/);
    expect(text).toMatch(/Friday · Reel · "Free slices" · predicted: High confidence · actual: NOT DONE/);
    expect(text).toMatch(/Beat the account's median: "Behind the oven" \(Reel, 2.1× your median\)/);
    expect(text).toMatch(/Fell short of the median: "Staff pick" \(Carousel, 0.5× your median\)/);
    expect(text).toMatch(/Planned but never made: Friday: "Free slices"/);
    // an early result is reported but not yet counted as a lesson
    expect(text).not.toMatch(/Game day" \(Reel, 1.5/);
  });
});
