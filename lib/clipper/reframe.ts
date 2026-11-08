// Editing a landscape clip for a vertical video: which shot, when. A 16:9 source
// shows only a third of its width at 9:16, so one fixed crop cuts people and
// on-screen text in half. Claude looks at frames sampled from the clip and picks
// shots, as an editor would: a band showing the person and the room, a tall crop
// when they already fill the picture, the whole picture when something doesn't
// fit. Noah's reference clips hold still and only change shot for a reason, so
// this file turns the answer into a calm path of hard cuts and says what the
// picture shows at any moment. The renderer and the preview both read it.
// Pure, client-safe.

export type ShotKind = "wide" | "band" | "person" | "tight";

/** From `t` seconds into the clip: `c`, `y` is the source point kept centred (0..1 each way), `s` how far in. */
export type CropKey = { t: number; c: number; y: number; s: number };

/** s = 1 fills the frame's height. Below 1 pulls back; the lowest value shows the source's whole width. */
export const TIGHT_SCALE = 1.25;
/** A roughly square picture across the frame, on black above and below. */
export const BAND_SCALE = 0.56;

/** A picture on black sits this far (percent of the frame) below the middle, leaving the top for the headline. */
const PICTURE_DROP = 6;

/** A shot holds at least this long unless the speaker changes (./speakers.ts). */
export const MIN_HOLD_SEC = 4;
/** Smaller moves than this are noise. */
const MIN_MOVE = 0.05;
export const MAX_MOVES = 6;

/** One sampled frame every this many seconds, up to MAX_SAMPLES. */
export const SAMPLE_EVERY_SEC = 2;
export const MAX_SAMPLES = 30;

export const sampleTimes = (durationSec: number): number[] => {
  const every = Math.max(SAMPLE_EVERY_SEC, durationSec / MAX_SAMPLES);
  const out: number[] = [];
  for (let t = Math.min(0.2, durationSec / 2); t < durationSec && out.length < MAX_SAMPLES; t += every) out.push(Math.round(t * 10) / 10);
  return out;
};

/** How much of the source's width a 9:16 crop shows at full height (1 when the source isn't wider than that). */
export const cropShare = (width: number, height: number): number => Math.min(1, (height * (9 / 16)) / width);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The scale of a shot. Wide fits the source's whole width: share of a full-height crop. */
export const shotScale = (kind: ShotKind, share: number): number => (kind === "wide" ? share : kind === "band" ? Math.max(share, BAND_SCALE) : kind === "tight" ? TIGHT_SCALE : 1);

/**
 * The model's answer made calm: in order, inside the clip, starting at 0, with
 * small changes dropped and at least MIN_HOLD_SEC between shots. Null when there
 * is nothing usable, and the frame stays where it is.
 */
export function cleanCropPath(raw: unknown, durationSec: number, share: number): CropKey[] | null {
  const moves = (raw as { moves?: unknown })?.moves;
  if (!Array.isArray(moves) || share >= 1) return null;
  const keys: CropKey[] = (moves as { t?: unknown; shot?: unknown; center?: unknown; y?: unknown }[])
    .map((m) => ({ t: Number(m.t), shot: m.shot, c: Number(m.center), y: m.y == null ? 0.4 : Number(m.y) }))
    .filter((m) => Number.isFinite(m.t) && m.t >= 0 && m.t < durationSec && (m.shot === "wide" || m.shot === "band" || m.shot === "person" || m.shot === "tight")
      && (m.shot === "wide" || Number.isFinite(m.c)) && Number.isFinite(m.y))
    .sort((a, b) => a.t - b.t)
    .map((m) => {
      const wide = m.shot === "wide";
      return { t: Math.round(m.t * 10) / 10, c: wide ? 0.5 : r3(clamp(m.c, 0, 1)), y: wide || m.shot === "band" ? 0.5 : r3(clamp(m.y, 0, 1)), s: r3(shotScale(m.shot as ShotKind, share)) };
    });
  if (!keys.length) return null;
  const path: CropKey[] = [{ ...keys[0], t: 0 }];
  for (const k of keys.slice(1)) {
    const last = path[path.length - 1];
    if (k.s === last.s && Math.abs(k.c - last.c) < MIN_MOVE && Math.abs(k.y - last.y) < MIN_MOVE) continue;
    if (k.t - last.t < MIN_HOLD_SEC) continue;
    path.push(k);
    if (path.length > MAX_MOVES) break;
  }
  return path;
}

