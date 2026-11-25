// The music of a reference video, measured, and where a song of the person's own
// lines up with it. Everything here is read from the signal (levels every 10 ms,
// lib/audio/features.ts) and the reference's own cuts and speech; nothing names a
// song, an artist or a recording (Noah, 2026-11-25: no song naming for now).
//
//   readReferenceMusic: is there music under the reference, its tempo and beat,
//     where its energy lifts (the "drops"), whether its cuts land on the beat,
//     how much of it is talking, and its energy contour (dB every ENV_HOP_SEC).
//   alignSection: slides the reference's contour along a song's contour (at a few
//     playback speeds, since a Reel's sound is often sped up or slowed down) and
//     finds the stretch of the song that moves the same way. "matched" when one
//     stretch stands clearly above every other (almost always the same recording);
//     "suggested" when the shape is similar but not unmistakable; "none" otherwise.
//   rankForReference: the person's sounds, closest first, by that alignment and
//     by tempo.
//
// Pure and browser-safe; unit-tested in referenceMusic.test.ts.

/** Hop of the energy contour. */
export const ENV_HOP_SEC = 0.05;
/** Hop of the level frames this reads (lib/audio/features.ts frameLevels). */
const LEVEL_HOP_SEC = 0.01;
/** Below this the contour counts as silence. */
const FLOOR_DB = -60;
/** Playback speeds tried: the reference may play the song up to 6% faster or slower. */
export const SPEEDS = [1, 0.97, 1.03, 0.94, 1.06] as const;
/** Scores (weighted correlation, -1..1) for each verdict. */
export const MATCHED_AT = 0.7;
export const SUGGESTED_AT = 0.35;
/** How far the best stretch must stand above the best one at least MARGIN_SEC away to be "matched". */
const MATCH_MARGIN = 0.08;
const MARGIN_SEC = 3;
/** A rise this big (dB, one second after against one second before) is a drop. */
const DROP_DB = 6;
/** At most this much of the reference is compared. */
const ALIGN_MAX_SEC = 30;

export type SpeechSpan = [number, number];

