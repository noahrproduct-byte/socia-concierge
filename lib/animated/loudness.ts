// Bringing a voiceover up to the level people hear short videos at. The voice
// service's audio is quieter than a Reel is expected to be, and simply turning
// it up would clip its peaks, so the voice is measured (ITU-R BS.1770
// loudness, the same measure the platforms use), raised to the target, and its
// peaks held under a ceiling by a look-ahead limiter. Pure and browser-safe;
// components/animated/voiceAudio.ts runs it on the decoded audio.

/** Where the finished video should sit: short-form platforms play video at about -14 LUFS. */
export const VIDEO_TARGET_LUFS = -14;
/**
 * The level to bring a voice to so the video lands on VIDEO_TARGET_LUFS. A
 * voice that comes as one channel is played on both sides of the stereo video,
 * which measures about 3 LU louder than the single channel did, so a
 * one-channel voice is levelled 3 LU under the video's target. (Measured on a
 * rendered video: a -14.6 LUFS one-channel voice gave a -11.8 LUFS video.)
 */
export const voiceTargetLufs = (channelCount: number): number => (channelCount <= 1 ? VIDEO_TARGET_LUFS - 3 : VIDEO_TARGET_LUFS);
/** No sample goes above this, so the encoded file doesn't clip. */
export const VOICE_CEILING_DB = -1;
/** A voice is never raised by more than this: a very quiet recording would only bring its noise up. */
const MAX_GAIN_DB = 14;

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

/** The two K-weighting filters of BS.1770 for a sample rate: a high shelf (the head's effect) and a high-pass. */
function kWeighting(rate: number): [Biquad, Biquad] {
  const shelf = (() => {
    const A = 10 ** (4 / 40), w0 = (2 * Math.PI * 1500) / rate, alpha = Math.sin(w0) / (2 * Math.SQRT1_2), c = Math.cos(w0), r = 2 * Math.sqrt(A) * alpha;
    const a0 = A + 1 - (A - 1) * c + r;
    return { b0: (A * (A + 1 + (A - 1) * c + r)) / a0, b1: (-2 * A * (A - 1 + (A + 1) * c)) / a0, b2: (A * (A + 1 + (A - 1) * c - r)) / a0, a1: (2 * (A - 1 - (A + 1) * c)) / a0, a2: (A + 1 - (A - 1) * c - r) / a0 };
  })();
  const pass = (() => {
    const w0 = (2 * Math.PI * 38) / rate, alpha = Math.sin(w0) / (2 * 0.5), c = Math.cos(w0), a0 = 1 + alpha;
    return { b0: (1 + c) / 2 / a0, b1: -(1 + c) / a0, b2: (1 + c) / 2 / a0, a1: (-2 * c) / a0, a2: (1 - alpha) / a0 };
  })();
  return [shelf, pass];
}