/** What the picture shows `t` seconds into the clip. Every change is a hard cut. */
export function viewAt(path: CropKey[], t: number): { c: number; y: number; s: number } {
  if (!path.length) return { c: 0.5, y: 0.5, s: 1 };
  let at = path[0];
  for (const k of path.slice(1)) {
    if (t < k.t) break;
    at = k;
  }
  return { c: at.c, y: at.y, s: at.s };
}

/**
 * Where the video sits in the output for a view, in percent of the output. The
 * source point stays centred, never past the picture's edge; where the picture
 * no longer fills the frame it sits just below the middle, on black.
 */
export function viewBox(srcW: number, srcH: number, outW: number, outH: number, v: { c: number; y: number; s: number }): { position: "absolute"; width: string; height: string; left: string; top: string } {
  const srcA = srcW / srcH, outA = outW / outH;
  const coverW = srcA > outA ? (srcA / outA) * 100 : 100;
  const coverH = srcA > outA ? 100 : (outA / srcA) * 100;
  const w = coverW * v.s, h = coverH * v.s;
  const left = w >= 100 ? clamp(50 - v.c * w, 100 - w, 0) : (100 - w) / 2;
  const top = h >= 100 ? clamp(50 - v.y * h, 100 - h, 0) : (100 - h) / 2 + PICTURE_DROP;
  const pct = (n: number) => `${Math.round(n * 100) / 100}%`;
  return { position: "absolute", width: pct(w), height: pct(h), left: pct(left), top: pct(top) };
}

/** A stored or sent path, checked. Null when it isn't one. */
export function readCropPath(v: unknown): CropKey[] | null {
  if (!Array.isArray(v) || !v.length) return null;
  const ok = v.every((k) => [k?.t, k?.c, k?.y, k?.s].every(Number.isFinite));
  return ok ? (v as CropKey[]).map((k) => ({ t: k.t, c: clamp(k.c, 0, 1), y: clamp(k.y, 0, 1), s: clamp(k.s, 0.1, 2) })) : null;
}

export const REFRAME_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    camera: { type: "string", enum: ["one_camera", "changes"] },
    framing: { type: "string", enum: ["band", "tall"] },
    people: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { speaker: { type: "string" }, center: { type: "number" }, y: { type: "number" } },
        required: ["speaker", "center", "y"],
      },
    },
    moves: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { t: { type: "number" }, shot: { type: "string", enum: ["wide", "band", "person", "tight"] }, center: { type: "number" }, y: { type: "number" } },
        required: ["t", "shot", "center", "y"],
      },
    },
  },
  required: ["camera", "framing", "people", "moves"],
} as const;

export const reframeSystem = (share: number) => `You are a video editor turning a landscape clip into a vertical 9:16 video. A vertical frame at full height shows only ${Math.round(share * 100)}% of the source's width.

You get frames sampled from the clip, each labelled with its time in seconds, and what is said at each time. When the speakers are known, each line says who: Speaker A, Speaker B and so on.

First describe the clip:
- camera: "one_camera" when the source holds one fixed view for the whole clip. "changes" when the source itself switches between different shots.
- framing: "tall" only when one person already fills the source in a close-up, so a full-height crop looks natural. "band" for everything else: someone seated with room around them, or several people in one view.
- people: each person you can see who speaks. speaker is their label from the transcript. center and y are where their face is, across and down the source, 0 to 1. Work out who is who by matching the times a label speaks to the frames where that person's mouth is open or they are gesturing. Leave out anyone you can't see, such as a host off camera. Empty when the transcript has no labels.

Then return moves: by time t (seconds into the clip) this shot should be showing. The first move is at t 0. Every change is a hard cut.
- "band": the normal shot for a landscape source. A roughly square picture across the frame with black above and below, showing the person and some of the room.
- "person": a full-height crop on one face. Only when framing is "tall".
- "wide": the whole source, on black. Use it when something that matters won't fit otherwise: on-screen text, a list building up, a screen or a demo.
- "tight": a closer crop on the face. At most one in a clip, for the single line that hits hardest, and usually none.
- center: where to centre the shot across the source, measured from where the face actually is. Ignored for "wide".
- y: where to centre it down the source, measured from the face. Ignored for "wide" and "band".

How to edit: hold still. Good clips hold one shot for many seconds and never add movement for energy. Most clips need a single move at t 0. Add another only for a real reason: text or a screen appeared or went, or the source itself switched to a different shot and the person is now somewhere else. Never follow gestures or a leaning head, and leave at least 4 seconds between moves.`;

/** The user message's text for one frame. */
export const frameLabel = (t: number) => `Frame at ${t.toFixed(1)} s`;