export type ReferenceMusic = {
  durationSec: number;
  /** anything audible at all */
  hasSound: boolean;
  /** 0..1, lib/audio/features.ts musicScoreFrom */
  musicScore: number;
  musicLikely: boolean;
  /** the beat, when a steady one was measured */
  bpm: number | null;
  beatOffsetSec: number | null;
  /** seconds where the energy lifts sharply, at most three, earliest first */
  drops: number[];
  /** share of the reference's cuts that land on its beat; null without a beat or with fewer than two cuts */
  cutsOnBeat: number | null;
  /** share of the reference that is someone talking */
  speechShare: number;
  /** the talking, as time spans */
  speech: SpeechSpan[];
  /** how much quieter the sound is without the talking than with it (dB); null without both */
  underTalkDb: number | null;
  /** energy contour, dB every ENV_HOP_SEC */
  env: number[];
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const db = (v: number) => (v > 0 ? Math.max(FLOOR_DB, 20 * Math.log10(v)) : FLOOR_DB);

/** The energy contour of a sound from its 10 ms RMS levels: mean level per ENV_HOP_SEC, in dB. */
export function envelopeFromRms(rms: ArrayLike<number>, levelHopSec = LEVEL_HOP_SEC): number[] {
  const per = Math.max(1, Math.round(ENV_HOP_SEC / levelHopSec));
  const out: number[] = [];
  for (let i = 0; i + per <= rms.length; i += per) {
    let s = 0;
    for (let k = i; k < i + per; k++) s += rms[k];
    out.push(r1(db(s / per)));
  }
  return out;
}

/** Spoken words merged into spans (gaps under 0.4 s join). */
export function speechSpans(words: { startMs: number; endMs: number }[] | null | undefined): SpeechSpan[] {
  const spans: SpeechSpan[] = [];
  for (const w of [...(words ?? [])].sort((a, b) => a.startMs - b.startMs)) {
    const a = w.startMs / 1000, b = Math.max(a, w.endMs / 1000);
    const last = spans[spans.length - 1];
    if (last && a - last[1] < 0.4) last[1] = Math.max(last[1], b);
    else spans.push([a, b]);
  }
  return spans.map(([a, b]) => [r2(a), r2(b)]);
}

const inSpans = (t: number, spans: SpeechSpan[], pad = 0) => spans.some(([a, b]) => t >= a - pad && t <= b + pad);

/** Seconds where the contour rises by DROP_DB or more (one second after against one second before). */
export function dropsOf(env: number[], speech: SpeechSpan[] = [], max = 3): number[] {
  const w = Math.round(1 / ENV_HOP_SEC);
  const rise: number[] = env.map(() => -Infinity);
  for (let i = w; i + w <= env.length; i++) {
    let before = 0, after = 0;
    for (let k = i - w; k < i; k++) before += env[k];
    for (let k = i; k < i + w; k++) after += env[k];
    rise[i] = (after - before) / w;
  }
  const picks: number[] = [];
  // Only the peak of each rise, within a second either side.
  const peak = (i: number) => { for (let j = Math.max(0, i - w); j <= Math.min(rise.length - 1, i + w); j++) if (rise[j] > rise[i]) return false; return true; };
  const order = rise.map((v, i) => [v, i] as const).filter(([v, i]) => v >= DROP_DB && peak(i)).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    const t = i * ENV_HOP_SEC;
    if (t < 1) continue;
    // Someone starting to talk lifts the level too; that's not the music.
    if (speech.some(([a]) => Math.abs(a - t) < 0.4)) continue;
    if (picks.some((p) => Math.abs(p - t) < 2)) continue;
    picks.push(r2(t));
    if (picks.length >= max) break;
  }
  return picks.sort((a, b) => a - b);
}

/** Share of cuts within a quarter beat (at least 80 ms) of the beat grid. */
export function cutsOnBeatShare(cuts: number[] | null | undefined, beat: { bpm: number; offsetSec: number } | null | undefined): number | null {
  if (!beat || !(beat.bpm > 0) || !cuts || cuts.length < 2) return null;
  const period = 60 / beat.bpm;
  const tol = Math.max(0.08, period / 4);
  const on = cuts.filter((c) => {
    const k = Math.round((c - beat.offsetSec) / period);
    return Math.abs(c - (beat.offsetSec + k * period)) <= tol;
  }).length;
  return r2(on / cuts.length);
}

/** Everything measured about a reference's music. */
export function readReferenceMusic(input: {
  rms: ArrayLike<number>;
  durationSec: number;
  musicScore: number;
  musicLikelyAt: number;
  beat: { bpm: number; offsetSec: number } | null;
  words?: { startMs: number; endMs: number }[] | null;
  cuts?: number[] | null;
}): ReferenceMusic {
  const env = envelopeFromRms(input.rms);
  const speech = speechSpans(input.words);
  const audible = env.filter((v) => v > -45).length;
  const hasSound = env.length > 0 && audible / env.length > 0.05;
  const musicLikely = hasSound && input.musicScore >= input.musicLikelyAt;
  const talk = speech.reduce((s, [a, b]) => s + (b - a), 0);
  let inTalk = 0, nIn = 0, outTalk = 0, nOut = 0;
  env.forEach((v, i) => { if (v <= FLOOR_DB + 1) return; if (inSpans(i * ENV_HOP_SEC, speech)) { inTalk += v; nIn++; } else { outTalk += v; nOut++; } });
  const beat = musicLikely ? input.beat : null;
  return {
    durationSec: r1(input.durationSec),
    hasSound,
    musicScore: r2(input.musicScore),
    musicLikely,
    bpm: beat ? Math.round(beat.bpm) : null,
    beatOffsetSec: beat ? r2(beat.offsetSec) : null,
    drops: musicLikely ? dropsOf(env, speech) : [],
    cutsOnBeat: cutsOnBeatShare(input.cuts, beat),
    speechShare: input.durationSec > 0 ? r2(Math.min(1, talk / input.durationSec)) : 0,
    speech,
    underTalkDb: musicLikely && nIn > 20 && nOut > 20 ? r1(outTalk / nOut - inTalk / nIn) : null,
    env,
  };
}

