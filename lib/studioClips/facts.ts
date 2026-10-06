// Measured facts about a clip: numbers from pixels and samples, computed in
// the browser, never estimated by a model. Every function here is pure so it
// can be tested without a browser.
import type { AudioFacts, FrameFacts, VisualFacts } from "./types";

// ------------------------------------------------------------- picture ----

export type FrameSample = FrameFacts & { hist: number[] };

const HIST_BINS = 16;

/** Stats for one RGBA frame (ImageData.data). Scales are 0..1. */
export function frameStats(data: Uint8ClampedArray, t: number): FrameSample {
  const n = data.length / 4;
  if (!n) return { t, luma: 0, contrast: 0, clipHi: 0, clipLo: 0, warmth: 0, hist: new Array(HIST_BINS).fill(0) };
  let sum = 0, sumSq = 0, hi = 0, lo = 0, r = 0, b = 0;
  const hist = new Array(HIST_BINS).fill(0);
  for (let i = 0; i < data.length; i += 4) {
    const R = data[i], G = data[i + 1], B = data[i + 2];
    const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    sum += y; sumSq += y * y; r += R; b += B;
    if (y >= 245) hi++;
    if (y <= 10) lo++;
    hist[Math.min(HIST_BINS - 1, (y / 256 * HIST_BINS) | 0)]++;
  }
  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  return {
    t,
    luma: mean / 255,
    contrast: Math.sqrt(variance) / 255,
    clipHi: hi / n,
    clipLo: lo / n,
    warmth: (r / n - b / n) / 255,
    hist: hist.map((c) => c / n),
  };
}

/** Half the L1 distance between two normalised histograms: 0 identical, 1 disjoint. */
export function histogramDistance(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return d / 2;
}

/** Timestamps where the picture changes sharply between consecutive samples. */
export function sceneCuts(samples: FrameSample[], threshold = 0.35): number[] {
  const cuts: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    if (histogramDistance(samples[i - 1].hist, samples[i].hist) >= threshold) cuts.push(samples[i].t);
  }
  return cuts;
}

/**
 * Which moments to keep as keyframes: the middle of each scene, always one
 * near the start (the opening decides whether anyone stays), evenly filled
 * when there are too few scenes, capped when there are too many.
 */
export function chooseKeyframes(duration: number, cuts: number[], min = 3, max = 8): number[] {
  const d = Math.max(0.1, duration);
  const edges = [0, ...cuts.filter((c) => c > 0 && c < d).sort((a, b) => a - b), d];
  const mids: number[] = [];
  for (let i = 1; i < edges.length; i++) {
    const a = edges[i - 1], b = edges[i];
    if (b - a >= 0.4) mids.push(a + (b - a) / 2);
  }
  const opening = Math.min(0.4, d / 2);
  let times = [opening, ...mids.filter((t) => Math.abs(t - opening) > 0.5)];
  if (times.length < min) {
    // Fill from evenly spread candidates, skipping any too close to a frame
    // we already have (a one-second clip simply yields fewer frames).
    const slots = (min - times.length) * 4;
    for (let i = 1; i <= slots && times.length < min; i++) {
      const t = (i / (slots + 1)) * d;
      if (times.every((x) => Math.abs(x - t) >= 0.4)) times.push(t);
    }
  }
  times.sort((a, b) => a - b);
  if (times.length > max) {
    // Keep the opening, then thin evenly across the rest.
    const rest = times.slice(1);
    const kept = [times[0]];
    for (let i = 0; i < max - 1; i++) kept.push(rest[Math.round((i / (max - 2 || 1)) * (rest.length - 1))]);
    times = Array.from(new Set(kept)).sort((a, b) => a - b);
  }
  return times.map((t) => Math.min(Math.max(0, t), Math.max(0, d - 0.05))).map((t) => Number(t.toFixed(2)));
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function visualSummary(samples: FrameFacts[], cuts: number[] | null): VisualFacts {
  const luma = median(samples.map((s) => s.luma));
  const contrast = median(samples.map((s) => s.contrast));
  const warmth = median(samples.map((s) => s.warmth));
  const hiAvg = samples.length ? samples.reduce((a, s) => a + s.clipHi, 0) / samples.length : 0;
  const loAvg = samples.length ? samples.reduce((a, s) => a + s.clipLo, 0) / samples.length : 0;
  return {
    sampled: samples.map(({ t, luma: l, contrast: c, clipHi, clipLo, warmth: w }) => ({ t, luma: l, contrast: c, clipHi, clipLo, warmth: w })),
    sceneCuts: cuts,
    medianLuma: luma,
    brightness: luma < 0.28 ? "dark" : luma > 0.72 ? "bright" : "ok",
    contrast: contrast < 0.12 ? "low" : contrast > 0.3 ? "high" : "ok",
    warmth: warmth < -0.06 ? "cool" : warmth > 0.08 ? "warm" : "neutral",
    clippedHighlights: hiAvg > 0.06,
    crushedShadows: loAvg > 0.12,
  };
}

// --------------------------------------------------------------- sound ----

export type AudioWindow = { t: number; db: number };

export const SILENCE_DB = -45;
export const AUDIBLE_DB = -38;
export const SILENCE_MIN_SEC = 0.7;

/** Parse a 16-bit PCM WAV into samples (first channel). Null if not a plain PCM WAV. */
export function parseWav(buf: ArrayBuffer): { sampleRate: number; channels: number; samples: Int16Array } | null {
  const v = new DataView(buf);
  if (buf.byteLength < 44) return null;
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== "RIFF" && tag(0) !== "RF64") return null;
  if (tag(8) !== "WAVE") return null;
  let off = 12, sampleRate = 0, channels = 0, bits = 0, format = 0;
  while (off + 8 <= buf.byteLength) {
    const id = tag(off);
    let size = v.getUint32(off + 4, true);
    const body = off + 8;
    if (id === "fmt ") {
      format = v.getUint16(body, true);
      channels = v.getUint16(body + 2, true);
      sampleRate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
    } else if (id === "data") {
      if (format !== 1 || bits !== 16 || !channels || !sampleRate) return null;
      if (size === 0xffffffff || body + size > buf.byteLength) size = buf.byteLength - body;
      const frames = Math.floor(size / 2 / channels);
      const all = new Int16Array(buf, body, frames * channels);
      if (channels === 1) return { sampleRate, channels, samples: all };
      const mono = new Int16Array(frames);
      for (let i = 0; i < frames; i++) mono[i] = all[i * channels];
      return { sampleRate, channels, samples: mono };
    }
    off = body + size + (size % 2);
  }
  return null;
}

