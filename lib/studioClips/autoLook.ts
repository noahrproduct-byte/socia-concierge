// Colour, done for you: the first time a cut opens (or is made by Make and
// schedule), SOCIA measures the parts of each clip it uses and applies Auto
// enhance, the same correction the Look panel offers, toward one shared
// healthy target, so dark, cold or flat clips are fixed and the clips also end
// up looking like one shoot. Once per cut (edl.lookAuto), whatever the result:
// switching it off or undoing it is never overruled. The clips themselves are
// never changed; the correction lives in the cut.
import { ENHANCE_TARGET, gradeClip } from "./grade";
import { withFinish } from "./finish";
import type { BuildSource, ClipGrade, Edl } from "./types";

type Measured = Record<string, { pixels: Uint8Array | null }>;

/** Whether SOCIA should still colour this cut on its own. */
export const wantsAutoLook = (edl: Edl | null | undefined): boolean => Boolean(edl && edl.segments.length && !edl.finish && !edl.lookAuto);

/** The cut with Auto enhance applied from these measurements, stamped as tried. Pure. */
export function lookFromMeasures(edl: Edl, measures: Measured, now: Date = new Date()): { edl: Edl; corrected: number } {
  const ids = Array.from(new Set(edl.segments.map((s) => s.clipId)));
  const grades: Record<string, ClipGrade> = {};
  for (const id of ids) {
    const px = measures[id]?.pixels;
    const g = px ? gradeClip(px, ENHANCE_TARGET) : null;
    if (g) grades[id] = g;
  }
  const corrected = Object.keys(grades).length;
  const base = corrected ? withFinish(edl, { look: "enhance", grades }, now) : edl;
  return { edl: { ...base, lookAuto: now.toISOString() }, corrected };
}

/** Measure in the browser, then colour. A cut that can't be measured comes back stamped and otherwise unchanged. */
export async function autoLook(edl: Edl, sources: Record<string, BuildSource>, signal?: AbortSignal): Promise<{ edl: Edl; corrected: number }> {
  try {
    const { measureCut } = await import("./measure");
    const measures = await measureCut(edl, sources, () => {}, signal);
    return lookFromMeasures(edl, measures);
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    return { edl: { ...edl, lookAuto: new Date().toISOString() }, corrected: 0 };
  }
}
