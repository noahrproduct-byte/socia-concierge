import { describe, expect, it } from "vitest";
import { cleanBrief, promptFromBrief } from "./briefCore";
import { ideaPrompt, refFor } from "./ideas";
import { bestPostLines } from "./ideaContext";
import { GOAL_BRIEF } from "./goals";

const raw = {
  concept: "c", hook: "the quiet before the first order", openingShot: "Close on a cup — steam rising", buildUp: "Slide along the counter", payoff: "The door opens.",
  cta: "Comment your order", durationSec: 90, kind: "text_to_video", onScreenText: ["a", "b", "c", "d"], script: "", checklist: ["x"], shots: [{ shot: "s", seconds: 40, how: "h" }], prompt: "", caption: "cap",
};

describe("creative brief", () => {
  it("tidies the model's answer: caps the length, lines and seconds, takes out em dashes, fills a missing prompt from the beats", () => {
    const b = cleanBrief(raw, "text_to_video")!;
    expect(b.durationSec).toBe(30);
    expect(b.onScreenText).toHaveLength(3);
    expect(b.shots[0].seconds).toBe(15);
    expect(b.openingShot).toBe("Close on a cup, steam rising");
    expect(b.prompt).toContain("Close on a cup, steam rising. Then Slide along the counter. Then The door opens");
    expect(b.prompt).toContain("no text or logos");
  });
  it("refuses a brief without its core beats", () => {
    expect(cleanBrief({ ...raw, payoff: "" }, "text_to_video")).toBeNull();
  });
  it("rebuilds the prompt from edited beats for a still, with no AI call", () => {
    expect(promptFromBrief({ openingShot: "Three cups on marble", buildUp: "", payoff: "", kind: "text_to_image" })).toMatch(/^Three cups on marble\. A single still/);
  });
});

describe("ideas by goal", () => {
  it("puts the goal and what it brought into the writer's task", () => {
    const best = ideaPrompt("Account: pizza.", 5, null, { goal: "best", best: ["Reel: \"cheese pull\" (12K views)"] });
    expect(best).toContain(GOAL_BRIEF.best);
    expect(best).toContain("cheese pull");
    expect(ideaPrompt("B", 3, null, { goal: "improve", draft: "my draft" })).toContain("# Their draft\nmy draft");
    expect(ideaPrompt("B", 5, "brunch", { goal: "customers" })).toContain("about: brunch");
  });
  it("links the trending Reel an idea names, and nothing when it names none", () => {
    const c = { goal: "trending" as const, trending: [{ url: "https://ig/r/1", account: "@a", line: "x", result: "1.2M views" }] };
    expect(refFor(1, c)).toEqual({ ref: { url: "https://ig/r/1", account: "@a", result: "1.2M views" } });
    expect(refFor(0, c)).toEqual({});
    expect(refFor(1, { goal: "views" })).toEqual({});
  });
  it("ranks the account's own posts by views, else likes and comments, skipping collab posts", () => {
    const lines = bestPostLines([
      { caption: "low", like_count: 3, comments_count: 1, media_type: "IMAGE" },
      { caption: "top reel", media_product_type: "REELS", insights: { views: 12_400 }, like_count: 300 },
      { caption: "theirs", collab_owner: "x", insights: { views: 99_999 } },
    ]);
    expect(lines[0]).toBe('Reel: "top reel" (12.4K views, 300 likes)');
    expect(lines).toHaveLength(2);
  });
});
