import { describe, expect, it } from "vitest";
import { emphasisLabels, pickEmphasis, WORDS_PER_HIGHLIGHT } from "./emphasis";
import { emphasisIndex } from "@/lib/clipper/emphasis";
import type { Edl, TranscriptWord } from "./types";

/** Words spoken evenly, 0.3 s each. */
const say = (text: string, from = 0): TranscriptWord[] => text.split(" ").map((t, i) => ({ text: t, startMs: Math.round((from + i * 0.3) * 1000), endMs: Math.round((from + i * 0.3 + 0.28) * 1000), confidence: 1 }));
const edl = (out: number, over: Partial<Edl> = {}): Edl => ({
  version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 5, max: 30 }, text: [], captions: { source: "transcript" }, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
  segments: [{ id: "s1", clipId: "t", in: 0, out, role: "opener", note: "" }], ...over,
});

const talk = say("Your last Reel got 300 views but this one reached 12,000. We filmed it in Nashville with twenty people and it took one afternoon.");

describe("which caption words get the highlight", () => {
  it("picks numbers and names, never filler, within the budget", () => {
    const list = pickEmphasis(edl(8), { t: talk });
    expect(list).toEqual(["300", "12000", "twenty", "nashville"]);
    expect(list.length).toBeLessThanOrEqual(Math.round(talk.length / WORDS_PER_HIGHLIGHT));
    expect(list).not.toContain("your");
    expect(list).not.toContain("but");
  });
  it("puts the model's marks first, but only words really said in the cut, and never a filler", () => {
    expect(pickEmphasis(edl(8), { t: talk }, ["reached", "the", "Paris", "afternoon"])).toEqual(["reached", "afternoon", "300", "12000"]);
  });
  it("only looks at what is in the cut, and gives nothing when nobody talks", () => {
    // The first 2.4 s: "Your last Reel got 300 views but this"
    expect(pickEmphasis(edl(2.4), { t: talk })).toEqual(["300"]);
    expect(pickEmphasis(edl(8), { t: null })).toEqual([]);
  });
  it("doesn't take the first word of a sentence, or I, for a name", () => {
    expect(pickEmphasis(edl(6), { t: say("Honestly I think Fridays are best. Everyone comes in after work and stays late into the night here.") })).toEqual(["fridays"]);
  });
  it("lists the words the way they were said, and the renderer colours one a line", () => {
    expect(emphasisLabels(edl(8), { t: talk }, ["12000", "nashville"])).toEqual(["12,000", "Nashville"]);
    expect(emphasisIndex(["We", "filmed", "it", "in", "Nashville"], ["nashville"])).toBe(4);
    expect(emphasisIndex(["but", "this", "one"], ["nashville"])).toBe(-1);
  });
});
