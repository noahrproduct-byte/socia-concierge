// Motion inside a cut, as data: a slow zoom or pan with easing (Ken Burns),
// handheld shake, punch-ins on emphasised words, and a speed change with
// ramps. Everything here is a pure function of the frame, so the Remotion
// Player (preview) and the browser render (export) draw the same picture at
// the same frame. The composition turns the result into one CSS transform.
// Themes set the defaults (lib/studioClips/themes/apply.ts); the Effects tab
// changes them per cut. Unit-tested (motion.test.ts).
import type { MotionSpeed, MotionZoom, SegmentMotion } from "./types";
import { OUTPUT } from "./types";

export type Ease = MotionZoom["ease"];

/** A time 0..1 eased: in and out (cubic), out only, or straight. */
export function ease(k: number, kind: Ease = "inOut"): number {
  const t = Math.min(1, Math.max(0, k));
  if (kind === "linear") return t;
  if (kind === "out") return 1 - Math.pow(1 - t, 3);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** A value between numeric keyframes (sorted by t), eased between each pair; held outside the range. */
export function keyframeValue(t: number, keys: { t: number; v: number }[], kind: Ease = "inOut"): number {
  if (!keys.length) return 0;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1], b = keys[i];
    if (t <= b.t) { const span = b.t - a.t; return span > 0 ? a.v + (b.v - a.v) * ease((t - a.t) / span, kind) : b.v; }
  }
  return last.v;
}

/** A punch-in lasts this long, settling back over its length. */
export const PUNCH_SEC = 0.35;
/** How far handheld shake moves the picture at strength 1, as a share of the frame. */
const SHAKE_SPAN = 0.012;

/** Deterministic hand-held wobble, -1..1, smooth in time: two sines at unrelated rates. */
export function wobble(frame: number, seed: number, axis: 0 | 1): number {
  const t = frame / OUTPUT.fps + seed * 7.31;
  const a = axis ? 1.7 : 1.3, b = axis ? 2.9 : 3.7;
  return 0.6 * Math.sin(t * a * 2 + seed) + 0.4 * Math.sin(t * b * 2 + seed * 1.9);
}

export type Transform = { scale: number; /** shift as a share of the frame width / height */ x: number; y: number; /** transform origin, 0..1 each way */ ox: number; oy: number };

/**
 * The picture's transform at `frame` of a cut that runs `durationFrames`:
 * the slow move, the punch-ins and the shake together. `clipSec` is the time
 * in the source clip (for word punches); `seed` makes each cut's shake its own.
 */
export function motionAt(m: SegmentMotion | undefined, frame: number, durationFrames: number, clipSec: number, seed = 0): Transform {
  const out: Transform = { scale: 1, x: 0, y: 0, ox: 0.5, oy: 0.5 };
  if (!m) return out;
  if (m.zoom) {
    const k = durationFrames > 1 ? frame / (durationFrames - 1) : 1;
    out.scale = m.zoom.from + (m.zoom.to - m.zoom.from) * ease(k, m.zoom.ease);
    out.ox = m.zoom.x; out.oy = m.zoom.y;
  }
  if (m.punch?.at.length && m.punch.amount > 0) {
    for (const t of m.punch.at) {
      const d = clipSec - t;
      if (d >= 0 && d < PUNCH_SEC) { out.scale *= 1 + m.punch.amount * (1 - ease(d / PUNCH_SEC, "out")); break; }
    }
  }
  if (m.shake && m.shake > 0) {
    out.x = wobble(frame, seed, 0) * SHAKE_SPAN * m.shake;
    out.y = wobble(frame, seed, 1) * SHAKE_SPAN * m.shake;
    // The picture is a touch bigger so the shake never shows the edge.
    out.scale *= 1 + SHAKE_SPAN * 2 * m.shake;
  }
  return out;
}

/** The CSS for a transform, scale and shift in percent of the frame. */
export const transformCss = (t: Transform): { transform: string | undefined; transformOrigin: string } => ({
  transform: t.scale !== 1 || t.x !== 0 || t.y !== 0 ? `translate(${(t.x * 100).toFixed(3)}%, ${(t.y * 100).toFixed(3)}%) scale(${t.scale.toFixed(4)})` : undefined,
  transformOrigin: `${(t.ox * 100).toFixed(2)}% ${(t.oy * 100).toFixed(2)}%`,
});

// ---------------------------------------------------------------- speed ----

