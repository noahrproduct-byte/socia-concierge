// How a cut looks and sounds through its transitions (CapCut style, Noah
// 2026-11-02). A transition overlaps two cuts for a few frames
// (lib/studioClips/timeline.ts): the outgoing cut keeps playing underneath
// while the incoming one blends in on top.
//   fade  the incoming cut fades in
//   zoom  the outgoing cut zooms in and blurs outward; the incoming one starts
//         zoomed and blurred and settles sharp ("zoom blur")
//   whip  both slide sideways with a horizontal blur, like a fast pan ("whip blur")
//   flash a hard cut whose first two frames are washed to white (the sports-edit
//         flash frame measured in the viral-reels study); no overlap
// The blur values are pixels for @remotion/effects' WebGL blur and zoom-blur,
// which run in the Player and in the browser render alike.
//
// Noah, 2026-11-06: the mix of heavy zooms and whips looked bad, not smooth, and
// a short dissolve on the beat looked really good. Which join a cut SOCIA makes
// gets is decided in lib/studioClips/joins.ts; zoom and whip stay for the person
// to choose, at gentler values. Pure.
import type { TransitionKind } from "./types";

export type TransitionLook = {
  opacity: number;
  scale: number;
  /** horizontal offset, % of the frame width */
  x: number;
  /** vertical offset, % of the frame height (a tape roll) */
  y: number;
  /** tape noise over the frame, 0..1 (a tape transition's first frames) */
  noise: number;
  /** zoom-blur amount, px */
  zoomBlur: number;
  /** straight blur radius, px (horizontal only on a whip) */
  blur: number;
  whip: boolean;
  /** white wash over the frame, 0..1 (a flash transition's first frames) */
  flash: number;
  /** warm light-leak wash over the join, 0..1, peaking at the cut (a leak transition) */
  leak: number;
  /** the cut's sound level through its transitions, 0..1 */
  sound: number;
  /** a torn-paper edge is wiping this cut in (a tear transition): `wipe` is how far across the edge is, 0..1 */
  tearing: boolean;
  wipe: number;
  /** the blur runs one way only: along x (a whip) or along y (a motion blur); null = all ways */
  blurAxis: "x" | "y" | null;
};

/** A tape roll settles in this many frames. */
export const TAPE_FRAMES = 5;
/** A light leak builds over this many frames of the outgoing shot and fades over this many of the incoming one (about 0.4 s each way at 30 fps). */
export const LEAK_FRAMES = 12;

// Ease in and out (cubic), so a transition starts and lands softly.
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** How far into a transition: 1 at its start, 0 when it's done (incoming); 0 → 1 over the last frames (outgoing). */
export function progress(frame: number, frames: number, overlapIn: number, overlapOut: number): { inP: number; outP: number } {
  const inP = overlapIn > 0 ? 1 - ease(clamp01(frame / overlapIn)) : 0;
  const outP = overlapOut > 0 ? ease(clamp01((frame - (frames - overlapOut)) / overlapOut)) : 0;
  return { inP, outP };
}

/** The sound level of a cut at `frame`: it crossfades with the picture. */
export function transitionSound(frame: number, frames: number, overlapIn: number, overlapOut: number): number {
  const { inP, outP } = progress(frame, frames, overlapIn, overlapOut);
  return Math.min(1 - inP, 1 - outP);
}

export function transitionLook(a: { frame: number; frames: number; into?: TransitionKind; overlapIn: number; out?: TransitionKind; overlapOut: number }): TransitionLook {
  const { inP, outP } = progress(a.frame, a.frames, a.into ? a.overlapIn : 0, a.out ? a.overlapOut : 0);
  const look: TransitionLook = { opacity: 1, scale: 1, x: 0, y: 0, noise: 0, zoomBlur: 0, blur: 0, whip: false, flash: 0, leak: 0, sound: Math.min(1 - inP, 1 - outP), tearing: false, wipe: 0, blurAxis: null };
  switch (a.into) {
    case "fade": look.opacity = 1 - inP; break;
    // Slide: the incoming picture comes in from the right over the shot before, opaque the whole way.
    case "slide": look.x += 100 * inP; break;
    // Tape: the first frames roll down a little under tape noise, then settle; no overlap (a hard cut underneath).
    case "tape": { const k = a.frame < TAPE_FRAMES ? 1 - a.frame / TAPE_FRAMES : 0; look.y = -6 * k; look.noise = k; look.blur = 3 * k; break; }
    case "zoom": look.opacity = 1 - inP; look.scale *= 1 + 0.08 * inP; look.zoomBlur += 20 * inP; break;
    // The incoming whip is opaque for most of the move, so the frame never looks empty.
    case "whip": look.opacity = clamp01((1 - inP) / 0.4); look.x += 35 * inP; look.blur += 40 * inP; look.whip = true; break;
    case "flash": look.flash = a.frame === 0 ? 1 : a.frame === 1 ? 0.55 : 0; break;
    // Leak: a hard cut (no overlap, no second sound) under a warm wash that peaks on the cut: it fades off the
    // incoming shot's first frames here, and builds over the outgoing shot's last frames below.
    case "leak": look.leak = Math.max(look.leak, 1 - ease(clamp01(a.frame / LEAK_FRAMES))); break;
    // Tear: the incoming shot is whole and opaque under a torn-paper edge that crosses the frame (the edge is drawn by the layer).
    case "tear": look.tearing = inP > 0; look.wipe = 1 - inP; break;
    // Push in: the incoming shot starts pushed in close and soft, in the same place, and settles back sharp.
    case "pushin": look.opacity = clamp01((1 - inP) / 0.5); look.scale *= 1 + 0.4 * inP; look.zoomBlur += 28 * inP; break;
    // Motion blur: the incoming shot rises into place through a vertical blur, carrying the move across the cut.
    case "motionblur": look.opacity = clamp01((1 - inP) / 0.4); look.y += 30 * inP; look.blur += 40 * inP; look.blurAxis = "y"; break;
  }
  switch (a.out) {
    case "leak": look.leak = Math.max(look.leak, ease(clamp01((a.frame - (a.frames - LEAK_FRAMES)) / LEAK_FRAMES))); break;
    case "zoom": look.scale *= 1 + 0.08 * outP; look.zoomBlur += 20 * outP; break;
    // slide: the outgoing cut stays as it is under the incoming one.
    case "whip": look.x -= 35 * outP; look.blur += 40 * outP; look.whip = true; break;
    // tear: the outgoing shot stays whole under the tear.
    case "pushin": look.scale *= 1 + 0.5 * outP; look.zoomBlur += 28 * outP; break;
    case "motionblur": look.y -= 30 * outP; look.blur += 40 * outP; look.blurAxis = "y"; break;
    // fade: the outgoing cut stays as it is under the incoming one.
  }
  if (look.whip) look.blurAxis = "x";
  return look;
}
