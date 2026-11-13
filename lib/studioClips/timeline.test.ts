import { describe, it, expect } from "vitest";
import { timeline, captionsForEdl, captionPages, clearOfText, edgeEnvelope, dbToGain, EDGE_FADE_FRAMES, FPS } from "./timeline";
import type { Edl } from "./types";

const edl: Edl = {
  version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 15, max: 30 },
  segments: [
    { id: "s1", clipId: "a", in: 2, out: 6, role: "opener", note: "" },
    { id: "s2", clipId: "b", in: 0, out: 3.5, role: "body", note: "" },
  ],
  text: [], captions: { source: "transcript" }, enhance: [], audio: [{ clipId: "b", gainDb: 6, why: "" }], cta: null, music: null, caption: "", notes: [],
};

describe("timeline", () => {
  it("lays segments end to end in frames and carries the measured gain", () => {
    const t = timeline(edl);
    expect(t.segments[0]).toMatchObject({ startFrame: 0, durationFrames: 120, inFrame: 60, gainDb: 0 });
    expect(t.segments[1]).toMatchObject({ startFrame: 120, durationFrames: 105, inFrame: 0, gainDb: 6, startSec: 4 });
    expect(t.durationFrames).toBe(225);
    expect(t.durationSec).toBeCloseTo(7.5, 5);
    expect(FPS).toBe(30);
  });

  it("moves only the words inside each trim onto the output clock", () => {
    const caps = captionsForEdl(edl, {
      a: [
        { text: "Before", startMs: 500, endMs: 900, confidence: 1 },   // before the in point → dropped
        { text: "We", startMs: 2100, endMs: 2400, confidence: 1 },     // → 100–400 ms
        { text: "fed", startMs: 5600, endMs: 6100, confidence: 1 },    // straddles the out point, middle inside → end clipped to 6000
        { text: "two", startMs: 5950, endMs: 6400, confidence: 1 },    // middle past the out point → dropped
      ],
      b: [{ text: "hundred", startMs: 1000, endMs: 1300, confidence: 0.9 }], // → 4000 + 1000
    });
    expect(caps.map((c) => [c.text, c.startMs, c.endMs])).toEqual([[" We", 100, 400], [" fed", 3600, 4000], [" hundred", 5000, 5300]]);
    expect(captionsForEdl(edl, { a: null, b: [] })).toEqual([]);
  });

  it("fades only two frames at each edge, so a word at a cut never ducks", () => {
    expect(EDGE_FADE_FRAMES).toBe(2);
    expect(edgeEnvelope(0, 120)).toBe(0.5);
    expect(edgeEnvelope(2, 120)).toBe(1);
    expect(edgeEnvelope(60, 120)).toBe(1);
    expect(edgeEnvelope(117, 120)).toBe(1);
    expect(edgeEnvelope(119, 120)).toBe(0.5);
    expect(edgeEnvelope(0, 2)).toBeGreaterThan(0);
    expect(dbToGain(6)).toBeCloseTo(1.995, 2);
    expect(dbToGain(0)).toBe(1);
  });
});

