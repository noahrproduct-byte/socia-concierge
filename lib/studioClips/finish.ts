// Phase C on the EDL: reading the measured corrections back safely (they
// come from the browser and from storage, so every number is clamped and
// anything malformed is dropped), and describing them as edit-guide steps
// with the real numbers, so the guide and the rendered video still agree.
// Pure.
import { cleanGrade } from "./grade";
import type { ClipGrade, ClipSound, Edl, EdlFinish, GuideStep, LookStats, SoundStats } from "./types";
import { SOUND } from "./sound";

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const strs = (v: unknown, max = 6): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 240)).slice(0, max) : []);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function cleanLook(v: unknown): LookStats | null {
  const o = obj(v);
  if (!o) return null;
  const u = (k: string) => num(o[k], 0, 1);
  const s = (k: string) => num(o[k], -1, 1);
  const out = { luma: u("luma"), contrast: u("contrast"), clipHi: u("clipHi"), clipLo: u("clipLo"), warmth: s("warmth"), tint: s("tint"), saturation: u("saturation") };
  return Object.values(out).every((x) => x != null) ? (out as LookStats) : null;
}

function cleanSoundStats(v: unknown): SoundStats {
  const o = obj(v) ?? {};
  return { levelDb: num(o.levelDb, -120, 20), peakDb: num(o.peakDb, -120, 20), noiseDb: num(o.noiseDb, -120, 20) };
}

function cleanClipGrade(v: unknown): ClipGrade | null {
  const o = obj(v);
  if (!o) return null;
  const params = cleanGrade(o.params);
  const before = cleanLook(o.before), after = cleanLook(o.after);
  return params && before && after ? { params, before, after, reasons: strs(o.reasons) } : null;
}

function cleanClipSound(v: unknown): ClipSound | null {
  const o = obj(v);
  const c = obj(o?.curve);
  if (!o || !c || !Array.isArray(c.db)) return null;
  const t0 = num(c.t0, 0, 24 * 3600), step = num(c.step, 0.05, 0.5), gainDb = num(o.gainDb, SOUND.minGainDb, SOUND.maxGainDb + SOUND.maxLiftDb);
  if (t0 == null || step == null || gainDb == null || c.db.length > 20000) return null;
  const db = c.db.map((x) => num(x, -40, SOUND.maxGainDb + SOUND.maxLiftDb));
  if (db.some((x) => x == null)) return null;
  return { gainDb, curve: { t0, step, db: db as number[] }, before: cleanSoundStats(o.before), after: cleanSoundStats(o.after), reasons: strs(o.reasons) };
}

/** A stored or submitted finish, limited to the clips in the cut; undefined when there is nothing valid. */
export function sanitizeFinish(raw: unknown, clipIds: Set<string>): EdlFinish | undefined {
  const o = obj(raw);
  if (!o) return undefined;
  const look = o.look === "enhance" || o.look === "match" ? o.look : "off";
  const grades: Record<string, ClipGrade> = {};
  const sounds: Record<string, ClipSound> = {};
  const g = obj(o.grades) ?? {}, s = obj(o.sounds) ?? {};
  if (look !== "off") for (const id of Object.keys(g)) { if (!clipIds.has(id)) continue; const v = cleanClipGrade(g[id]); if (v) grades[id] = v; }
  const sound = o.sound === true;
  if (sound) for (const id of Object.keys(s)) { if (!clipIds.has(id)) continue; const v = cleanClipSound(s[id]); if (v) sounds[id] = v; }
  const pc = obj(o.pausesCut);
  const count = pc ? num(pc.count, 0, 500) : null, seconds = pc ? num(pc.seconds, 0, 3600) : null;
  const pausesCut = count && seconds != null ? { count: Math.round(count), seconds } : null;
  const measuredAt = typeof o.measuredAt === "string" && !Number.isNaN(Date.parse(o.measuredAt)) ? o.measuredAt : new Date().toISOString();
  if (look === "off" && !sound && !pausesCut) return undefined;
  return { look, grades, sound, sounds, pausesCut, measuredAt };
}

const signed = (x: number, unit = "") => `${x > 0 ? "+" : ""}${x}${unit}`;

/** The grade as values someone could type into any editor. */
export function gradeSettings(p: ClipGrade["params"]): string {
  const parts: string[] = [];
  if (p.exposure) parts.push(`exposure ${signed(p.exposure, " stops")}`);
  if (p.temperature) parts.push(`temperature ${signed(p.temperature)}`);
  if (p.tint) parts.push(`tint ${signed(p.tint)}`);
  if (p.highlights) parts.push(`highlights ${signed(p.highlights)}`);
  if (p.shadows) parts.push(`shadows ${signed(p.shadows)}`);
  if (p.contrast !== 1) parts.push(`contrast ×${p.contrast}`);
  if (p.saturation !== 1) parts.push(`saturation ×${p.saturation}`);
  if (p.vibrance) parts.push(`vibrance ${signed(p.vibrance)}`);
  return parts.join(", ");
}

/** Guide steps for the corrections that are on, replacing the generic advice for the same clips. */
export function finishSteps(finish: EdlFinish | undefined, label: (clipId: string) => string): { steps: Omit<GuideStep, "n">[]; gradedClips: Set<string>; leveledClips: Set<string> } {
  const steps: Omit<GuideStep, "n">[] = [];
  const gradedClips = new Set<string>(), leveledClips = new Set<string>();
  if (!finish) return { steps, gradedClips, leveledClips };
  if (finish.look !== "off") {
    for (const [id, g] of Object.entries(finish.grades)) {
      gradedClips.add(id);
      steps.push({ kind: "enhance", clipId: id, text: `${label(id)} (${finish.look === "match" ? "matched to the other clips" : "auto enhanced"}): ${g.reasons.join(" ")} Settings: ${gradeSettings(g.params)}.` });
    }
  }
  if (finish.sound) {
    for (const [id, s] of Object.entries(finish.sounds)) {
      leveledClips.add(id);
      steps.push({ kind: "audio", clipId: id, text: `${label(id)} sound: ${s.reasons.join(" ") || `levelled (about ${signed(s.gainDb, " dB")}).`}` });
    }
  }
  if (finish.pausesCut) steps.push({ kind: "cut", text: `${finish.pausesCut.count} long pause${finish.pausesCut.count === 1 ? "" : "s"} cut out (${finish.pausesCut.seconds}s).` });
  return { steps, gradedClips, leveledClips };
}

/** The EDL with its corrections changed; drops the finish entirely when everything is off. */
export function withFinish(edl: Edl, patch: Partial<EdlFinish>, now: Date = new Date()): Edl {
  const cur: EdlFinish = edl.finish ?? { look: "off", grades: {}, sound: false, sounds: {}, pausesCut: null, measuredAt: now.toISOString() };
  const next: EdlFinish = { ...cur, ...patch, measuredAt: now.toISOString() };
  if (next.look === "off") next.grades = {};
  if (!next.sound) next.sounds = {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { finish: _drop, ...rest } = edl;
  return next.look === "off" && !next.sound && !next.pausesCut ? rest : { ...rest, finish: next };
}
