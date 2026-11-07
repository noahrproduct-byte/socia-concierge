// Editing a landscape clip for a vertical video: which shot, when. A 16:9 source
// shows only a third of its width at 9:16, so one fixed crop cuts people and
// on-screen text in half. Claude looks at frames sampled from the clip and picks
// shots, as an editor would: the whole picture when something doesn't fit, the
// person normally, a punch-in on a strong line. This file turns those into a
// calm path and says what the picture does at any moment, with the transitions
// an editor would use between them. The renderer and the preview both read it.
// Pure, client-safe.

export type ShotKind = "wide" | "person" | "tight";

/** From `t` seconds into the clip: `c`, `y` is the source point kept centred (0..1 each way), `s` how far in. */
export type CropKey = { t: number; c: number; y: number; s: number };

/** s = 1 fills the frame's height. Below 1 pulls back; the lowest value shows the source's whole width. */
export const TIGHT_SCALE = 1.25;

/** A zoom between shot sizes. */
export const ZOOM_SEC = 0.9;
/** A short move at the same size. */
export const MOVE_SEC = 0.6;
/** At the same size, a move further than this across the source is a hard cut: a long slide shows only wall. */
export const CUT_OVER = 0.3;
/** A shot holds at least this long. */
export const MIN_HOLD_SEC = 2.5;
/** Smaller moves than this are noise. */
const MIN_MOVE = 0.05;
export const MAX_MOVES = 12;

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
export const shotScale = (kind: ShotKind, share: number): number => (kind === "wide" ? share : kind === "tight" ? TIGHT_SCALE : 1);

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
    .filter((m) => Number.isFinite(m.t) && m.t >= 0 && m.t < durationSec && (m.shot === "wide" || m.shot === "person" || m.shot === "tight")
      && (m.shot === "wide" || Number.isFinite(m.c)) && Number.isFinite(m.y))
    .sort((a, b) => a.t - b.t)
    .map((m) => {
      const wide = m.shot === "wide";
      return { t: Math.round(m.t * 10) / 10, c: wide ? 0.5 : r3(clamp(m.c, 0, 1)), y: wide ? 0.5 : r3(clamp(m.y, 0, 1)), s: r3(shotScale(m.shot as ShotKind, share)) };
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

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

/** How the picture gets from one shot to the next: a hard cut for a long jump at the same size, otherwise a move or a zoom this long. */
export function transitionSec(a: CropKey, b: CropKey): number {
  if (a.s !== b.s) return ZOOM_SEC;
  return Math.abs(a.c - b.c) > CUT_OVER ? 0 : MOVE_SEC;
}

/** What the picture shows `t` seconds into the clip: it holds, then arrives at each shot on time. */
export function viewAt(path: CropKey[], t: number): { c: number; y: number; s: number } {
  if (!path.length) return { c: 0.5, y: 0.5, s: 1 };
  let at = path[0];
  for (let i = 1; i < path.length; i++) {
    const k = path[i];
    const len = transitionSec(at, k);
    const start = k.t - len;
    if (t < start || (len === 0 && t < k.t)) break;
    if (len > 0 && t < k.t) {
      const p = ease((t - start) / len);
      // Zoom evenly to the eye: scale moves in ratios, not steps.
      return { c: at.c + (k.c - at.c) * p, y: at.y + (k.y - at.y) * p, s: Math.exp(Math.log(at.s) + (Math.log(k.s) - Math.log(at.s)) * p) };
    }
    at = k;
  }
  return { c: at.c, y: at.y, s: at.s };
}

/**
 * Where the video sits in the output for a view, in percent of the output. The
 * source point stays centred, never past the picture's edge; where the picture
 * no longer fills the frame it sits in the middle, on black.
 */
export function viewBox(srcW: number, srcH: number, outW: number, outH: number, v: { c: number; y: number; s: number }): { position: "absolute"; width: string; height: string; left: string; top: string } {
  const srcA = srcW / srcH, outA = outW / outH;
  const coverW = srcA > outA ? (srcA / outA) * 100 : 100;
  const coverH = srcA > outA ? 100 : (outA / srcA) * 100;
  const w = coverW * v.s, h = coverH * v.s;
  const left = w >= 100 ? clamp(50 - v.c * w, 100 - w, 0) : (100 - w) / 2;
  const top = h >= 100 ? clamp(50 - v.y * h, 100 - h, 0) : (100 - h) / 2;
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
    moves: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { t: { type: "number" }, shot: { type: "string", enum: ["wide", "person", "tight"] }, center: { type: "number" }, y: { type: "number" } },
        required: ["t", "shot", "center", "y"],
      },
    },
  },
  required: ["moves"],
} as const;

export const reframeSystem = (share: number) => `You are a video editor turning a landscape clip into a vertical 9:16 video. You choose the shot for each moment, the way a good editor would. A vertical frame at full height shows only ${Math.round(share * 100)}% of the source's width.

You get frames sampled from the clip, each labelled with its time in seconds, and what is being said at each time.

The shots:
- "person": the normal shot. The picture fills the vertical frame, centred on the speaker's face, with their whole face well inside it.
- "wide": zoom out to show the whole picture, on black above and below. Use it whenever something that matters doesn't fit in the "person" shot: on-screen text, a list building up, a screen, a demo, or two people together. The speaker stays visible beside the text, so never pan away from the speaker to read text: go wide instead. Stay wide until the text is gone or has been read, at least 3 seconds, or longer if more lines are appearing.
- "tight": a punch-in on the face for the line that hits hardest: the claim, the payoff, the surprise. Rare: one or two in a clip, at most, and only when the speaker is steady and nothing on screen matters.

Return moves. Each says that by time t (seconds into the clip) this shot should be showing. The first move is at t 0.
- center: where to centre the shot across the source: 0 is the left edge, 0.5 the middle, 1 the right edge. Measure it from where the face actually is in the image. Ignored for "wide".
- y: where to centre it vertically: 0 is the top, 1 the bottom. Measure it from the face. Ignored for "wide".

How to edit:
- Start a shot just as its reason appears: go wide as the text comes on, not after.
- A shot needs a reason: text appeared or went, the speaker changed, or a line lands. Never follow small gestures or a leaning head. Leave at least 3 seconds between moves. A person who stays put with nothing on screen needs just one move.`;

/** The user message's text for one frame. */
export const frameLabel = (t: number) => `Frame at ${t.toFixed(1)} s`;
