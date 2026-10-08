import { describe, it, expect } from "vitest";
import { weeklyScorecard, type ScorePost } from "./weeklyScorecard";

const NOW = Date.parse("2026-10-07T18:00:00Z"); // a Wednesday
const DAY = 86_400_000;
const post = (daysAgo: number, interactions = 100, caption: string | null = "A post"): ScorePost => ({ id: `p${daysAgo}`, t: NOW - daysAgo * DAY, interactions, caption, permalink: null, format: "Reel" });

describe("Your week", () => {
  it("counts this week and last, and the best post against the median", () => {
    const s = weeklyScorecard([post(1, 400, "Fresh out of the oven #pizza"), post(3, 100), post(9, 100), post(12, 90), post(20, 110), post(27, 100)], NOW, "2 of 4 posted · best: Friday at 2.1× your median · 1 skipped");
    expect(s.thisWeek).toBe(2);
    expect(s.lastWeek).toBe(2);
    expect(s.lines).toEqual([
      "You posted 2 times on Instagram this week (2 the week before).",
      "5 weeks in a row with at least one post, as far back as SOCIA's synced posts go.",
      "Best this week: “Fresh out of the oven” at 4× your median so far.",
      "This week's Content Plan: 2 of 4 posted · best: Friday at 2.1× your median · 1 skipped",
    ]);
  });

  it("doesn't break a streak for a week still in progress", () => {
    // Nothing yet this week (Mon–Wed), but posts in each of the 3 weeks before, and older history.
    const s = weeklyScorecard([post(4), post(11), post(18), post(60), post(61)], NOW, null);
    expect(s.streak).toEqual({ weeks: 3, atLeast: false });
    expect(s.lines[1]).toBe("3 weeks in a row with at least one post.");
  });

  it("is plain when there's nothing recent, and never shows a multiplier without a baseline", () => {
    const quiet = weeklyScorecard([post(30), post(40)], NOW, null);
    expect(quiet.lines).toEqual(["You posted 0 times on Instagram this week (0 the week before).", "No post in the last two weeks: one post this week starts a new streak."]);
    const small = weeklyScorecard([post(5, 80, null)], NOW, null);
    expect(small.best?.line).toBe("Best this week: “Your reel” with 80 interactions.");
  });
});
