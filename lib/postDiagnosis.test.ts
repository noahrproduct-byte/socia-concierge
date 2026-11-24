import { describe, expect, it } from "vitest";
import { postDiagnosis } from "./postDiagnosis";
import type { PostCard } from "./overview";

let n = 0;
const post = (over: Partial<PostCard>): PostCard => ({
  id: `p${++n}`, title: "Fresh pie", caption: "Fresh pie today", published: `2026-11-${String(10 + (n % 15)).padStart(2, "0")}T18:00:00Z`, format: "Reel", platform: "instagram", isVideo: true,
  views: 1000, reach: 900, likes: 40, comments: 4, saves: 5, shares: 5, engagements: 54, multiplier: 1, thumb: null, permalink: null, ...over,
});
const usual = () => Array.from({ length: 6 }, (_, k) => post({ published: `2026-11-0${k + 1}T18:00:00Z` }));

describe("postDiagnosis", () => {
  it("says the account is being shown less when this and the posts before it all fell", () => {
    const base = usual();
    const lows = [17, 18, 19].map((d) => post({ published: `2026-11-${d}T18:00:00Z`, views: 300, reach: 280 }));
    const p = post({ published: "2026-11-20T18:00:00Z", views: 250, reach: 240, multiplier: 0.4 });
    const d = postDiagnosis(p, [...base, ...lows, p]);
    expect(d.kind).toBe("distribution");
    expect(d.title).toBe("Fewer people are being shown your posts lately");
    expect(d.action?.kind).toBe("ask");
  });

  it("points at the opening when only this post was seen less", () => {
    const base = usual();
    const p = post({ published: "2026-11-20T18:00:00Z", views: 300, reach: 270, likes: 12, comments: 1, saves: 2, shares: 2, engagements: 17, multiplier: 0.3 });
    const d = postDiagnosis(p, [...base, p]);
    expect(d.kind).toBe("reach");
    expect(d.heading).toBe("Biggest thing to fix");
    expect(d.action).toMatchObject({ kind: "editor", label: "Make a better opening" });
    expect(d.action!.prompt).toContain('"Fresh pie"');
  });

  it("asks for an ending people answer when it was seen but got no reactions", () => {
    const base = usual();
    const p = post({ published: "2026-11-20T18:00:00Z", views: 1100, reach: 1000, likes: 8, comments: 0, saves: 1, shares: 1, engagements: 10, multiplier: 0.2 });
    expect(postDiagnosis(p, [...base, p]).kind).toBe("reaction");
  });

  it("calls a breakout what it is and offers another like it", () => {
    const base = usual();
    const p = post({ published: "2026-11-20T18:00:00Z", views: 5000, reach: 4500, likes: 300, comments: 30, saves: 40, shares: 50, engagements: 420, multiplier: 7.8 });
    const d = postDiagnosis(p, [...base, p]);
    expect(d).toMatchObject({ kind: "strong", heading: "Why this worked", title: "Make more like this" });
  });

  it("never names a problem it can't see", () => {
    const p = post({ views: null, reach: null, likes: null, comments: null, saves: null, shares: null, engagements: 0, multiplier: null });
    expect(postDiagnosis(p, [p, post({ views: null, reach: null })]).kind).toBe("unknown");
  });
});
