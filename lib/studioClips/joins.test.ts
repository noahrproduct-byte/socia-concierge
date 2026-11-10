import { describe, expect, it } from "vitest";
import { decideJoins, joinsNote } from "./joins";
import type { TransitionKind } from "./types";

type S = { clipId: string; in: number; out: number; transition?: TransitionKind };

const w = (text: string, a: number, b: number) => ({ text, startMs: a * 1000, endMs: b * 1000, confidence: 1 });
const quiet = { id: "q", words: null };
const talk = { id: "t", words: [w("We", 1, 1.2), w("open", 1.2, 1.6), w("at", 1.6, 1.8), w("five.", 1.8, 2.3), w("Come", 6, 6.3), w("early.", 6.3, 6.9)] };

describe("how each shot joins the one before", () => {
  it("dissolves between shots when nobody is talking, and says why", () => {
    const r = decideJoins<S>([{ clipId: "q", in: 0, out: 3 }, { clipId: "q", in: 8, out: 10 }, { clipId: "t", in: 3, out: 5 }], [quiet, talk]);
    expect(r.segments.map((s) => s.transition)).toEqual([undefined, "fade", "fade"]);
    expect(r.joins.map((j) => j.why)).toEqual(["skip", "montage"]);
  });
  it("hard-cuts where someone is talking on either side of the join", () => {
    // Shot 1 ends as "five." is said; shot 3 starts as "Come" is said.
    const r = decideJoins<S>([{ clipId: "t", in: 0.5, out: 2.4 }, { clipId: "q", in: 0, out: 2 }, { clipId: "t", in: 6, out: 7 }], [quiet, talk]);
    expect(r.segments.map((s) => s.transition)).toEqual([undefined, undefined, undefined]);
    expect(r.joins.map((j) => j.why)).toEqual(["speech", "speech"]);
    expect(joinsNote(r.joins)).toBe("SOCIA chose each join: 2 hard cuts where someone is talking, so the words stay clear.");
  });
  it("keeps the joins the person named, and never puts a transition on the first shot", () => {
    const segs = [{ clipId: "q", in: 0, out: 2, transition: "fade" as const }, { clipId: "q", in: 5, out: 7, transition: "whip" as const }, { clipId: "t", in: 1, out: 2 }];
    const asked = decideJoins(segs, [quiet, talk], "fast edit with whip transitions");
    expect(asked.segments).toBe(segs);
    expect(joinsNote(asked.joins)).toBe("");
    expect(decideJoins(segs, [quiet, talk], "show the crust being made").segments[0].transition).toBeUndefined();
  });
  it("is the same answer the second time", () => {
    const once = decideJoins([{ clipId: "t", in: 0.5, out: 2.4 }, { clipId: "q", in: 0, out: 2 }, { clipId: "q", in: 4, out: 6 }], [quiet, talk]);
    expect(decideJoins(once.segments, [quiet, talk]).segments).toEqual(once.segments);
  });
});
