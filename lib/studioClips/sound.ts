// Audio Cleanup: measured, deterministic, and only what the renderer can
// actually do. The browser render applies a per-frame volume to each clip's
// samples (and clips anything past full scale), so cleanup here is a gain
// curve per clip: bring the sound to a common level, ease loud bursts down,
// lift quieter words a little, never let a measured peak go over -1 dBFS,
// and never boost background hiss past -40 dBFS. Long pauses can be cut out
// of the edit itself. Noise reduction and lowering background under speech
// are NOT done: the first isn't reliable in the browser, the second needs a
// separate background track that raw clips don't have. Pure, unit-tested.
import { AUDIBLE_DB, SILENCE_DB, silences } from "./facts";
import type { ClipSound, Edl, EdlSegment, EdlText, SoundStats } from "./types";

/** One 100 ms window of a clip's sound, at clip time `t` (seconds). */
export type SoundWindow = { t: number; rmsDb: number; peakDb: number };

export const SOUND = {
  step: 0.1,
  /** where speech should sit, as the median of audible 100 ms windows */
  targetDb: -18,
  /** windows louder than target + this are compressed 3:1 */
  loudOverDb: 5,
  ratio: 3,
  /** audible windows quieter than target − this are lifted (half the gap, at most maxLiftDb) */
  quietUnderDb: 8,
  maxLiftDb: 4,
  maxGainDb: 12,
  minGainDb: -10,
  /** no measured peak may end up above this */
  ceilingDb: -1,
  /** boosting stops before the background between sounds would pass this */
  noiseCeilingDb: -40,
  /** gain may rise this fast (dB per window) and must start falling this early */
  releaseDb: 1.5,
  attackDb: 4,
} as const;

const r1 = (x: number) => Math.round(x * 10) / 10;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

/** Typical level of the audible part, the highest peak, and the level between sounds. */
export function soundStats(ws: SoundWindow[], gains?: number[]): SoundStats {
  if (!ws.length) return { levelDb: null, peakDb: null, noiseDb: null };
  const g = (i: number) => gains?.[i] ?? 0;
  const audible = ws.map((w, i) => ({ db: w.rmsDb + g(i), raw: w.rmsDb })).filter((w) => w.raw > AUDIBLE_DB);
  // The typical level of the sound: a median, so a short shout or bang doesn't move it.
  const levelDb = audible.length ? median(audible.map((w) => w.db)) : null;
  const peakDb = Math.max(...ws.map((w, i) => w.peakDb + g(i)));
  // The background is measured in the quiet between sounds; with no such
  // stretch (continuous speech or music) it can't be measured and stays null.
  const order = ws.map((w, i) => i).sort((a, b) => ws[a].rmsDb - ws[b].rmsDb);
  const k = order[Math.floor(order.length * 0.1)];
  const noiseDb = ws[k].rmsDb <= AUDIBLE_DB ? r1(ws[k].rmsDb + g(k)) : null;
  return { levelDb: levelDb == null ? null : r1(levelDb), peakDb: r1(peakDb), noiseDb };
}

/** The cleanup gain curve for one clip's measured windows, or null when there is nothing worth changing. */
export function planSound(ws: SoundWindow[]): ClipSound | null {
  const audibleCount = ws.filter((w) => w.rmsDb > AUDIBLE_DB).length;
  if (audibleCount < 3) return null;
  const before = soundStats(ws);
  if (before.levelDb == null) return null;

  let base = clamp(SOUND.targetDb - before.levelDb, SOUND.minGainDb, SOUND.maxGainDb);
  let noiseCapped = false;
  if (base > 0 && before.noiseDb != null && before.noiseDb + base > SOUND.noiseCeilingDb) {
    const capped = Math.max(0, SOUND.noiseCeilingDb - before.noiseDb);
    if (capped < base) { base = capped; noiseCapped = true; }
  }

  let compressed = 0, lifted = 0, peakLimited = 0;
  const raw = ws.map((w, i) => {
    let g = base;
    if (w.rmsDb > AUDIBLE_DB) {
      const over = w.rmsDb + g - (SOUND.targetDb + SOUND.loudOverDb);
      if (over > 0) { g -= over * (1 - 1 / SOUND.ratio); compressed++; }
      const under = SOUND.targetDb - SOUND.quietUnderDb - (w.rmsDb + g);
      if (under > 0 && !noiseCapped) { g += Math.min(SOUND.maxLiftDb, under * 0.5); lifted++; }
    }
    // A frame of video spans parts of neighbouring windows: respect their peaks too.
    const pk = Math.max(ws[i - 1]?.peakDb ?? -120, w.peakDb, ws[i + 1]?.peakDb ?? -120);
    if (g > SOUND.ceilingDb - pk) { g = SOUND.ceilingDb - pk; peakLimited++; }
    return g;
  });
  // Smooth: rise slowly, and start falling early enough to meet every limit (both passes only lower).
  const fwd = raw.slice();
  for (let i = 1; i < fwd.length; i++) fwd[i] = Math.min(fwd[i], fwd[i - 1] + SOUND.releaseDb);
  for (let i = fwd.length - 2; i >= 0; i--) fwd[i] = Math.min(fwd[i], fwd[i + 1] + SOUND.attackDb);
  const db = fwd.map(r1);

  if (db.every((g) => Math.abs(g) < 0.5)) return null;
  const after = soundStats(ws, db);
  const gainDb = r1(median(db));

  const reasons: string[] = [];
  const lvl = (x: number | null) => (x == null ? "?" : `${Math.round(x)} dB`);
  if (gainDb >= 1.5) reasons.push(`Sound measured ${lvl(before.levelDb)} (quiet) → about ${lvl(after.levelDb)}.`);
  else if (gainDb <= -1.5) reasons.push(`Sound measured ${lvl(before.levelDb)} (loud) → about ${lvl(after.levelDb)}.`);
  if (compressed >= Math.max(2, ws.length * 0.02)) reasons.push(`Moments much louder than the rest evened out${before.peakDb != null && before.peakDb > -6 ? ` (peaks reached ${lvl(before.peakDb)})` : ""}.`);
  if (lifted >= Math.max(2, ws.length * 0.02)) reasons.push(`Quieter words lifted by up to ${SOUND.maxLiftDb} dB.`);
  if (peakLimited) reasons.push(`Peaks held under ${SOUND.ceilingDb} dB so nothing distorts.`);
  if (noiseCapped) reasons.push(`Boost limited to +${r1(base)} dB so the background (${lvl(before.noiseDb)}) doesn't rise past ${SOUND.noiseCeilingDb} dB.`);

  return { gainDb, curve: { t0: ws[0].t, step: SOUND.step, db }, before, after, reasons };
}

