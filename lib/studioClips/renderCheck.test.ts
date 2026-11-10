import { describe, expect, it } from "vitest";
import { judgeRender, renderFaults, renderPlan, probeTime, RENDER, type FileRead, type SoundRead } from "./renderCheck";
import { timeline } from "./timeline";
import type { Edl } from "./types";

const seg = (id: string, clipId: string, a: number, b: number, more: Partial<Edl["segments"][number]> = {}) => ({ id, clipId, in: a, out: b, role: "body" as const, note: "", ...more });
const edl: Edl = {
  version: 1, fps: 30, width: 1080, height: 1920, targetSec: { min: 5, max: 20 }, text: [], captions: null, enhance: [], audio: [], cta: null, music: null, caption: "", notes: [],
  segments: [seg("s1", "a", 0, 3), seg("s2", "b", 2, 5, { transition: "fade" }), seg("s3", "c", 0, 3)],
};
const plan = renderPlan(edl);
const tl = timeline(edl);

/** A moving picture: every frame a little different. */
const moving = (f: number) => new Float32Array(16).fill(0.4 + (f % 2) * 0.05);
const read = (grey: (f: number) => Float32Array, over: Partial<FileRead> = {}): FileRead => ({
  durationSec: tl.durationSec, width: 1080, height: 1920,
  frames: Array.from(new Set(plan.probes.map((p) => p.frame))).map((frame) => ({ frame, grey: grey(frame) })),
  sound: Array.from({ length: Math.ceil(tl.durationSec / RENDER.windowSec) }, () => ({ rmsDb: -18, peakDb: -6 })),
  ...over,
});
const ids = (r: ReturnType<typeof judgeRender>) => r.findings.map((f) => f.id);
const both = { sound: true, music: true };

describe("which frames SOCIA looks at", () => {
  it("reads around every join until it settles, and the middle of every shot, inside the video", () => {
    expect(plan.joins).toBe(2);
    expect(plan.shots).toBe(3);
    const join2 = plan.probes.filter((p) => p.kind === "join" && p.shot === 1).map((p) => p.frame);
    const s = tl.segments[1];
    expect(join2[0]).toBe(s.startFrame - 2);
    expect(join2[join2.length - 1]).toBe(s.startFrame + s.overlapIn + RENDER.settleFrames - 1);
    expect(plan.probes.every((p) => p.frame >= 0 && p.frame < tl.durationFrames)).toBe(true);
    expect(probeTime(30, 30)).toBeCloseTo(1.0167, 3);
  });
});

describe("watching the finished video", () => {
  it("passes a clean video and says what it checked", () => {
    const r = judgeRender(plan, read(moving), both);
    expect(r.findings).toEqual([]);
    expect(r.line).toBe("SOCIA watched the finished video: the right length and size, no black or frozen frames at its 2 joins, sound clear of clipping at an average of -18 dB.");
  });
  it("finds a shot that came out black, and a black flash at a join", () => {
    const shot = tl.segments[2];
    const blackShot = judgeRender(plan, read((f) => (f >= shot.startFrame ? new Float32Array(16) : moving(f))), both);
    expect(ids(blackShot)).toEqual(["black"]);
    expect(blackShot.findings[0].fault).toBe(true);
    const flashAt = tl.segments[1].startFrame + 3;
    expect(ids(judgeRender(plan, read((f) => (f === flashAt ? new Float32Array(16) : moving(f))), both))).toEqual(["black"]);
  });
  it("finds a shot that holds still after its join while its own middle moves (it loaded late)", () => {
    const s = tl.segments[1];
    const settle = s.startFrame + s.overlapIn;
    const late = judgeRender(plan, read((f) => (f >= settle && f < settle + RENDER.settleFrames ? new Float32Array(16).fill(0.5) : moving(f))), both);
    expect(ids(late)).toEqual(["frozen"]);
    // A still shot (a logo held) is still all the way through: not a fault.
    expect(ids(judgeRender(plan, read((f) => (f >= settle - 2 && f < s.startFrame + s.durationFrames ? new Float32Array(16).fill(0.5) : moving(f))), both))).toEqual([]);
  });
  it("finds the wrong length or size", () => {
    expect(ids(judgeRender(plan, read(moving, { durationSec: tl.durationSec - 1 }), both))).toEqual(["length"]);
    expect(ids(judgeRender(plan, read(moving, { width: 720, height: 1280 }), both))).toEqual(["size"]);
  });
  it("finds a video with no sound only when the cut should have some", () => {
    const quiet = read(moving, { sound: null });
    expect(ids(judgeRender(plan, quiet, both))).toEqual(["silent"]);
    expect(ids(judgeRender(plan, quiet, { sound: false, music: false }))).toEqual([]);
  });
  it("finds sound that drops out and comes back, but not music that ends a little early", () => {
    const sound = (gap: [number, number]): SoundRead => read(moving).sound!.map((w, i) => (i >= gap[0] && i < gap[1] ? { rmsDb: -120, peakDb: -120 } : w));
    const n = read(moving).sound!.length;
    expect(ids(judgeRender(plan, read(moving, { sound: sound([30, 36]) }), both))).toEqual(["dropout"]);
    expect(ids(judgeRender(plan, read(moving, { sound: sound([n - 6, n]) }), both))).toEqual([]);
  });
  it("tells clipping and a quiet mix without calling them render faults", () => {
    const hot = read(moving, { sound: read(moving).sound!.map((w, i) => (i % 10 === 0 ? { rmsDb: -12, peakDb: 0 } : w)) });
    const r = judgeRender(plan, hot, both);
    expect(ids(r)).toEqual(["clipping"]);
    expect(renderFaults(r)).toEqual([]);
    const soft = judgeRender(plan, read(moving, { sound: read(moving).sound!.map(() => ({ rmsDb: -38, peakDb: -25 })) }), both);
    expect(ids(soft)).toEqual(["level"]);
    expect(soft.levelDb).toBe(-38);
    expect(renderFaults(null)).toEqual([]);
  });
});