// ---------------------------------------------------------------------------
// Lining a song up with the reference

export type Alignment = {
  /** where in the song the reference's music starts, seconds */
  startSec: number;
  /** -1..1 */
  score: number;
  /** the reference plays the song this much faster (>1) or slower (<1) */
  speed: number;
  level: "matched" | "suggested" | "none";
};

/** Rising edges of a contour: where things start. */
function onsets(env: ArrayLike<number>): Float64Array {
  const out = new Float64Array(env.length);
  for (let i = 1; i < env.length; i++) out[i] = Math.max(0, env[i] - env[i - 1]);
  return out;
}

/** Value of a contour at a fractional index (linear). */
const at = (a: ArrayLike<number>, x: number) => {
  const i = Math.floor(x), f = x - i;
  if (i < 0 || i >= a.length) return NaN;
  return i + 1 < a.length ? a[i] * (1 - f) + a[i + 1] * f : a[i];
};

/** Weighted Pearson correlation of x and y (NaN entries skipped). */
function corr(x: ArrayLike<number>, y: ArrayLike<number>, w: ArrayLike<number>): number {
  let sw = 0, sx = 0, sy = 0;
  for (let i = 0; i < x.length; i++) { if (Number.isNaN(y[i]) || !w[i]) continue; sw += w[i]; sx += w[i] * x[i]; sy += w[i] * y[i]; }
  if (sw <= 0) return 0;
  const mx = sx / sw, my = sy / sw;
  let cxy = 0, cxx = 0, cyy = 0;
  for (let i = 0; i < x.length; i++) {
    if (Number.isNaN(y[i]) || !w[i]) continue;
    const dx = x[i] - mx, dy = y[i] - my;
    cxy += w[i] * dx * dy; cxx += w[i] * dx * dx; cyy += w[i] * dy * dy;
  }
  return cxx > 1e-9 && cyy > 1e-9 ? cxy / Math.sqrt(cxx * cyy) : 0;
}

/**
 * Where in a song (its contour, `track`, at ENV_HOP_SEC) the reference's music sits.
 * Talking in the reference barely counts (the voice drowns the music under it), silence not at all.
 */
