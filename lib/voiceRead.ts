// What kind of voice a video has, read from its audio alone: whether someone
// is speaking, and how low or high the voice is. It is used on an account's
// own and its competitors' best Reels (lib/videoStyleLoad.ts) so a voiceover
// can start from the kind of voice those videos use
// (lib/animated/voicePick.ts). Nothing here recognises a person or a named
// voice; it measures pitch and rhythm. Pure and browser-safe.
//
// How: the pitch of each short frame is found with the YIN method. Speech and
// music both have pitch, so pitch alone can't tell them apart; what separates
// them is how the pitch moves. A speaking voice glides, in short runs broken by
// consonants and breaths; sung and played notes hold still. A clip counts as
// speech when enough of it is made of short gliding runs.

/** The sample rate the audio is read at. */
export const VOICE_READ_RATE = 16000;
const FRAME = 640; // 40 ms
const HOP = 160; // 10 ms
const MIN_HZ = 70, MAX_HZ = 400;
/** How clear a frame's pitch must be (YIN's threshold: lower is stricter). */
const YIN_CLEAR = 0.25;
/** A speaking run is at most this many 10 ms frames long, and its pitch travels at least this many semitones. */
const MAX_RUN = 70, MIN_GLIDE = 1;

export type VoiceRead = {
  /** Seconds of audio that were read. */
  seconds: number;
  /** Share of the clip, 0 to 1, that is a speaking voice. */
  speechShare: number;
  /** Whether someone speaks for a real part of the clip. */
  speech: boolean;
  /** The speaking voice's typical pitch in Hz; null without speech. */
  pitchHz: number | null;
};

/** The pitch of one frame by YIN (cumulative mean normalised difference), or 0 when the frame has no clear pitch. */
function framePitch(x: Float32Array, at: number, rate: number, scratch: Float32Array): number {
  const minLag = Math.floor(rate / MAX_HZ), maxLag = Math.ceil(rate / MIN_HZ), n = FRAME - maxLag;
  let sum = 0, best = -1;
  for (let lag = 1; lag <= maxLag; lag++) {
    let d = 0;
    for (let j = 0; j < n; j++) { const v = x[at + j] - x[at + j + lag]; d += v * v; }
    sum += d;
    scratch[lag] = sum > 0 ? (d * lag) / sum : 1;
  }
  for (let lag = minLag; lag < maxLag; lag++) {
    if (scratch[lag] < YIN_CLEAR) {
      // The first dip under the threshold, followed down to its lowest point.
      while (lag + 1 < maxLag && scratch[lag + 1] < scratch[lag]) lag++;
      best = lag;
      break;
    }
  }
  if (best < 0) return 0;
  // A parabola through the dip and its neighbours gives the pitch between samples.
  const a = scratch[best - 1] ?? scratch[best], b = scratch[best], c = scratch[best + 1] ?? scratch[best];
  const shift = a - 2 * b + c !== 0 ? (a - c) / (2 * (a - 2 * b + c)) : 0;
  return rate / (best + Math.max(-1, Math.min(1, shift)));
}

