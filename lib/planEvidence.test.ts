import { describe, it, expect } from "vitest";
import { ownPostsBlock, competitorsBlock } from "./planEvidence";

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
