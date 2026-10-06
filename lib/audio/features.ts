// Measured properties of a post's sound, from mono PCM. Every number is an
// estimate from the signal itself — tempo from the periodicity of onsets,
// "music likely" from how tonal and how steady the sound is — and is labelled
// as such in the UI. Nothing here identifies a song. Pure, so it is tested
// on synthetic signals.

export type AudioFeatures = {
  durationSec: number;
  /** share of 10 ms frames above the audible threshold */
  audibleRatio: number;
  /** mean level of the audible frames, dBFS */
  energyDb: number | null;
  peakDb: number | null;
  /** estimated beats per minute, null when no steady beat was found */
  bpm: number | null;
  /** 0..1 prominence of the beat */
  bpmConfidence: number;
  /** mean spectral flatness of audible frames: tonal sounds low, noise high */
  flatness: number | null;
  /** 0..1 combined estimate that music is playing */
  musicScore: number;
  musicLikely: boolean;
};

const HOP_MS = 10;
const AUDIBLE_DB = -38;
const MIN_BPM = 50;
const MAX_BPM = 200;

const db = (rms: number) => (rms > 0 ? 20 * Math.log10(rms) : -120);

/** RMS per hop, both linear and dBFS. */
export function frameLevels(pcm: Float32Array, rate: number, hopMs = HOP_MS): { rms: Float32Array; dbfs: Float32Array } {
  const hop = Math.max(1, Math.round((rate * hopMs) / 1000));
  const n = Math.max(1, Math.ceil(pcm.length / hop));
  const rms = new Float32Array(n);
  const dbfs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const a = i * hop, b = Math.min(pcm.length, a + hop);
    for (let k = a; k < b; k++) s += pcm[k] * pcm[k];
    rms[i] = Math.sqrt(s / Math.max(1, b - a));
    dbfs[i] = db(rms[i]);
  }
  return { rms, dbfs };
}

/**
 * Tempo from onset periodicity: the half-wave-rectified rise in frame energy
 * is autocorrelated over the lags that correspond to 50–200 BPM; the lag with
 * the most prominent peak is the beat period. Confidence is that peak's
 * prominence against the lag range. Octave errors are folded into 70–180 BPM.
 */
export function estimateTempo(rms: Float32Array, hopMs = HOP_MS): { bpm: number | null; confidence: number } {
  const n = rms.length;
  if (n < 300) return { bpm: null, confidence: 0 }; // under 3 s: not enough beats
  // Onset strength: positive differences of a lightly smoothed envelope.
  const onset = new Float32Array(n);
  let prev = rms[0];
  for (let i = 1; i < n; i++) {
    const cur = 0.5 * rms[i] + 0.5 * prev;
    onset[i] = Math.max(0, cur - prev);
    prev = cur;
  }
  let mean = 0;
  for (let i = 0; i < n; i++) mean += onset[i];
  mean /= n;
  if (mean <= 0) return { bpm: null, confidence: 0 };
  for (let i = 0; i < n; i++) onset[i] -= mean;

  const lagMin = Math.round((60 / MAX_BPM) * 1000 / hopMs);
  const lagMax = Math.min(n >> 1, Math.round((60 / MIN_BPM) * 1000 / hopMs));
  let r0 = 0;
  for (let i = 0; i < n; i++) r0 += onset[i] * onset[i];
  if (r0 <= 0) return { bpm: null, confidence: 0 };
  const ac = new Float32Array(lagMax + 1);
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let s = 0;
    for (let i = lag; i < n; i++) s += onset[i] * onset[i - lag];
    ac[lag] = s / r0;
  }
  let best = lagMin, bestV = -Infinity, sum = 0, count = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    sum += Math.max(0, ac[lag]); count++;
    if (ac[lag] > bestV) { bestV = ac[lag]; best = lag; }
  }
  const avg = count ? sum / count : 0;
  const confidence = Math.max(0, Math.min(1, (bestV - avg) / 0.35));
  if (bestV < 0.08 || confidence < 0.25) return { bpm: null, confidence };
  let bpm = 60000 / (best * hopMs);
  // Fold octave errors into the range people count in.
  while (bpm > 180 && ac[Math.round(best * 2)] != null && best * 2 <= lagMax) { best *= 2; bpm /= 2; }
  while (bpm < 70 && Math.round(best / 2) >= lagMin) { best = Math.round(best / 2); bpm *= 2; }
  return { bpm: Math.round(bpm), confidence: Number(confidence.toFixed(2)) };
}

/** In-place iterative radix-2 FFT on interleaved real/imag arrays. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/**
 * Mean spectral flatness (geometric / arithmetic mean of the power spectrum,
 * 100 Hz–5 kHz) over frames above the audible threshold. Pure tones and
 * chords score near 0, broadband noise near 1; speech sits in between.
 */
export function spectralFlatness(pcm: Float32Array, rate: number, frameSize = 1024): number | null {
  const hop = frameSize >> 1;
  const re = new Float64Array(frameSize), im = new Float64Array(frameSize);
  const lo = Math.max(1, Math.floor((100 / rate) * frameSize)), hi = Math.min(frameSize >> 1, Math.ceil((5000 / rate) * frameSize));
  let total = 0, frames = 0;
  for (let start = 0; start + frameSize <= pcm.length; start += hop) {
    let energy = 0;
    for (let i = 0; i < frameSize; i++) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frameSize); re[i] = pcm[start + i] * w; im[i] = 0; energy += pcm[start + i] * pcm[start + i]; }
    if (db(Math.sqrt(energy / frameSize)) < AUDIBLE_DB) continue;
    fft(re, im);
    let logSum = 0, sum = 0, bins = 0;
    for (let k = lo; k < hi; k++) { const p = re[k] * re[k] + im[k] * im[k] + 1e-12; logSum += Math.log(p); sum += p; bins++; }
    if (!bins) continue;
    total += Math.exp(logSum / bins) / (sum / bins);
    frames++;
  }
  return frames ? Number((total / frames).toFixed(3)) : null;
}

export function analyzeAudio(pcm: Float32Array, rate: number): AudioFeatures {
  const durationSec = pcm.length / rate;
  const { rms, dbfs } = frameLevels(pcm, rate);
  let audible = 0, sumDb = 0, peak = -120;
  for (let i = 0; i < dbfs.length; i++) {
    if (dbfs[i] > peak) peak = dbfs[i];
    if (dbfs[i] > AUDIBLE_DB) { audible++; sumDb += dbfs[i]; }
  }
  const audibleRatio = dbfs.length ? audible / dbfs.length : 0;
  const energyDb = audible ? Number((sumDb / audible).toFixed(1)) : null;
  const tempo = audibleRatio >= 0.2 ? estimateTempo(rms) : { bpm: null, confidence: 0 };
  const flatness = audibleRatio >= 0.05 ? spectralFlatness(pcm, rate) : null;
  // Tonal (low flatness) and steadily periodic (confident beat) reads as music.
  const tonal = flatness == null ? 0 : Math.max(0, Math.min(1, (0.45 - flatness) / 0.3));
  const musicScore = Number((0.6 * tonal + 0.4 * tempo.confidence).toFixed(2));
  return {
    durationSec: Number(durationSec.toFixed(2)),
    audibleRatio: Number(audibleRatio.toFixed(3)),
    energyDb,
    peakDb: dbfs.length ? Number(peak.toFixed(1)) : null,
    bpm: tempo.bpm,
    bpmConfidence: tempo.confidence,
    flatness,
    musicScore,
    musicLikely: musicScore >= 0.5,
  };
}
