import { describe, expect, it } from "vitest";
import type { PostCard } from "@/lib/overview";
import { captionAsks, postVerdicts, standout } from "./postVerdicts";

const post = (id: string, o: Partial<PostCard> = {}): PostCard => ({
  id, title: id, caption: "", published: "2026-11-01T12:00:00Z", format: "Reel", platform: "instagram", isVideo: true,
  views: 1000, reach: 1000, likes: 40, comments: 10, saves: 5, shares: 5, engagements: 60, multiplier: 1, thumb: null, permalink: null, ...o,
});
const others = ["a", "b", "c", "d"].map((id) => post(id));

describe("standout", () => {
  it("names only posts well off the usual", () => {
    expect(standout(post("x", { multiplier: 2.4 }))?.word).toBe("Breakout");
    expect(standout(post("x", { multiplier: 1.4 }))?.word).toBe("Above usual");
    expect(standout(post("x", { multiplier: 0.4 }))?.tone).toBe("bad");
    expect(standout(post("x", { multiplier: 1 }))).toBeNull();
    expect(standout(post("x", { multiplier: null }))).toBeNull();
  });
});

describe("captionAsks", () => {
  it("finds an ask", () => {
    expect(captionAsks("Comment WAREHOUSE and I'll send it")).toBe(true);
    expect(captionAsks("What would you do?")).toBe(true);
    expect(captionAsks("Day 4 at the shop")).toBe(false);
  });
});

describe("postVerdicts", () => {
  it("measures a post against the other posts", () => {
    const v = postVerdicts(post("x", { views: 3000, reach: 3000, engagements: 360, comments: 90, caption: "Comment below" }), [...others, post("x")]);
    expect(v.map((r) => r.id)).toEqual(["reach", "reaction", "spread", "ask"]);
    expect(v[0].tone).toBe("good");
    expect(v[0].line).toBe("3.0x your usual views");
    expect(v[1].tone).toBe("good");
    expect(v[3].tone).toBe("good");
    expect(v[3].line.startsWith("The caption asks for something")).toBe(true);
  });
  it("says so when there is no ask and comments are ordinary", () => {
    const v = postVerdicts(post("x"), others);
    expect(v[3].tone).toBe("bad");
    expect(v[3].line).toContain("No ask in the caption");
  });
  it("claims nothing without enough posts or numbers", () => {
    expect(postVerdicts(post("x"), [post("a")]).every((r) => r.tone === "none")).toBe(true);
    const v = postVerdicts(post("x", { views: null, reach: null, saves: null, shares: null }), others);
    expect(v[0].tone).toBe("none");
    expect(v[2].tone).toBe("none");
  });
});