/**
 * Gain in dB at a clip time, interpolated along the curve. Outside the
 * measured range nothing is known about peaks, so sound there is never
 * boosted (it may only be turned down).
 */
export function gainAtDb(sound: Pick<ClipSound, "curve" | "gainDb">, t: number): number {
  const { t0, step, db } = sound.curve;
  if (!db.length) return 0;
  const x = (t - t0) / step;
  if (x < -0.5 || x > db.length - 0.5) return Math.min(sound.gainDb, 0);
  const i = Math.floor(x);
  if (i < 0) return db[0];
  if (i >= db.length - 1) return db[db.length - 1];
  return db[i] + (db[i + 1] - db[i]) * (x - i);
}

export const dbToGain = (db: number) => Math.pow(10, db / 20);

// ------------------------------------------------------------------ pauses ----

export const PAUSE = { minSec: 0.8, keepSec: 0.15, minPieceSec: 1 } as const;

/** Stretches of dead silence in measured windows (same threshold as ingest). */
export function findPauses(ws: SoundWindow[], minSec: number = PAUSE.minSec): { start: number; end: number }[] {
  return silences(ws.map((w) => ({ t: w.t, db: w.rmsDb })), SILENCE_DB, minSec);
}

/**
 * Cut long pauses out of the edit: a pause inside a cut splits it in two,
 * one at either edge trims it, keeping a short breath either side. Pieces
 * shorter than a second are never created (the pause stays instead). Text
 * lines move with the footage they were on.
 */
export function cutPauses(edl: Edl, pausesByClip: Record<string, { start: number; end: number }[]>): { edl: Edl; count: number; seconds: number } {
  const removed: { at: number; len: number }[] = [];
  const segments: EdlSegment[] = [];
  let outT = 0;
  for (const s of edl.segments) {
    const pauses = (pausesByClip[s.clipId] ?? [])
      .map((p) => ({ a: Math.max(p.start, s.in), b: Math.min(p.end, s.out) }))
      .filter((p) => p.b - p.a >= PAUSE.minSec)
      .sort((x, y) => x.a - y.a);
    let pieceIn = s.in;
    const pieces: { in: number; out: number }[] = [];
    let segOut = s.out;
    for (const p of pauses) {
      const leading = p.a <= pieceIn + 0.05;
      const trailing = p.b >= s.out - 0.05;
      if (leading) {
        const newIn = p.b - PAUSE.keepSec;
        if (segOut - newIn < PAUSE.minPieceSec) continue;
        pieceIn = newIn;
      } else if (trailing) {
        const newOut = p.a + PAUSE.keepSec;
        if (newOut - pieceIn < PAUSE.minPieceSec) continue;
        segOut = newOut;
      } else {
        const cutA = p.a + PAUSE.keepSec, cutB = p.b - PAUSE.keepSec;
        if (cutA - pieceIn < PAUSE.minPieceSec || segOut - cutB < PAUSE.minPieceSec) continue;
        pieces.push({ in: pieceIn, out: cutA });
        pieceIn = cutB;
      }
    }
    pieces.push({ in: pieceIn, out: segOut });
    // Record removals in the ORIGINAL output timeline, so text can be remapped once.
    let cursor = s.in;
    for (const pc of pieces) {
      if (pc.in > cursor + 1e-6) removed.push({ at: outT + (cursor - s.in), len: pc.in - cursor });
      cursor = pc.out;
    }
    if (s.out > cursor + 1e-6) removed.push({ at: outT + (cursor - s.in), len: s.out - cursor });
    const last = pieces.length - 1;
    pieces.forEach((pc, k) => segments.push({
      ...s,
      id: pieces.length === 1 ? s.id : `${s.id}-${k + 1}`,
      in: Number(pc.in.toFixed(2)),
      out: Number(pc.out.toFixed(2)),
      // the opener stays first, the ending stays last
      role: s.role === "opener" ? (k === 0 ? "opener" : "body") : s.role === "ending" ? (k === last ? "ending" : "body") : "body",
      note: k === 0 ? s.note : "",
    }));
    outT += s.out - s.in;
  }
  const uniq = removed.filter((r) => r.len > 0.01);
  const seconds = Number(uniq.reduce((a, r) => a + r.len, 0).toFixed(2));
  if (!uniq.length) return { edl, count: 0, seconds: 0 };
  const map = (t: number) => t - uniq.reduce((a, r) => a + (t >= r.at + r.len ? r.len : t > r.at ? t - r.at : 0), 0);
  const text: EdlText[] = edl.text.map((x) => {
    const at = Number(map(x.at).toFixed(2));
    return { ...x, at, end: Number(Math.max(at + 0.5, map(x.end)).toFixed(2)) };
  });
  return { edl: { ...edl, segments, text }, count: uniq.length, seconds };
}
