import { describe, expect, it } from "vitest";
import { formatStats, normalizeVisual, pickReels } from "./reelRead";
import { brandLines, cleanFormats } from "../brandBrief";

const reel = (id: string, views: number, extra: object = {}) => ({ id, media_product_type: "REELS", insights: { views }, permalink: `https://instagram.com/reel/${id}/`, thumbnail_url: `https://x.cdninstagram.com/${id}.jpg`, ...extra });

describe("reading the account's own Reels", () => {
  const media = [reel("a", 100), reel("b", 1500), reel("c", 1300), reel("d", 200), reel("e", 900, { collab_owner: "other" }), { id: "p", media_type: "IMAGE", like_count: 5 }];
  it("watches the best and the newest Reels, own posts only", () => {
    const picked = pickReels(media, 3).map((m) => m.id);
    expect(picked).toEqual(["b", "c", "a"]);
    expect(pickReels(media).map((m) => m.id)).not.toContain("e");
  });
  it("counts each kind's numbers against the account's usual", () => {
    // Reels a, b, c, d: median of 100, 200, 1300, 1500 is 750.
    expect(formatStats(["b", "c"], media)).toEqual({ avg: 1400, metric: "views", multiple: 1.9 });
  });
  it("keeps only kinds seen in two shown Reels, and never invented ids", () => {
    const watched = pickReels(media);
    const raw = { about: { value: "A climbing app that scans the wall", product: "BetaTwin", confidence: 80, evidence: ["bio"] }, formats: [
      { name: "Climber scenes", made: "animated", look: "A stick-figure climber on a gym wall.", reels: ["b", "c", "zzz"] },
      { name: "One-off", made: "filmed", look: "Once.", reels: ["a"] },
    ], look: "Dark navy, yellow headlines.", limitations: [] };
    const v = normalizeVisual(raw, watched, media, new Date("2026-11-14T00:00:00Z"));
    expect(v.formats).toHaveLength(1);
    expect(v.formats[0]).toMatchObject({ name: "Climber scenes", made: "animated", ids: ["b", "c"], avg: 1400 });
    expect(v.about?.product).toBe("BetaTwin");
  });
});

describe("the brand lines every writer gets", () => {
  it("says what the account is, falling back to the narrower niche", () => {
    const lines = brandLines({ handle: "betatwin.app", niche: "Tech & Gadgets", specific: "Pre-launch app that scans a bouldering wall" });
    expect(lines).toContain("What the account is: Pre-launch app that scans a bouldering wall");
  });
  it("lists the confirmed kinds of video", () => {
    const formats = cleanFormats([{ name: "Climber scenes", made: "animated", look: "Stick figure on a wall." }, { name: "", made: "filmed", look: "x" }, { name: "Bad", made: "nope", look: "y" }]);
    expect(formats).toEqual([{ name: "Climber scenes", made: "animated", look: "Stick figure on a wall." }, { name: "Bad", made: "mixed", look: "y" }]);
    expect(brandLines({ formats }).join("\n")).toContain("- Climber scenes (animated): Stick figure on a wall.");
  });
});
