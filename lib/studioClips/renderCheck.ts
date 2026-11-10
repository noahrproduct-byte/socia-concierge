// SOCIA watches the finished video before it is saved (Noah's editing
// playbook, 2026-11-10, phase 2: "inspect the rendered output, not merely
// assume the instructions were executed"). The cut check (cutCheck.ts) looks
// at the plan; this looks at the file the browser actually made:
//   length    the file runs as long as the cut
//   size      the file has the cut's width and height
//   black     a shot came out black, or a black frame flashes at a join
//   frozen    a shot holds still after its join before it starts moving: it
//             loaded late (what made Noah's transitions "not smooth", 2026-11-06)
//   silent    the video has no sound though the cut has music or speech
//   dropout   the sound stops and comes back in the middle
//   clipping  the sound hits full scale (crackles on phone speakers)
//   level     the sound is far quieter or louder than a post should be
// The first six are render faults: the editor makes the video once more and,
// if a fault is still there, asks before saving. Clipping and level are told,
// never blocking. This file plans which frames to look at and judges what was
// measured; inspectRender.ts reads the file. Pure, unit-tested.
import { timeline } from "./timeline";
import type { Edl } from "./types";
import { fmtClock } from "./types";

export const RENDER = {
  /** frames are read this wide (pixels) */
  frameWidth: 48,
  /** a frame this dark on average is black (0..1) */
  blackLuma: 0.03,
  /** consecutive frames this alike (mean absolute difference, 0..1) haven't changed */
  stillDiff: 0.002,
  /** a shot whose own middle changes this much a frame is moving */
  movingDiff: 0.01,
  /** frames read after each join settles; all of them still means the shot loaded late */
  settleFrames: 10,
  /** frames read in the middle of each shot */
  midFrames: 4,
  durationSlackSec: 0.25,
  /** 100 ms sound windows */
  windowSec: 0.1,
  silentDb: -60,
  /** a gap of silence this long between sound is a dropout */
  dropoutSec: 0.4,
  /** a window whose sample peak reaches this is at full scale */
  fullScaleDb: -0.1,
  /** more windows at full scale than this is clipping */
  clipWindows: 2,
  /** average level of the sound (dBFS over windows with sound) outside this range is told */
  level: [-30, -8] as const,
} as const;

export type ProbeKind = "join" | "mid";
export type Probe = { frame: number; kind: ProbeKind; shot: number };
export type RenderPlan = { probes: Probe[]; fps: number; durationSec: number; width: number; height: number; joins: number; shots: number };

/** The frames worth looking at: around every join until it settles, and a run in the middle of every shot. */
export function renderPlan(edl: Edl): RenderPlan {
  const tl = timeline(edl);
  const last = tl.durationFrames - 1;
  const probes: Probe[] = [];
  tl.segments.forEach((s, i) => {
    if (i) {
      // From just before the join to RENDER.settleFrames after the incoming shot is fully in.
      const settle = s.startFrame + s.overlapIn;
      for (let f = s.startFrame - 2; f < settle + RENDER.settleFrames; f++) if (f >= 0 && f <= last) probes.push({ frame: f, kind: "join", shot: i });
    }
    const mid = s.startFrame + Math.floor(s.durationFrames / 2) - 1;
    for (let k = 0; k < RENDER.midFrames; k++) if (mid + k >= 0 && mid + k <= last) probes.push({ frame: mid + k, kind: "mid", shot: i });
  });
  return { probes, fps: edl.fps, durationSec: tl.durationSec, width: edl.width, height: edl.height, joins: Math.max(0, tl.segments.length - 1), shots: tl.segments.length };
}

/** The middle of a frame, in seconds: where a frame is read so it never lands on the edge of the one before. */
export const probeTime = (frame: number, fps: number) => (frame + 0.5) / fps;

/** One read frame, as small grey values 0..1. */
export type FrameRead = { frame: number; grey: Float32Array };
export type SoundRead = { rmsDb: number; peakDb: number }[];
export type FileRead = { durationSec: number | null; width: number | null; height: number | null; frames: FrameRead[]; sound: SoundRead | null };

export type RenderFindingId = "length" | "size" | "black" | "frozen" | "silent" | "dropout" | "clipping" | "level";
export type RenderFinding = { id: RenderFindingId; detail: string; atSec: number | null; fault: boolean };
export type RenderReport = { findings: RenderFinding[]; line: string; levelDb: number | null };

const mean = (g: Float32Array) => { let s = 0; for (let i = 0; i < g.length; i++) s += g[i]; return g.length ? s / g.length : 0; };
/** Mean absolute difference of two frames, 0..1. */
export function frameDiff(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(a[i] - b[i]);
  return n ? s / n : 0;
}

