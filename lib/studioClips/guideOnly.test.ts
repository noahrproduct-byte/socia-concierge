import { describe, it, expect } from "vitest";
import { guideOnly } from "./server";
import type { StudioBuild } from "./types";

const build = {
  id: "b1", projectId: "p1", opportunityIdx: 0,
  edl: {
    version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 10, max: 30 },
    segments: [{ clipId: "c1", in: 1, out: 4 }], text: [{ text: "POV", at: 0, dur: 2 }], captions: { source: "transcript" },
    enhance: [{ kind: "denoise" }], audio: [{ clipId: "c1" }], cta: null, music: null, caption: "Caption", notes: ["Open on the oven"],
  },
  guide: [{ n: 1, text: "Open on the oven" }], caption: "Caption", createdAt: "2026-11-03T00:00:00Z", durationSec: 3,
  footageExpired: false, regenerations: 0, historyLength: 2, renderPath: null, renderedAt: null, postId: null,
} as unknown as StudioBuild;

describe("guideOnly: SOCIA's cut on plans without Make This Video", () => {
  it("keeps the edit guide, caption and notes", () => {
    const g = guideOnly(build);
    expect(g.guide).toEqual(build.guide);
    expect(g.caption).toBe("Caption");
    expect(g.edl.notes).toEqual(["Open on the oven"]);
  });

  it("leaves out the cut itself and its earlier versions, so it can't be pasted into an own edit", () => {
    const g = guideOnly(build);
    expect(g.edl.segments).toEqual([]);
    expect(g.edl.text).toEqual([]);
    expect(g.edl.enhance).toEqual([]);
    expect(g.edl.audio).toEqual([]);
    expect(g.edl.captions).toBeNull();
    expect(g.historyLength).toBe(0);
    expect(build.edl.segments.length).toBe(1);
  });
});
