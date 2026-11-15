import { describe, expect, it } from "vitest";
import { WIN_AT, isWin, winSentence, winTitle, winsFrom, type WinInput } from "./core";

const r = (postId: string, multiplier: number | null, o: Partial<WinInput> = {}): WinInput => ({ postId, caption: "A caption", publishedAt: "2026-11-12T15:00:00Z", platform: "instagram", metric: "interactions", multiplier, measured: true, early: false, ...o });

describe("a result worth sharing", () => {
  it("needs a real, settled result clearly above the account's usual", () => {
    expect(isWin(r("a", WIN_AT))).toBe(true);
    expect(isWin(r("a", 1.19))).toBe(false);
    expect(isWin(r("a", 3, { early: true }))).toBe(false);
    expect(isWin(r("a", 3, { measured: false }))).toBe(false);
    // No median yet (too few posts): nothing to compare with, so nothing to share.
    expect(isWin(r("a", null))).toBe(false);
  });
  it("offers the best few, best first", () => {
    const wins = winsFrom([r("a", 1.4), r("b", 3.14), r("c", 0.6), r("d", 2), r("e", 1.25)]);
    expect(wins.map((w) => w.postId)).toEqual(["b", "d", "a"]);
    expect(wins[0].multiple).toBe("3.1×");
    expect(winsFrom([r("c", 0.6)])).toEqual([]);
  });
  it("says what happened in the person's own words, with nothing added", () => {
    expect(winSentence(winsFrom([r("b", 3.14)])[0])).toBe("A post I published on November 12 got 3.1 times my usual interactions on Instagram.");
    expect(winSentence(winsFrom([r("y", 2, { platform: "youtube", metric: "views", publishedAt: null })])[0])).toBe("A post I published got 2 times my usual views on YouTube.");
  });
  it("uses the post's first line as its title, without hashtags", () => {
    expect(winTitle("Fresh dough every morning #pizza #nyc\nCome by")).toBe("Fresh dough every morning");
    expect(winTitle("\n\n  Second line is the first with words  ")).toBe("Second line is the first with words");
    expect(winTitle("x".repeat(40) + " " + "y".repeat(60)).length).toBeLessThanOrEqual(70);
    expect(winTitle(null)).toBe("");
  });
});
