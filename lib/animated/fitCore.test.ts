import { describe, it, expect } from "vitest";
import { cleanFit, postsEvidence } from "./fitCore";
import { cleanPicks } from "./pick";

const media = [
  { media_product_type: "REELS", media_type: "VIDEO", like_count: 40, comments_count: 4, caption: "3 mistakes new cafes make\nmore" },
  { media_type: "CAROUSEL_ALBUM", like_count: 90, comments_count: 10, caption: "Five tips for your first visit" },
  { media_type: "IMAGE", like_count: 10, comments_count: 0, caption: "" },
  { media_type: "IMAGE", like_count: 20, comments_count: 1, caption: "Our patio", collab_owner: "friend" },
];

describe("account scan evidence", () => {
  it("summarises the account's own posts by format and lists the best, without collab posts", () => {
    const e = postsEvidence(media);
    expect(e.read).toBe(3);
    expect(e.text).toContain("1 Reels, on average 44 likes and comments each");
    expect(e.text).toContain("1 carousels, on average 100");
    expect(e.text.split("\n")[2]).toContain('carousel, 100 likes and comments: "Five tips for your first visit"');
    expect(e.text).not.toContain("patio");
    expect(postsEvidence([]).read).toBe(0);
  });

  it("keeps a known verdict and reasons that only use the evidence's numbers", () => {
    const e = postsEvidence(media).text;
    const fit = cleanFit({ verdict: "suits", reasons: ["Your carousel of tips got 100 likes and comments, your best post.", "Posts like these get 10x more saves.", "You share tips — lists work as words on screen."] }, e, 3, new Date("2026-11-10T00:00:00Z"))!;
    expect(fit.verdict).toBe("suits");
    expect(fit.reasons).toEqual(["Your carousel of tips got 100 likes and comments, your best post.", "You share tips, lists work as words on screen."]);
    expect(fit.checkedAt).toBe("2026-11-10T00:00:00.000Z");
    expect(fit.postsRead).toBe(3);
  });

  it("refuses an unknown verdict or no usable reason", () => {
    expect(cleanFit({ verdict: "great", reasons: ["x"] }, "", 0)).toBeNull();
    expect(cleanFit({ verdict: "test", reasons: ["Grows 50% faster"] }, "", 0)).toBeNull();
    expect(cleanFit(null, "", 0)).toBeNull();
  });
});

describe("day picks", () => {
  const days = [{ index: 0, day: "Monday", hook: "a", concept: "b" }, { index: 2, day: "Wednesday", hook: "c", concept: "d" }];
  it("keeps one pick per known day, in the plan's order, and a missing day is not animated", () => {
    expect(cleanPicks({ days: [{ index: 2, animated: true, reason: "A list — works as text" }, { index: 9, animated: true, reason: "x" }, { index: 2, animated: false, reason: "dup" }] }, days)).toEqual([
      { index: 0, animated: false, reason: "" },
      { index: 2, animated: true, reason: "A list, works as text" },
    ]);
    expect(cleanPicks(null, days).every((d) => !d.animated)).toBe(true);
  });
});