describe("caption pages", () => {
  const spoken: Edl = { ...edl, segments: [{ id: "s1", clipId: "a", in: 0, out: 6, role: "opener", note: "" }] };
  const words = { a: [
    { text: "Wait", startMs: 200, endMs: 500, confidence: 1 },
    { text: "for", startMs: 550, endMs: 700, confidence: 1 },
    // starts inside the first page's 1.2 s but ends after it: the page must hold until it ends
    { text: "everything", startMs: 1100, endMs: 1900, confidence: 1 },
    { text: "now", startMs: 3000, endMs: 3400, confidence: 1 },
  ] };
  it("shows at most the asked-for words at a time, and closes a page at a sentence's end", () => {
    const talk = ["one", "two", "three", "four", "five.", "Six", "seven"].map((text, i) => ({ text, startMs: i * 150, endMs: i * 150 + 140, confidence: 1 }));
    const pages = captionPages(spoken, { a: talk }, 30, undefined, 4);
    expect(pages.map((p) => p.page.tokens.map((t) => t.text.trim()))).toEqual([["one", "two", "three", "four"], ["five."], ["Six", "seven"]]);
    expect(pages[1].page.tokens[0].text).toBe("five.");
    expect(pages[1].from).toBe(Math.round(0.6 * 30));
  });

  it("never runs a page across a cut", () => {
    const seg = (id: string, clipId: string, out: number) => ({ id, clipId, in: 0, out, role: "body" as const, note: "" });
    const two = { ...spoken, segments: [seg("s1", "a", 1), seg("s2", "b", 1)] };
    const said = {
      a: [{ text: "first", startMs: 800, endMs: 950, confidence: 1 }],
      b: [{ text: "second", startMs: 50, endMs: 300, confidence: 1 }],
    };
    expect(captionPages(two, said, 30).map((p) => p.page.tokens.map((t) => t.text.trim()))).toEqual([["first"], ["second"]]);
  });
  it("holds a page until its last word has ended, and never past the next page", () => {
    const pages = captionPages(spoken, words, 30);
    expect(pages.length).toBe(2);
    expect(pages[0].from).toBe(6);
    expect(pages[0].from + pages[0].durationInFrames).toBe(Math.round(1.9 * 30));
    expect(pages[1].from).toBe(90);
  });
  it("gives a short page the usual length, and nothing without words or captions", () => {
    const pages = captionPages(spoken, { a: [{ text: "Hi", startMs: 100, endMs: 300, confidence: 1 }] }, 30);
    expect(pages[0].durationInFrames).toBe(Math.round(1.2 * 30));
    expect(captionPages({ ...spoken, captions: null }, words, 30)).toEqual([]);
    expect(captionPages(spoken, { a: [] }, 30)).toEqual([]);
  });
});

describe("one text at a time", () => {
  const page = (from: number, durationInFrames: number) => ({ page: { text: "x", startMs: (from / 30) * 1000, durationMs: 1000, tokens: [] }, from, durationInFrames }) as unknown as ReturnType<typeof captionPages>[number];
  const text = (at: number, end: number) => ({ id: `t${at}`, at, end, text: "sliced to order", role: "mid", presetId: "caption_bar" }) as unknown as Edl["text"][number];
  it("leaves out spoken captions that start under a designed line, and ends the ones that run into it", () => {
    const out = clearOfText([page(0, 30), page(60, 40), page(270, 30), page(330, 30)], { text: [text(3, 4), text(9, 10.5)] }, 30);
    expect(out.map((p) => [p.from, p.durationInFrames])).toEqual([[0, 30], [60, 30], [330, 30]]);
  });
  it("clears the ending card too, and keeps everything when nothing else is on screen", () => {
    expect(clearOfText([page(0, 30), page(320, 40)], { text: [] }, 30, 339).map((p) => [p.from, p.durationInFrames])).toEqual([[0, 30], [320, 19]]);
    expect(clearOfText([page(0, 30)], { text: [] }, 30)).toHaveLength(1);
  });
});

describe("caption pages by word count", () => {
  it("cuts a page into runs of at most N words, each starting on its first word", async () => {
    const { splitPages } = await import("./timeline");
    const tok = (text: string, fromMs: number) => ({ text: ` ${text}`, fromMs, toMs: fromMs + 200 });
    const page = { text: " a b c d e", startMs: 0, durationMs: 1000, tokens: [tok("a", 0), tok("b", 200), tok("c", 400), tok("d", 600), tok("e", 800)] };
    const three = splitPages([page], 3);
    expect(three.map((p) => p.tokens.length)).toEqual([3, 2]);
    expect(three[1].startMs).toBe(600);
    expect(three[1].text).toBe(" d e");
    expect(splitPages([page], 1).map((p) => p.startMs)).toEqual([0, 200, 400, 600, 800]);
    expect(splitPages([page], 5)).toEqual([page]);
  });
});
