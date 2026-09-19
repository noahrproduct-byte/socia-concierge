// Real captured frames (captures/_frames/<clip>/f_NNNNNN.jpg) addressed by
// source time. Each clip's meta.json carries the wall-clock timestamp of every
// frame plus the event markers capture.ts logged, so speed-ramps are exact.

import { staticFile } from "remotion";
import competitorsLoad from "../captures/_frames/competitors-load/meta.json";
import competitorsClick from "../captures/_frames/competitors-click/meta.json";
import scorer from "../captures/_frames/scorer/meta.json";
import dashboard from "../captures/_frames/dashboard/meta.json";
import chat from "../captures/_frames/chat/meta.json";

export type ClipName = "competitors-load" | "competitors-click" | "scorer" | "dashboard" | "chat";
type Meta = { durationMs: number; timestamps: number[]; markers: { name: string; t: number }[] };

export const CLIPS: Record<ClipName, Meta> = {
  "competitors-load": competitorsLoad,
  "competitors-click": competitorsClick,
  scorer,
  dashboard,
  chat,
};

export const SRC_W = 1920;
export const SRC_H = 1080;

export function marker(clip: ClipName, name: string): number {
  const m = CLIPS[clip].markers.find((x) => x.name === name);
  if (!m) throw new Error(`clip ${clip} has no marker ${name}`);
  return m.t;
}

/** Index of the last captured frame at or before `ms`. */
function frameIndexAt(clip: ClipName, ms: number): number {
  const ts = CLIPS[clip].timestamps;
  const t = Math.max(0, Math.min(ms, CLIPS[clip].durationMs));
  let lo = 0;
  let hi = ts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function frameSrc(clip: ClipName, ms: number): string {
  const idx = frameIndexAt(clip, ms);
  return staticFile(`_frames/${clip}/f_${String(idx).padStart(6, "0")}.jpg`);
}
