import { describe, expect, it } from "vitest";
import { applyCuts, momentsFrom, momentsSummary, presetForFix } from "./studioFixes";
import type { StudioAnalysis } from "./studio";

const base = (over: Partial<StudioAnalysis> = {}): StudioAnalysis => ({
  kind: "video", durationSec: 20, score: { overall: 64, label: "Needs work before posting" }, categories: [],
  observed: { subjectAppearsAt: 0, faceSeen: true, onScreenText: null, ctaDetected: false, summary: "" },
  markers: [], segments: [], topFixes: [], hooks: { current: "how our smash burgers start", options: [] }, cta: { current: null, options: [] },
  onScreenText: [], cuts: null, audio: { observed: "", direction: { style: "", bpm: "", texture: "", why: "" }, alternative: { style: "", bpm: "", texture: "", why: "" } },
  platformFit: [], compare: null, niche: null, caption: { current: null, suggestion: null },
  meta: { frames: 8, hadTranscript: true, analyzedAt: "", version: 1, autoTranscript: true },
  measuredAudio: null, ...over,
});

describe("moments SOCIA can act on", () => {
  it("turns the opening fix into a text line in a preset, with the hook in use", () => {
    const a = base({ topFixes: [{ title: "No words on the opening", observed: "obs", suggestion: "sug", kind: "opening", t: 0, apply: null }] });
    const ms = momentsFrom({ analysis: a, durationSec: 20, hook: "Wait for the cheese pull" });
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ capability: "text", priority: 1, t: 0, end: 3, text: { value: "Wait for the cheese pull", presetId: "hook_title" } });
  });
  it("drops a text fix whose line reads machine-made, and uses a Caption Bar for a long one", () => {
    const a = base({ hooks: { current: "Unlock the secret to perfect crust", options: [] }, topFixes: [{ title: "x", observed: "", suggestion: "", kind: "opening", t: 0, apply: null }] });
    expect(momentsFrom({ analysis: a, durationSec: 20 })).toHaveLength(0);
    expect(presetForFix("opening", "a line that is quite a bit longer than forty characters")).toBe("caption_bar");
    expect(presetForFix("ending", "come by tonight")).toBe("callout_box");
  });
  it("makes the ending a callout when there is an ask, a track when there is none", () => {
    const fix = { title: "Ending asks nothing", observed: "", suggestion: "", kind: "ending" as const, t: 18, apply: null };
    const withAsk = momentsFrom({ analysis: base({ topFixes: [fix] }), durationSec: 20, cta: "come by tonight" });
    expect(withAsk[0]).toMatchObject({ capability: "text", t: 16.5, end: 20, text: { presetId: "callout_box" } });
    const noAsk = momentsFrom({ analysis: base({ topFixes: [fix] }), durationSec: 20 });
    expect(noAsk[0].capability).toBe("music");
  });
  it("reads suggested cuts and measured pauses as one pauses moment", () => {
    const a = base({ cuts: { currentSec: 20, suggestedSec: 17, edits: [{ type: "remove", start: 8.1, end: 9.9, reason: "nothing happens" }], note: "" }, measuredAudio: { durationSec: 20, hasAudio: true, levelDb: -27, peakDb: -6, level: "quiet", audibleRatio: 0.8, silentOpeningSec: 0, longestPauseSec: 1.8, pauses: [{ start: 8.1, end: 9.9 }, { start: 14, end: 15.3 }], bpm: null, musicLikely: false } as never });
    const ms = momentsFrom({ analysis: a, durationSec: 20 });
    expect(ms.map((m) => m.capability)).toEqual(["noise", "pauses"]);
    expect(ms[1].cuts).toEqual([{ start: 8.1, end: 9.9, reason: "nothing happens" }]);
    expect(ms[0].sound).toEqual({ levelDb: -27, level: "quiet" });
  });
  it("adds captions only when speech was transcribed and no words were seen", () => {
    const none = { subjectAppearsAt: 0, faceSeen: true, ctaDetected: false, summary: "" };
    expect(momentsFrom({ analysis: base({ observed: { ...none, onScreenText: false } }), durationSec: 20 }).map((m) => m.capability)).toEqual(["captions"]);
    expect(momentsFrom({ analysis: base({ observed: { ...none, onScreenText: true } }), durationSec: 20 })).toHaveLength(0);
    expect(momentsFrom({ analysis: base({ observed: { ...none, onScreenText: false }, meta: { frames: 8, hadTranscript: false, analyzedAt: "", version: 1 } }), durationSec: 20 })).toHaveLength(0);
  });
  it("summarises plainly", () => {
    expect(momentsSummary([])).toMatch(/Nothing here needs a fix/);
    expect(momentsSummary([{ id: "a", capability: "text", priority: 1, t: 0, end: 3, title: "", observed: "", fix: "" }])).toBe("1 moment to change, 1 before anything else. Each is a fix SOCIA makes; the words and the cut stay yours.");
  });
});

describe("applying cuts to a one-clip edit", () => {
  const seg = [{ id: "s1", clipId: "c", in: 0, out: 20, role: "opener" as const, note: "" }];
  it("splits around the ranges and keeps the roles sane", () => {
    const out = applyCuts(seg, [{ start: 8, end: 10 }, { start: 14, end: 15.3 }]);
    expect(out.map((s) => [s.in, s.out, s.role])).toEqual([[0, 8, "opener"], [10, 14, "body"], [15.3, 20, "ending"]]);
  });
  it("drops slivers and leaves the cut alone when nothing is left", () => {
    expect(applyCuts(seg, [{ start: 19.5, end: 20 }]).map((s) => [s.in, s.out])).toEqual([[0, 19.5]]);
    expect(applyCuts(seg, [{ start: 0, end: 20 }])).toBe(seg);
    expect(applyCuts(seg, [])).toBe(seg);
  });
  it("maps output time to clip time on a trimmed clip", () => {
    const out = applyCuts([{ id: "s1", clipId: "c", in: 5, out: 15, role: "opener" as const, note: "" }], [{ start: 2, end: 3 }]);
    expect(out.map((s) => [s.in, s.out])).toEqual([[5, 7], [8, 15]]);
  });
});
