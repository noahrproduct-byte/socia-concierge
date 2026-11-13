import { describe, it, expect } from "vitest";
import { cleanPunches, joinedPunches, punchPieces, punchScaleAt, PUNCH_SCALE } from "./punch";
import { joinContinuous } from "./teach";
import { pacingReport } from "./pacing";
import type { Edl } from "./types";

describe("punch-ins on a continuous take", () => {
  it("keeps the joins of back-to-back pieces as punch-ins", () => {
    // Build 9d78cf7f (2026-11-12): six back-to-back pieces became one 13 s shot with no rhythm.
    const joined = joinContinuous([
      { clipId: "a", in: 1.8, out: 4 }, { clipId: "a", in: 4, out: 6.2 }, { clipId: "a", in: 6.2, out: 8.4 }, { clipId: "a", in: 8.4, out: 11 }, { clipId: "a", in: 11, out: 12.4 }, { clipId: "a", in: 12.4, out: 14.8 },
    ]);
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatchObject({ in: 1.8, out: 14.8, punches: [4, 6.2, 8.4, 11, 12.4] });
  });
  it("keeps punches inside the shot and apart", () => {
    expect(cleanPunches([5, 2.1, 2.5, 9.9, "x", 3.4], 2, 10)).toEqual([3.4, 5]);
    expect(cleanPunches(null, 0, 10)).toEqual([]);
    expect(joinedPunches({ in: 0, out: 4, punches: [2] }, { out: 9, punches: [6] }, 4)).toEqual([2, 4, 6]);
  });
  it("steps in on every other piece, starting wide", () => {
    const s = { punches: [4, 6.2] };
    expect(punchScaleAt(s, 3)).toBe(1);
    expect(punchScaleAt(s, 5)).toBe(PUNCH_SCALE);
    expect(punchScaleAt(s, 7)).toBe(1);
  });
  it("is paced as its pieces, not one long shot", () => {
    expect(punchPieces({ in: 1.8, out: 14.8, punches: [4, 6.2, 8.4, 11, 12.4] }).map((p) => +(p.out - p.in).toFixed(1))).toEqual([2.2, 2.2, 2.2, 2.6, 1.4, 2.4]);
    const edl = { fps: 30, width: 1080, height: 1920, text: [], audio: [], enhance: [], segments: [{ id: "s1", clipId: "a", in: 1.8, out: 14.8, role: "opener", note: "", punches: [4, 6.2, 8.4, 11, 12.4] }] } as unknown as Edl;
    const r = pacingReport(edl, [{ id: "a", position: 0, durationSec: 18 }] as never);
    expect(r.cuts).toBe(6);
    expect(r.parts.find((p) => p.id === "drag")?.ok).toBe(true);
  });
});
