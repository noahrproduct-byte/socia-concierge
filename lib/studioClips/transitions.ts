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
  /** zoom-blur amount, px */
  zoomBlur: number;
  /** straight blur radius, px (horizontal only on a whip) */
  blur: number;
  whip: boolean;
  /** white wash over the frame, 0..1 (a flash transition's first frames) */
  flash: number;
  /** the cut's sound level through its transitions, 0..1 */
  sound: number;
};

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
  const look: TransitionLook = { opacity: 1, scale: 1, x: 0, zoomBlur: 0, blur: 0, whip: false, flash: 0, sound: Math.min(1 - inP, 1 - outP) };
  switch (a.into) {
    case "fade": look.opacity = 1 - inP; break;
    case "zoom": look.opacity = 1 - inP; look.scale *= 1 + 0.08 * inP; look.zoomBlur += 20 * inP; break;
    // The incoming whip is opaque for most of the move, so the frame never looks empty.
    case "whip": look.opacity = clamp01((1 - inP) / 0.4); look.x += 35 * inP; look.blur += 40 * inP; look.whip = true; break;
    case "flash": look.flash = a.frame === 0 ? 1 : a.frame === 1 ? 0.55 : 0; break;
  }
  switch (a.out) {
    case "zoom": look.scale *= 1 + 0.08 * outP; look.zoomBlur += 20 * outP; break;
    case "whip": look.x -= 35 * outP; look.blur += 40 * outP; look.whip = true; break;
    // fade: the outgoing cut stays as it is under the incoming one.
  }
  return look;
}