export const SPEED_MIN = 0.25, SPEED_MAX = 2;
/** One constant-rate piece of a cut: which part of the clip plays, how fast, and how many output frames it takes. */
export type SpeedPiece = { in: number; out: number; rate: number; frames: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A cut with a speed change as pieces the player can run at a constant rate:
 * a ramp in, the body, a ramp out. A ramp plays at the mean of 1 and the
 * rate (a straight line into the slow-mo, as a two-step ramp), so a 0.5x
 * cut with a 0.4 s ramp eases in rather than jumping. Without a speed, one
 * piece at 1x. Output frames are whole; the last piece absorbs the rounding.
 */
export function speedPieces(s: { in: number; out: number; motion?: SegmentMotion }): SpeedPiece[] {
  const len = Math.max(0, s.out - s.in);
  const sp = s.motion?.speed;
  const rate = sp ? Math.min(SPEED_MAX, Math.max(SPEED_MIN, sp.rate)) : 1;
  if (!sp || rate === 1 || len <= 0) return [{ in: s.in, out: s.out, rate: 1, frames: Math.max(1, Math.round(len * OUTPUT.fps)) }];
  const rampRate = (1 + rate) / 2;
  // A ramp is `rampSec` of output; it consumes rampSec * rampRate of clip. Two ramps at most a third of the clip each.
  const rampClip = Math.min(Math.max(0, sp.rampSec) * rampRate, len / 3);
  const rampOut = rampClip / rampRate;
  const body = len - 2 * rampClip;
  const pieces: SpeedPiece[] = [];
  if (rampClip > 0.02) pieces.push({ in: s.in, out: r2(s.in + rampClip), rate: rampRate, frames: Math.max(1, Math.round(rampOut * OUTPUT.fps)) });
  pieces.push({ in: r2(s.in + rampClip), out: r2(s.out - rampClip), rate, frames: Math.max(1, Math.round((body / rate) * OUTPUT.fps)) });
  if (rampClip > 0.02) pieces.push({ in: r2(s.out - rampClip), out: s.out, rate: rampRate, frames: Math.max(1, Math.round(rampOut * OUTPUT.fps)) });
  return pieces;
}

/** How many output frames a cut takes, speed changes included. */
export const segmentFrames = (s: { in: number; out: number; motion?: SegmentMotion }): number => speedPieces(s).reduce((a, p) => a + p.frames, 0);

/** The time in the clip that plays at output `frame` of the cut (speed pieces honoured). */
export function clipSecAt(s: { in: number; out: number; motion?: SegmentMotion }, frame: number): number {
  let f = frame;
  const pieces = speedPieces(s);
  for (const p of pieces) {
    if (f < p.frames) return Math.min(p.out, p.in + (f / OUTPUT.fps) * p.rate);
    f -= p.frames;
  }
  return s.out;
}

// ------------------------------------------------------------- bounding ----

const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/** A cut's motion from anywhere (the browser, stored JSON), bounded; undefined when there is nothing in it. */
export function sanitizeMotion(v: unknown, inSec: number, outSec: number): SegmentMotion | undefined {
  if (!v || typeof v !== "object") return undefined;
  const m = v as Record<string, unknown>;
  const out: SegmentMotion = {};
  const z = m.zoom as Record<string, unknown> | undefined;
  if (z && typeof z === "object") {
    const zoom: MotionZoom = { from: r2(num(z.from, 1, 1.6, 1)), to: r2(num(z.to, 1, 1.6, 1)), x: r2(num(z.x, 0, 1, 0.5)), y: r2(num(z.y, 0, 1, 0.5)), ease: z.ease === "linear" || z.ease === "out" ? z.ease : "inOut" };
    if (zoom.from !== 1 || zoom.to !== 1) out.zoom = zoom;
  }
  const shake = r2(num(m.shake, 0, 1, 0));
  if (shake > 0) out.shake = shake;
  const sp = m.speed as Record<string, unknown> | undefined;
  if (sp && typeof sp === "object") {
    const speed: MotionSpeed = { rate: r2(num(sp.rate, SPEED_MIN, SPEED_MAX, 1)), rampSec: r2(num(sp.rampSec, 0, 2, 0.4)) };
    if (speed.rate !== 1) out.speed = speed;
  }
  const pu = m.punch as Record<string, unknown> | undefined;
  if (pu && typeof pu === "object" && Array.isArray(pu.at)) {
    const at = (pu.at as unknown[]).filter((t): t is number => typeof t === "number" && Number.isFinite(t) && t >= inSec && t <= outSec).map(r2).sort((a, b) => a - b).slice(0, 40);
    const amount = r2(num(pu.amount, 0, 0.3, 0));
    if (at.length && amount > 0) out.punch = { at, amount };
  }
  if (m.locked === true) out.locked = true;
  return Object.keys(out).length ? out : undefined;
}
