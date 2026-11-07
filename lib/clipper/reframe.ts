// Moving the vertical frame with the video. A landscape source only shows about
// a third of its width at 9:16, so one fixed crop cuts people and on-screen text
// in half whenever they aren't in the middle. Claude looks at frames sampled from
// the clip and says what to keep centred when; this file turns that into a calm
// path (hold, then pan) the renderer and the preview both read. Pure, client-safe.

/** Be at `x` by `t` seconds into the clip. x is the crop's position: 0 at the source's left edge, 1 at its right. */
export type CropKey = { t: number; x: number };

/** How long a move takes. */
export const PAN_SEC = 0.8;
/** The frame holds at least this long, so it never wanders. */
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

/** How much of the source's width a 9:16 crop shows (1 when the source isn't wider than that). */
export const cropShare = (width: number, height: number): number => Math.min(1, (height * (9 / 16)) / width);

/** The crop position that keeps a point (0..1 across the source) in the middle of the frame. */
export function centerToX(center: number, share: number): number {
  if (share >= 1) return 0.5;
  return Math.min(1, Math.max(0, (center - share / 2) / (1 - share)));
}

/**
 * The model's answer made calm: in order, inside the clip, starting at 0, with
 * small moves dropped and at least MIN_HOLD_SEC between moves. Null when there
 * is nothing usable, and the crop stays where it is.
 */
export function cleanCropPath(raw: unknown, durationSec: number, share: number): CropKey[] | null {
  const moves = (raw as { moves?: unknown })?.moves;
  if (!Array.isArray(moves) || share >= 1) return null;
  const keys = (moves as { t?: unknown; center?: unknown }[])
    .map((m) => ({ t: Number(m.t), center: Number(m.center) }))
    .filter((m) => Number.isFinite(m.t) && Number.isFinite(m.center) && m.t >= 0 && m.t < durationSec)
    .sort((a, b) => a.t - b.t)
    .map((m) => ({ t: Math.round(m.t * 10) / 10, x: Math.round(centerToX(m.center, share) * 1000) / 1000 }));
  if (!keys.length) return null;
  const path: CropKey[] = [{ t: 0, x: keys[0].x }];
  for (const k of keys.slice(1)) {
    const last = path[path.length - 1];
    if (Math.abs(k.x - last.x) < MIN_MOVE) continue;
    if (k.t - last.t < MIN_HOLD_SEC) continue;
    path.push(k);
    if (path.length > MAX_MOVES) break;
  }
  return path;
}

const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/** Where the crop is `t` seconds into the clip: it holds, then eases over PAN_SEC to arrive at each key on time. */
export function cropXAt(path: CropKey[], t: number): number {
  if (!path.length) return 0.5;
  let x = path[0].x;
  for (let i = 1; i < path.length; i++) {
    const k = path[i];
    const start = k.t - PAN_SEC;
    if (t <= start) return x;
    if (t < k.t) return x + (k.x - x) * ease((t - start) / PAN_SEC);
    x = k.x;
  }
  return x;
}

/** A stored or sent path, checked. Null when it isn't one. */
export function readCropPath(v: unknown): CropKey[] | null {
  if (!Array.isArray(v) || !v.length) return null;
  const keys = v.filter((k): k is CropKey => Number.isFinite((k as CropKey)?.t) && Number.isFinite((k as CropKey)?.x));
  return keys.length === v.length ? keys.map((k) => ({ t: k.t, x: Math.min(1, Math.max(0, k.x)) })) : null;
}

export const REFRAME_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: { moves: { type: "array", items: { type: "object", additionalProperties: false, properties: { t: { type: "number" }, center: { type: "number" } }, required: ["t", "center"] } } },
  required: ["moves"],
} as const;

export const reframeSystem = (share: number) => `You are a video editor reframing a landscape clip for a vertical 9:16 video. The vertical frame shows only ${Math.round(share * 100)}% of the source's width, so you choose what is in it, and when to pan.

You get frames sampled from the clip, each labelled with its time in seconds, and what is being said at each time.

Return moves: each says that by time t (seconds into the clip) the frame should be centred on the point "center", where 0 is the source's left edge, 0.5 its middle and 1 its right edge. Estimate center from where the subject actually is in the image. The first move is at t 0.

How to choose:
- Normally keep the person speaking in the frame, with their whole face well inside it and not cut by the edge. Centre on the face.
- When on-screen text, a screen or an object appears and the frame can't show it from where it is, pan to it: centre on the text so as much of it as possible can be read, stay about 3 seconds, or longer if more lines are appearing, then come back to the person.
- Two people talking: stay on whoever is speaking.
- Hold still. A move needs a reason: the subject moved for good, the speaker changed or something new matters. Never follow small gestures or a leaning head, and leave at least 3 seconds between moves. Most clips need only a few moves, and a person who stays put needs just one.`;

/** The user message's text for one frame. */
export const frameLabel = (t: number) => `Frame at ${t.toFixed(1)} s`;