const semitones = (a: number, b: number) => 12 * Math.log2(a / b);
const medianOf = (xs: number[]) => { const s = [...xs].sort((p, q) => p - q); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** The measurements `readVoice` decides from, exposed so the thresholds can be checked against real clips. */
export type VoiceFeatures = { seconds: number; voicedShare: number; glideShare: number; pitchHz: number | null; runs: number };

export function voiceFeatures(samples: Float32Array, rate: number = VOICE_READ_RATE): VoiceFeatures {
  const frames = Math.max(0, Math.floor((samples.length - FRAME) / HOP));
  const seconds = samples.length / rate;
  if (frames < 50) return { seconds, voicedShare: 0, glideShare: 0, pitchHz: null, runs: 0 };
  let peak = 0;
  for (let i = 0; i < samples.length; i++) { const v = Math.abs(samples[i]); if (v > peak) peak = v; }
  if (peak < 1e-4) return { seconds, voicedShare: 0, glideShare: 0, pitchHz: null, runs: 0 };
  const floor = (peak * 0.02) ** 2; // 34 dB under the loudest sample
  const scratch = new Float32Array(Math.ceil(rate / MIN_HZ) + 2);
  const f0 = new Float32Array(frames);
  for (let k = 0; k < frames; k++) {
    const at = k * HOP;
    let e = 0;
    for (let j = 0; j < FRAME; j += 4) e += samples[at + j] * samples[at + j];
    if (e / (FRAME / 4) < floor) continue;
    f0[k] = framePitch(samples, at, rate, scratch);
  }
  // Runs of pitched frames whose pitch moves smoothly from one to the next.
  type Run = { len: number; span: number; pitches: number[] };
  const runs: Run[] = [];
  let cur: number[] = [];
  const close = () => {
    if (cur.length >= 4) {
      const s = [...cur].sort((p, q) => p - q);
      // How far the pitch travels inside the run, ignoring its extremes.
      runs.push({ len: cur.length, span: semitones(s[Math.floor(s.length * 0.9)], s[Math.floor(s.length * 0.1)]), pitches: cur });
    }
    cur = [];
  };
  for (let k = 0; k < frames; k++) {
    if (!f0[k]) { close(); continue; }
    if (cur.length && Math.abs(semitones(f0[k], cur[cur.length - 1])) > 2) close();
    cur.push(f0[k]);
  }
  close();
  const voiced = runs.reduce((n, r) => n + r.len, 0);
  // A speaking run: 40 ms to 0.7 s long, with the pitch gliding at least a semitone. Held notes are longer or flat.
  const glides = runs.filter((r) => r.len <= MAX_RUN && r.span >= MIN_GLIDE);
  const gliding = glides.reduce((n, r) => n + r.len, 0);
  const pitches = glides.flatMap((r) => r.pitches);
  return { seconds, voicedShare: voiced / frames, glideShare: gliding / frames, pitchHz: pitches.length ? Math.round(medianOf(pitches)) : null, runs: runs.length };
}

/**
 * Speech needs at least this share of the clip to be a gliding voice. Set from
 * 57 real clips (2026-11-15): 31 with someone talking and 26 with only music,
 * singing, room noise or silence. With these settings 30 of the 31 were found
 * and none of the 26 was mistaken for speech. The settings were chosen on those
 * same clips, so expect a little worse on new ones. The one missed was a quiet narration
 * over a screen recording, so the read errs toward "no voice".
 */
export const SPEECH_SHARE = 0.08;

/** What kind of voice a clip has. `samples` is one channel at VOICE_READ_RATE. */
export function readVoice(samples: Float32Array, rate: number = VOICE_READ_RATE): VoiceRead {
  const f = voiceFeatures(samples, rate);
  const speech = f.glideShare >= SPEECH_SHARE && f.pitchHz != null;
  return { seconds: Math.round(f.seconds * 10) / 10, speechShare: Math.round(f.glideShare * 100) / 100, speech, pitchHz: speech ? f.pitchHz : null };
}

/** What a set of videos sounds like: how many were read, how many have someone speaking, and those voices' typical pitch. */
export type VoiceKind = { reels: number; spoken: number; pitchHz: number | null };

export function voiceKind(reads: (VoiceRead | null | undefined)[]): VoiceKind {
  const ok = reads.filter((r): r is VoiceRead => Boolean(r));
  const pitches = ok.filter((r) => r.speech && r.pitchHz != null).map((r) => r.pitchHz as number);
  return { reels: ok.length, spoken: pitches.length, pitchHz: pitches.length ? Math.round(medianOf(pitches)) : null };
}

/** What SOCIA heard, kept with the account's video style: its own Reels, its competitors', and the pitch of each voice it can use. */
export type HeardVoices = { own: VoiceKind; competitors: VoiceKind; stock: { id: string; pitchHz: number }[] };

/** A saved HeardVoices, kept only if it has the shape this version reads. Pure. */
export function readHeard(v: unknown): HeardVoices | null {
  const h = v as HeardVoices | null;
  const kind = (k: unknown): k is VoiceKind => Boolean(k) && typeof (k as VoiceKind).reels === "number" && typeof (k as VoiceKind).spoken === "number";
  if (!h || !kind(h.own) || !kind(h.competitors) || !Array.isArray(h.stock)) return null;
  return { own: h.own, competitors: h.competitors, stock: h.stock.filter((x) => x && typeof x.id === "string" && Number.isFinite(x.pitchHz) && x.pitchHz > 0) };
}

/** A pitch in everyday words. */
export const pitchWord = (hz: number): string => (hz < 140 ? "a lower voice" : hz <= 185 ? "a mid-range voice" : "a higher voice");
/** How far apart two pitches are, in semitones. */
export const pitchGap = (a: number, b: number): number => Math.abs(12 * Math.log2(a / b));
