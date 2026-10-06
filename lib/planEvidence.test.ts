import { describe, it, expect } from "vitest";
import { ownPostsBlock, competitorsBlock, outcomesBlock } from "./planEvidence";
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
    expect(b).toContain('- 2026-09-01 · Reel · "Two crusts. One pizza." · 1900 likes, 109 comments');
    expect(b).toContain('- 2026-08-25 · Static · "Menu update" · 10 likes, 1 comments');
    expect(b).toContain("Followers: 12,177");
    expect(b).toContain("Reel: 1 post, median 2009 engagement");
    expect(b).toContain("Static: 1 post, median 11 engagement");
    expect(b).toContain('Strongest posts: "Two crusts. One pizza." (Reel, 2009)');
    // Too few posts to call any of them "weakest".
    expect(b).not.toContain("Weakest posts");
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
    expect(b).not.toContain("@rivalpizza · Instagram · added by the user");
    expect(b).toContain("- @someone · YouTube · added by the user · no public metrics available");
    expect(b).toContain(
      '- "I tried 5 crusts" by Pizza Guy (YouTube, 2026-08-20) · 45,000 views, 1,200 likes · 3.4× that creator\'s median · patterns: Comparison · why it matters: Format fits the account',
    );
    expect(b).toContain("Winning content SOCIA found in this niche (1");
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