/** RMS level in dBFS per window. */
export function pcmWindows(samples: Int16Array, sampleRate: number, windowMs = 100): AudioWindow[] {
  const size = Math.max(1, Math.round((sampleRate * windowMs) / 1000));
  const out: AudioWindow[] = [];
  for (let start = 0; start < samples.length; start += size) {
    const end = Math.min(samples.length, start + size);
    let sumSq = 0;
    for (let i = start; i < end; i++) { const x = samples[i] / 32768; sumSq += x * x; }
    const rms = Math.sqrt(sumSq / Math.max(1, end - start));
    out.push({ t: start / sampleRate, db: rms > 0 ? 20 * Math.log10(rms) : -120 });
  }
  return out;
}

/** Stretches at or below `thresholdDb` lasting at least `minSec`. */
export function silences(windows: AudioWindow[], thresholdDb = SILENCE_DB, minSec = SILENCE_MIN_SEC): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  if (!windows.length) return out;
  const step = windows.length > 1 ? windows[1].t - windows[0].t : 0.1;
  let runStart: number | null = null;
  for (let i = 0; i <= windows.length; i++) {
    const quiet = i < windows.length && windows[i].db <= thresholdDb;
    if (quiet && runStart == null) runStart = windows[i].t;
    if (!quiet && runStart != null) {
      const end = i < windows.length ? windows[i].t : windows[windows.length - 1].t + step;
      if (end - runStart >= minSec) out.push({ start: Number(runStart.toFixed(2)), end: Number(end.toFixed(2)) });
      runStart = null;
    }
  }
  return out;
}

export function audioSummary(windows: AudioWindow[]): AudioFacts {
  if (!windows.length) return { hasAudio: false, rmsDb: null, peakDb: null, audibleRatio: null, silences: [], level: "unknown" };
  const audible = windows.filter((w) => w.db > AUDIBLE_DB);
  const peakDb = Math.max(...windows.map((w) => w.db));
  // Level is judged on the audible part, so long pauses don't make speech read as quiet.
  const rmsDb = audible.length ? audible.reduce((a, w) => a + w.db, 0) / audible.length : Math.max(...windows.map((w) => w.db));
  const audibleRatio = audible.length / windows.length;
  const level: AudioFacts["level"] = audibleRatio < 0.03 ? "silent" : rmsDb < -30 ? "quiet" : rmsDb > -10 ? "loud" : "ok";
  return {
    hasAudio: true,
    rmsDb: Number(rmsDb.toFixed(1)),
    peakDb: Number(peakDb.toFixed(1)),
    audibleRatio: Number(audibleRatio.toFixed(3)),
    silences: silences(windows),
    level,
  };
}