export function alignSection(ref: Pick<ReferenceMusic, "env" | "speech" | "musicLikely">, track: number[]): Alignment {
  const none: Alignment = { startSec: 0, score: 0, speed: 1, level: "none" };
  // The first ALIGN_MAX_SEC of the reference is plenty to recognise a stretch, and keeps this quick in the browser.
  const env = ref.env.slice(0, Math.round(ALIGN_MAX_SEC / ENV_HOP_SEC));
  const n = env.length;
  if (!ref.musicLikely || n < 40 || track.length < n * 0.6) return none;
  const weight = env.map((v, i) => (v <= FLOOR_DB + 1 ? 0 : inSpans(i * ENV_HOP_SEC, ref.speech, 0.1) ? 0.1 : 1));
  const refOn = onsets(env);
  const trackOn = onsets(track);
  const y = new Float64Array(n), yOn = new Float64Array(n);
  const scoreAt = (o: number, speed: number) => {
    for (let k = 0; k < n; k++) { const x = o + k * speed; y[k] = at(track, x); yOn[k] = at(trackOn, x); }
    return 0.6 * corr(env, y, weight) + 0.4 * corr(refOn, yOn, weight);
  };
  const lastFor = (speed: number) => Math.max(0, Math.floor(track.length - 1 - (n - 1) * speed));
  // Coarse: every other frame, every speed; the best score per start.
  const best = new Map<number, { score: number; speed: number }>();
  for (const speed of SPEEDS) {
    for (let o = 0; o <= lastFor(speed); o += 2) {
      const s = scoreAt(o, speed);
      const cur = best.get(o);
      if (!cur || s > cur.score) best.set(o, { score: s, speed });
    }
  }
  let top = -Infinity, topAt = 0, topSpeed = 1;
  for (const [o, v] of best) if (v.score > top) { top = v.score; topAt = o; topSpeed = v.speed; }
  if (!Number.isFinite(top)) return none;
  // Fine: every frame around the best, at its speed.
  for (let o = Math.max(0, topAt - 2); o <= Math.min(lastFor(topSpeed), topAt + 2); o++) {
    const s = scoreAt(o, topSpeed);
    if (s > top) { top = s; topAt = o; }
  }
  let second = -Infinity;
  const away = MARGIN_SEC / ENV_HOP_SEC;
  for (const [o, v] of best) if (Math.abs(o - topAt) >= away && v.score > second) second = v.score;
  const clear = !Number.isFinite(second) || top - second >= MATCH_MARGIN;
  const level = top >= MATCHED_AT && clear ? "matched" : top >= SUGGESTED_AT ? "suggested" : "none";
  return { startSec: r2(topAt * ENV_HOP_SEC), score: r2(top), speed: topSpeed, level };
}

/** 0..1: how close two tempos are, counting half and double time as the same feel. */
export function tempoFit(a: number | null, b: number | null): number {
  if (!a || !b) return 0;
  const d = Math.min(...[1, 2, 0.5].map((m) => Math.abs(Math.log2((b * m) / a))));
  return r2(Math.max(0, 1 - d / 0.1));
}

export type Candidate = { id: string; env: number[]; bpm: number | null };
export type Ranked = { id: string; alignment: Alignment; tempo: number; score: number };

/** The person's sounds against the reference, closest first: the same recording, then the most alike. */
export function rankForReference(ref: ReferenceMusic, candidates: Candidate[]): Ranked[] {
  return candidates
    .map((c) => {
      const alignment = alignSection(ref, c.env);
      const tempo = tempoFit(ref.bpm, c.bpm);
      const shape = Math.max(0, alignment.score);
      const score = r2((alignment.level === "matched" ? 1 : 0) + (ref.bpm ? 0.5 * tempo + 0.5 * shape : shape));
      return { id: c.id, alignment, tempo, score };
    })
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// In words

const clock = (sec: number) => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** What SOCIA heard, line by line, for the Reference music card. */
export function referenceMusicLines(m: ReferenceMusic): string[] {
  if (!m.hasSound) return ["The reference has no sound."];
  if (!m.musicLikely) return [m.speechShare >= 0.3 ? "Mostly talking. SOCIA heard no clear music under it." : "SOCIA heard no clear music in it, only other sound."];
  const lines = [m.bpm ? `Music with a steady beat, about ${m.bpm} BPM.` : "Music, with no steady beat SOCIA could measure."];
  if (m.drops.length) lines.push(`The energy lifts at ${list(m.drops.map(clock))}.`);
  if (m.cutsOnBeat != null) lines.push(m.cutsOnBeat >= 0.6 ? "Its cuts land on the beat." : m.cutsOnBeat < 0.35 ? "Its cuts don't follow the beat." : "Some of its cuts land on the beat.");
  if (m.speechShare >= 0.2) lines.push(m.underTalkDb != null && m.underTalkDb <= -6 ? "Someone talks over it, with the music low underneath." : "Someone talks over it.");
  return lines;
}

/** A song's part in words: "0:42 to 0:57". */
export const partLabel = (startSec: number, lengthSec: number) => `${clock(startSec)} to ${clock(startSec + lengthSec)}`;
