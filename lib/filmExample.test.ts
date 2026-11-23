import { describe, expect, it } from "vitest";
import { pickFilmRef, provenEvidence, type ProvenReel } from "./trendSignals";

const reel = (id: string, handle: string): ProvenReel => ({
  id, url: `https://www.instagram.com/reel/${id}/`, platform: "instagram", accountName: handle, accountHandle: handle, accountAvatar: null,
  title: "A Reel", thumb: null, publishedAt: null, views: 90000, likes: null, comments: null, multiplier: 26, basis: "views",
  format: "Reel", proven: true, line: null, structures: [], topics: [],
} as unknown as ProvenReel);

describe("the Reel a filmed post is filmed from", () => {
  const list = [reel("R1", "jako.frames"), reel("R2", "talker"), reel("R3", "unknown")];
  const styles = { R1: "animated", R2: "talking", R3: null };

  it("is never an animated, slides or unread Reel", () => {
    expect(pickFilmRef("R1", list, styles)).toBeNull();
    expect(pickFilmRef("R3", list, styles)).toBeNull();
    expect(pickFilmRef("", list, styles)).toBeNull();
    expect(pickFilmRef("R9", list, styles)).toBeNull();
  });

  it("is the cited Reel when it was filmed the same way", () => {
    expect(pickFilmRef("r2", list, styles)?.account).toBeTruthy();
    expect(pickFilmRef("R2", list, styles)?.url).toBe("https://www.instagram.com/reel/R2/");
  });

  it("is listed with how each Reel was made, so the model can match it", () => {
    const block = provenEvidence(list, undefined, (r) => (r.id === "R1" ? "Animated" : r.id === "R2" ? "Talking to camera" : null));
    expect(block).toContain("R1 | Instagram Reel by");
    expect(block).toMatch(/R1 .*made: Animated/);
    expect(block).toMatch(/R2 .*made: Talking to camera/);
    expect(block).not.toMatch(/R3 .*made:/);
  });
});