/** What the file shows, judged against the cut it was made from. */
export function judgeRender(plan: RenderPlan, read: FileRead, expect: { sound: boolean; music: boolean }): RenderReport {
  const findings: RenderFinding[] = [];
  const at = (frame: number) => frame / plan.fps;
  const clock = (sec: number) => fmtClock(sec);

  if (read.durationSec != null && Math.abs(read.durationSec - plan.durationSec) > RENDER.durationSlackSec) {
    findings.push({ id: "length", atSec: null, fault: true, detail: `The finished video runs ${read.durationSec.toFixed(1)} s, but the cut is ${plan.durationSec.toFixed(1)} s.` });
  }
  if (read.width && read.height && (read.width !== plan.width || read.height !== plan.height)) {
    findings.push({ id: "size", atSec: null, fault: true, detail: `The finished video is ${read.width}×${read.height}, not ${plan.width}×${plan.height}.` });
  }

  const byFrame = new Map(read.frames.map((f) => [f.frame, f.grey]));
  const run = (shot: number, kind: ProbeKind) => plan.probes.filter((p) => p.shot === shot && p.kind === kind && byFrame.has(p.frame)).map((p) => ({ frame: p.frame, grey: byFrame.get(p.frame)! }));
  const black = (g: Float32Array) => mean(g) < RENDER.blackLuma;

  for (let shot = 0; shot < plan.shots; shot++) {
    const mid = run(shot, "mid");
    if (mid.length && mid.every((f) => black(f.grey))) {
      findings.push({ id: "black", atSec: at(mid[0].frame), fault: true, detail: `The shot at ${clock(at(mid[0].frame))} came out black.` });
      continue;
    }
    if (!shot) continue;
    const join = run(shot, "join");
    // A black frame with picture on both sides of it is a flash, not dark footage.
    const flash = join.find((f, k) => black(f.grey) && k > 0 && k < join.length - 1 && !black(join[k - 1].grey) && !black(join[k + 1].grey));
    if (flash) findings.push({ id: "black", atSec: at(flash.frame), fault: true, detail: `A black frame flashes at ${clock(at(flash.frame))}.` });
    // The frames after the join has settled: all still, while the shot's own middle moves, means it started late.
    const settled = join.slice(-RENDER.settleFrames);
    const moving = mid.slice(1).some((f, k) => frameDiff(mid[k].grey, f.grey) > RENDER.movingDiff);
    if (settled.length === RENDER.settleFrames && moving && settled.slice(1).every((f, k) => frameDiff(settled[k].grey, f.grey) < RENDER.stillDiff)) {
      findings.push({ id: "frozen", atSec: at(settled[0].frame), fault: true, detail: `The shot at ${clock(at(settled[0].frame))} holds still for ${(RENDER.settleFrames / plan.fps).toFixed(1)} s before it moves, so it loaded late.` });
    }
  }

  let levelDb: number | null = null;
  const sound = read.sound;
  const loud = sound ? sound.filter((w) => w.rmsDb > RENDER.silentDb) : [];
  if (expect.sound && !loud.length) {
    findings.push({ id: "silent", atSec: null, fault: true, detail: "The finished video has no sound, though the cut has music or speech." });
  } else if (sound && loud.length) {
    if (expect.music) {
      // Silence that sound comes back after (the track ending early isn't a dropout).
      const first = sound.findIndex((w) => w.rmsDb > RENDER.silentDb);
      const lastLoud = sound.length - 1 - [...sound].reverse().findIndex((w) => w.rmsDb > RENDER.silentDb);
      const need = Math.round(RENDER.dropoutSec / RENDER.windowSec);
      let gap = 0;
      for (let i = first; i <= lastLoud; i++) {
        gap = sound[i].rmsDb <= RENDER.silentDb ? gap + 1 : 0;
        if (gap === need) {
          const t = (i - need + 1) * RENDER.windowSec;
          findings.push({ id: "dropout", atSec: t, fault: true, detail: `The sound drops out at ${clock(t)} and comes back.` });
          break;
        }
      }
    }
    const full = sound.filter((w) => w.peakDb >= RENDER.fullScaleDb).length;
    if (full > RENDER.clipWindows) findings.push({ id: "clipping", atSec: null, fault: false, detail: `The sound hits full scale in ${full} places, which crackles on phone speakers. Lower the music or the clip volume in Look & sound.` });
    // Average level: power mean of the windows with sound.
    levelDb = Math.round(10 * Math.log10(loud.reduce((a, w) => a + Math.pow(10, w.rmsDb / 10), 0) / loud.length));
    if (levelDb < RENDER.level[0]) findings.push({ id: "level", atSec: null, fault: false, detail: `The sound is quiet (an average of ${levelDb} dB), so people will have to turn it up. Raise the clip or music volume in Look & sound.` });
    if (levelDb > RENDER.level[1]) findings.push({ id: "level", atSec: null, fault: false, detail: `The sound is very loud (an average of ${levelDb} dB). Lower the music or the clip volume in Look & sound.` });
  }

  const ok = [
    !findings.some((f) => f.id === "length" || f.id === "size") ? "the right length and size" : "",
    !findings.some((f) => f.id === "black" || f.id === "frozen") ? (plan.joins ? `no black or frozen frames at its ${plan.joins} join${plan.joins === 1 ? "" : "s"}` : "no black or frozen frames") : "",
    levelDb != null && !findings.some((f) => f.id === "clipping" || f.id === "dropout") ? `sound clear of clipping at an average of ${levelDb} dB` : "",
  ].filter(Boolean);
  const line = findings.length
    ? `SOCIA watched the finished video and found ${findings.length} thing${findings.length === 1 ? "" : "s"}${ok.length ? `; otherwise ${ok.join(", ")}` : ""}.`
    : `SOCIA watched the finished video: ${ok.join(", ")}.`;
  return { findings, line, levelDb };
}

/** Whether the video should be made again: something went wrong in the render itself. */
export const renderFaults = (r: RenderReport | null) => (r ? r.findings.filter((f) => f.fault) : []);
