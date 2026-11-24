// Which stretch of a saved sound plays under one video. A playlist sound can
// be up to three minutes; a video is usually much shorter, so each video
// chooses where in the sound its music starts (Soundtrack.startSec). "Pick
// the best part for me" scores every stretch the length of the video from
// the sound's own levels: how loud it is, how much is going on (onsets), and
// whether it starts as the song lifts (a chorus or a drop usually does).
// It measures the signal; it doesn't know the song, the lyrics or what is
// popular. Starts land on the measured beat when there is one. Pure.

/** Hop of the level frames this reads (lib/audio/features.ts frameLevels). */
export const LEVEL_HOP_SEC = 0.01;
/** Candidates are this far apart when the sound has no steady beat. */
const STEP_SEC = 0.5;
/** How long the start of a stretch is compared with what comes before it. */
const LIFT_SEC = 2;
/** A sound at most this much longer than the video has no choice to make: it plays from the start. */
export const NO_CHOICE_SLACK_SEC = 1;

export type PartPick = {
  startSec: number;
  /** why, from what was measured, in plain words */
  reason: string;
};

export type BestParts = {
  /** false when the sound is about as long as the video or shorter: it plays from the start */
  choice: boolean;
  /** best first; each starts at least half a video away from the ones before it */
  picks: PartPick[];
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The furthest a stretch of `videoSec` can start in a sound `trackSec` long. */
export const latestStart = (trackSec: number, videoSec: number) => Math.max(0, r1(trackSec - videoSec));

/** A start kept inside the sound so the stretch never runs off its end (when it can). */
export const clampStart = (startSec: number, trackSec: number, videoSec: number) => Math.min(latestStart(trackSec, videoSec), Math.max(0, r1(Number.isFinite(startSec) ? startSec : 0)));

/**
 * The best stretches of a sound for a video `videoSec` long, from its RMS
 * levels at LEVEL_HOP_SEC. `beat` (tempo and first beat, seconds) puts the
 * candidate starts on the beat. Up to `count` picks.
 */
export function bestParts(rms: Float32Array, videoSec: number, beat?: { bpm: number; offsetSec: number } | null, count = 4): BestParts {
  const trackSec = rms.length * LEVEL_HOP_SEC;
  if (!(videoSec > 0) || trackSec <= videoSec + NO_CHOICE_SLACK_SEC) return { choice: false, picks: [{ startSec: 0, reason: "" }] };

  // Quarter-second blocks: mean level, and how much the level jumps (onsets: drums, notes, words).
  const per = Math.max(1, Math.round(0.25 / LEVEL_HOP_SEC));
  const blocks = Math.floor(rms.length / per);
  const level = new Float64Array(blocks), busy = new Float64Array(blocks);
  let prev = rms[0] ?? 0;
  for (let b = 0; b < blocks; b++) {
    let s = 0, o = 0;
    for (let i = b * per; i < (b + 1) * per; i++) {
      const cur = 0.5 * rms[i] + 0.5 * prev;
      o += Math.max(0, cur - prev);
      prev = cur;
      s += rms[i];
    }
    level[b] = s / per; busy[b] = o;
  }
  const sumOf = (a: Float64Array) => { const p = new Float64Array(a.length + 1); for (let i = 0; i < a.length; i++) p[i + 1] = p[i] + a[i]; return p; };
  const L = sumOf(level), B = sumOf(busy);
  const bs = 0.25;
  const mean = (p: Float64Array, fromSec: number, toSec: number) => {
    const a = Math.max(0, Math.min(blocks, Math.round(fromSec / bs))), z = Math.max(a + 1, Math.min(blocks, Math.round(toSec / bs)));
    return z > a && a < blocks ? (p[z] - p[a]) / (z - a) : 0;
  };

  // Candidate starts: on the beat grid when there is one, else every half second.
  const last = latestStart(trackSec, videoSec);
  const starts: number[] = [];
  const period = beat && beat.bpm > 0 ? 60 / beat.bpm : 0;
  if (period > 0.2) {
    const first = ((beat!.offsetSec % period) + period) % period;
    for (let t = first; t <= last + 1e-6; t += period) starts.push(r1(t));
    if (!starts.length) starts.push(0);
  } else {
    for (let t = 0; t <= last + 1e-6; t += STEP_SEC) starts.push(r1(t));
  }

  const rows = starts.map((s) => ({
    s,
    loud: mean(L, s, s + videoSec),
    busy: mean(B, s, s + videoSec),
    // The opening against the two seconds before it: positive when the stretch starts as the song lifts.
    lift: s >= 1 ? mean(L, s, s + LIFT_SEC) - mean(L, Math.max(0, s - LIFT_SEC), s) : 0,
  }));
  const norm = (k: "loud" | "busy" | "lift") => {
    const v = rows.map((r) => r[k]);
    const lo = Math.min(...v), hi = Math.max(...v);
    return (x: number) => (hi > lo ? (x - lo) / (hi - lo) : 0);
  };
  const nl = norm("loud"), nb = norm("busy"), nf = norm("lift");
  const scored = rows.map((r) => ({ ...r, nLoud: nl(r.loud), nBusy: nb(r.busy), nLift: nf(r.lift), score: 0.45 * nl(r.loud) + 0.3 * nb(r.busy) + 0.25 * nf(r.lift) }));
  const rank = (k: "loud" | "busy", x: number) => scored.filter((r) => r[k] <= x).length / scored.length;

  const order = [...scored].sort((a, b) => b.score - a.score || a.s - b.s);
  const chosen: typeof order = [];
  for (const r of order) {
    if (chosen.length >= count) break;
    if (chosen.every((c) => Math.abs(c.s - r.s) >= videoSec / 2)) chosen.push(r);
  }
  const secs = Math.round(videoSec);
  const picks = chosen.map((r) => {
    const why: string[] = [];
    if (rank("loud", r.loud) >= 0.8) why.push("one of its loudest stretches");
    if (rank("busy", r.busy) >= 0.8) why.push("a lot going on in the beat");
    if (r.lift > 0 && r.nLift >= 0.7) why.push("it starts as the song lifts");
    const what = why.length ? why.join(", ") : "the strongest mix of level and movement SOCIA measured";
    return { startSec: r.s, reason: `The ${secs} seconds from ${clock(r.s)}: ${what}.` };
  });
  return { choice: true, picks };
}

/** m:ss */
export const clock = (sec: number) => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