function filter(x: Float32Array, f: Biquad): Float32Array {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = f.b0 * x[i] + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/**
 * Integrated loudness in LUFS (BS.1770: K-weighted, 400 ms blocks, gated so
 * silence and the gaps between sentences don't count). -Infinity for silence.
 */
export function loudnessLufs(channels: Float32Array[], rate: number): number {
  const n = channels[0]?.length ?? 0;
  const block = Math.round(rate * 0.4), hop = Math.round(rate * 0.1);
  if (!n || n < block) return -Infinity;
  const [shelf, pass] = kWeighting(rate);
  const weighted = channels.map((c) => filter(filter(c, shelf), pass));
  const powers: number[] = [];
  for (let s = 0; s + block <= n; s += hop) {
    let sum = 0;
    for (const w of weighted) { let p = 0; for (let i = s; i < s + block; i++) p += w[i] * w[i]; sum += p / block; }
    powers.push(sum);
  }
  const lufs = (p: number) => -0.691 + 10 * Math.log10(p);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const loud = powers.filter((p) => p > 0 && lufs(p) > -70);
  if (!loud.length) return -Infinity;
  const gate = lufs(mean(loud)) - 10;
  const kept = loud.filter((p) => lufs(p) > gate);
  return kept.length ? lufs(mean(kept)) : -Infinity;
}

/** `gain` applied to every channel with the peaks held under `ceiling` by a 5 ms look-ahead limiter (the gain eases down before a peak and back up after it). */
function limited(channels: Float32Array[], rate: number, gain: number, ceiling: number): Float32Array[] {
  const n = channels[0].length, look = Math.max(1, Math.round(rate * 0.005));
  // The gain each sample needs on its own.
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let peak = 0;
    for (const c of channels) { const v = Math.abs(c[i]) * gain; if (v > peak) peak = v; }
    need[i] = peak > ceiling ? ceiling / peak : 1;
  }
  // The lowest need over the next `look` samples (a sliding minimum), so the reduction starts before the peak...
  const ahead = new Float32Array(n);
  const q = new Int32Array(n);
  let head = 0, tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (tail > head && need[q[tail - 1]] >= need[i]) tail--;
    q[tail++] = i;
    while (q[head] > i + look) head++;
    ahead[i] = need[q[head]];
  }
  // ...averaged over the same window so it eases in, then released slowly so it doesn't pump.
  const out = channels.map(() => new Float32Array(n));
  const release = 1 - Math.exp(-1 / (0.08 * rate));
  let run = 0, g = 1;
  for (let i = 0; i < n; i++) {
    run += ahead[i] - (i >= look ? ahead[i - look] : 1);
    // `run` is the window's sum less `look` (before the audio starts the window counts as no reduction).
    const eased = Math.min(need[i], (run + look) / look);
    g = eased < g ? eased : g + (eased - g) * release;
    if (g > need[i]) g = need[i];
    for (let c = 0; c < channels.length; c++) out[c][i] = channels[c][i] * gain * g;
  }
  return out;
}

/**
 * Speech raised (or lowered) to `target` LUFS with its peaks under `ceiling`
 * dBFS. Limiting takes a little loudness back, so the gain is corrected and
 * applied again until it lands. Silence, or audio too short to measure, comes
 * back unchanged.
 */
export function levelSpeech(channels: Float32Array[], rate: number, target = voiceTargetLufs(channels.length), ceilingDb = VOICE_CEILING_DB): { channels: Float32Array[]; from: number; to: number; gainDb: number } {
  const from = loudnessLufs(channels, rate);
  if (!Number.isFinite(from)) return { channels, from, to: from, gainDb: 0 };
  const ceiling = 10 ** (ceilingDb / 20);
  let gainDb = Math.min(MAX_GAIN_DB, target - from);
  let out = limited(channels, rate, 10 ** (gainDb / 20), ceiling);
  let to = loudnessLufs(out, rate);
  for (let pass = 0; pass < 3 && Math.abs(target - to) > 0.3 && gainDb < MAX_GAIN_DB; pass++) {
    gainDb = Math.min(MAX_GAIN_DB, gainDb + (target - to));
    out = limited(channels, rate, 10 ** (gainDb / 20), ceiling);
    to = loudnessLufs(out, rate);
  }
  return { channels: out, from, to, gainDb };
}

/** The audio as a 16-bit PCM WAV file. */
export function wavBytes(channels: Float32Array[], rate: number): Uint8Array {
  const ch = channels.length, n = channels[0]?.length ?? 0, data = n * ch * 2;
  const buf = new ArrayBuffer(44 + data), v = new DataView(buf);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  text(0, "RIFF"); v.setUint32(4, 36 + data, true); text(8, "WAVE"); text(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  text(36, "data"); v.setUint32(40, data, true);
  let at = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, channels[c][i]));
    v.setInt16(at, Math.round(s < 0 ? s * 32768 : s * 32767), true); at += 2;
  }
  return new Uint8Array(buf);
}
