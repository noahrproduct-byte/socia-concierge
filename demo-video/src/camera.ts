// A virtual camera over the 1920×1080 capture. `zoom` is relative to the
// layout's base framing; (cx, cy) is the source-pixel point kept in the
// middle of the window. The transform is clamped so the window never shows
// anything but footage.

import { Easing, interpolate } from "remotion";
import { SRC_H, SRC_W } from "./footage";

export type Cam = { zoom: number; cx: number; cy: number };
export type Window = { w: number; h: number };
export type BaseRegion = { w: number; h: number };

export const EASE = Easing.bezier(0.22, 0.9, 0.3, 1);

export function camTransform(cam: Cam, win: Window, base: BaseRegion): string {
  const s0 = Math.max(win.w / base.w, win.h / base.h);
  const s = s0 * cam.zoom;
  const fullW = SRC_W * s;
  const fullH = SRC_H * s;
  let tx = win.w / 2 - cam.cx * s;
  let ty = win.h / 2 - cam.cy * s;
  tx = fullW <= win.w ? (win.w - fullW) / 2 : Math.min(0, Math.max(win.w - fullW, tx));
  ty = fullH <= win.h ? (win.h - fullH) / 2 : Math.min(0, Math.max(win.h - fullH, ty));
  return `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(4)})`;
}

/** Eased move from one camera to another across [f0, f1]. */
export function camBetween(frame: number, f0: number, f1: number, a: Cam, b: Cam): Cam {
  const t = interpolate(frame, [f0, f1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  return { zoom: a.zoom + (b.zoom - a.zoom) * t, cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t };
}

/** Keyframed camera path: [[frame, cam], ...] with eased segments. */
export function camPath(frame: number, keys: [number, Cam][]): Cam {
  if (frame <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (frame <= keys[i][0]) return camBetween(frame, keys[i - 1][0], keys[i][0], keys[i - 1][1], keys[i][1]);
  }
  return keys[keys.length - 1][1];
}
