// Punch-ins: the rhythm of a continuous take. When SOCIA joins the back-to-back
// pieces of one moving shot into a single stretch (a skip of a second inside a
// moving shot reads as a glitch, 2026-11-12), the places it would have cut stay
// as punch-ins: the picture steps in closer at one and back out at the next,
// with no footage skipped. Editors cut a single take this way.

/** How much closer a punch-in sits. */
export const PUNCH_SCALE = 1.12;
/** A punch never lands this close to another one or to the shot's ends. */
export const PUNCH_MIN_GAP_SEC = 0.8;
const MAX_PUNCHES = 8;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Punch times kept to the shot: inside it, apart from each other and its ends, in order. */
export function cleanPunches(v: unknown, inSec: number, outSec: number): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const t of [...v].filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b)) {
    if (t < inSec + PUNCH_MIN_GAP_SEC || t > outSec - PUNCH_MIN_GAP_SEC) continue;
    if (out.length && t - out[out.length - 1] < PUNCH_MIN_GAP_SEC) continue;
    out.push(r2(t));
    if (out.length >= MAX_PUNCHES) break;
  }
  return out;
}

/** The punches of two pieces of one take joined at `at` (the first piece's end). */
export function joinedPunches(a: { in: number; out: number; punches?: number[] }, b: { out: number; punches?: number[] }, at: number): number[] {
  return cleanPunches([...(a.punches ?? []), at, ...(b.punches ?? [])], a.in, Math.max(a.out, b.out));
}

/** The pieces a shot reads as, split at its punches: what pacing counts as cuts. */
export function punchPieces(s: { in: number; out: number; punches?: number[] }): { in: number; out: number }[] {
  const ts = cleanPunches(s.punches, s.in, s.out);
  const edges = [s.in, ...ts, s.out];
  return edges.slice(1).map((t, i) => ({ in: edges[i], out: t }));
}

/** How close the picture sits at `clipSec` in the shot: in on every other piece, starting wide. */
export function punchScaleAt(s: { punches?: number[] }, clipSec: number): number {
  const passed = (s.punches ?? []).filter((t) => clipSec >= t).length;
  return passed % 2 === 1 ? PUNCH_SCALE : 1;
}
