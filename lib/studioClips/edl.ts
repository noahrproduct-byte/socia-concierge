// The edit decision list: validated and snapped from the model's proposal,
// then rendered as a plain-language edit guide. The same EDL feeds the Player
// in Phase B, so the guide and the preview can never disagree.
import type { AudioFacts, Edl, EdlAudio, EdlEnhance, EdlSegment, EdlText, GuideStep, TranscriptWord } from "./types";
import { clipLabel, fmtClock } from "./types";

export type ClipForEdl = {
  id: string;
  position: number;
  durationSec: number;
  words: TranscriptWord[] | null;
  silences: { start: number; end: number }[] | null;
  medianLuma: number | null;
  warmth: number | null;
  brightness: "dark" | "ok" | "bright" | null;
  contrastLevel: "low" | "ok" | "high" | null;
  rmsDb: number | null;
  audioLevel: AudioFacts["level"] | null;
  hasSpeech: boolean;
};

/** What pass 3 hands over, before validation. */
export type RawEdl = {
  targetSec?: { min: number; max: number };
  segments: { clipId: string; in: number; out: number; role?: string; note?: string }[];
  text?: { at: number; end?: number; text: string; role?: string }[];
  enhance?: { clipId: string; kind: string; amount?: string; why?: string }[];
  cta?: string | null;
  music?: string | null;
  caption?: string;
  notes?: string[];
};

export const EDL_DEFAULTS = {
  width: 1080,
  height: 1920,
  fps: 30 as const,
  targetSec: { min: 15, max: 30 },
  /** a cut this close to a pause boundary moves onto it */
  snapWindowSec: 0.35,
  minSegmentSec: 0.8,
  maxGainDb: 9,
  /** a clip must differ from the batch median by this much (0..1 luma) before a brightness fix is kept */
  lumaGap: 0.06,
  warmthGap: 0.08,
} as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r2 = (n: number) => Number(n.toFixed(2));

/**
 * Move a cut point off the middle of a word (to its start for an in-point,
 * its end for an out-point) and onto a nearby pause boundary when one is
 * within the snap window. Without a transcript or pauses, the time is kept.
 */
export function snapTime(t: number, clip: ClipForEdl, edge: "in" | "out"): number {
  let out = clamp(t, 0, clip.durationSec);
  if (clip.words?.length) {
    const inside = clip.words.find((w) => out * 1000 > w.startMs && out * 1000 < w.endMs);
    if (inside) out = (edge === "in" ? inside.startMs : inside.endMs) / 1000;
  }
  if (clip.silences?.length) {
    let best: number | null = null;
    for (const s of clip.silences) {
      // an in-point wants the END of a pause, an out-point its START
      const candidate = edge === "in" ? s.end : s.start;
      if (Math.abs(candidate - out) <= EDL_DEFAULTS.snapWindowSec && (best == null || Math.abs(candidate - out) < Math.abs(best - out))) best = candidate;
    }
    if (best != null) out = best;
  }
  return r2(clamp(out, 0, clip.durationSec));
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Level balance from measured RMS: toward the median of the clips in the cut. */
export function audioBalance(clips: ClipForEdl[]): EdlAudio[] {
  const measured = clips.filter((c) => c.rmsDb != null && c.audioLevel !== "silent");
  const target = median(measured.map((c) => c.rmsDb as number));
  if (target == null) return [];
  const out: EdlAudio[] = [];
  for (const c of measured) {
    const diff = target - (c.rmsDb as number);
    if (Math.abs(diff) < 2) continue;
    const gainDb = clamp(Math.round(diff), -EDL_DEFAULTS.maxGainDb, EDL_DEFAULTS.maxGainDb);
    out.push({ clipId: c.id, gainDb, why: gainDb > 0 ? "quieter than the other clips" : "louder than the other clips" });
  }
  return out;
}

const ENHANCE_KINDS = new Set(["brighten", "darken", "warm", "cool", "contrast"]);

/**
 * Keep only the corrections the measurements support: brighten a clip that is
 * darker than the batch, warm one that is cooler, and so on. A model's
 * "brighten" on a clip that measures like the rest is dropped.
 */
export function gateEnhancements(raw: NonNullable<RawEdl["enhance"]>, clips: ClipForEdl[]): { kept: EdlEnhance[]; dropped: string[] } {
  const byId = new Map(clips.map((c) => [c.id, c]));
  const lumaMed = median(clips.map((c) => c.medianLuma).filter((x): x is number => x != null));
  const warmMed = median(clips.map((c) => c.warmth).filter((x): x is number => x != null));
  const kept: EdlEnhance[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const e of raw) {
    const clip = byId.get(e.clipId);
    const kind = e.kind as EdlEnhance["kind"];
    if (!clip || !ENHANCE_KINDS.has(kind) || seen.has(`${e.clipId}:${kind}`)) continue;
    seen.add(`${e.clipId}:${kind}`);
    const label = clipLabel(clip.position);
    let ok = false;
    if (kind === "brighten") ok = clip.brightness === "dark" || (clip.medianLuma != null && lumaMed != null && clip.medianLuma < lumaMed - EDL_DEFAULTS.lumaGap);
    if (kind === "darken") ok = clip.brightness === "bright" || (clip.medianLuma != null && lumaMed != null && clip.medianLuma > lumaMed + EDL_DEFAULTS.lumaGap);
    if (kind === "warm") ok = clip.warmth != null && warmMed != null && clip.warmth < warmMed - EDL_DEFAULTS.warmthGap;
    if (kind === "cool") ok = clip.warmth != null && warmMed != null && clip.warmth > warmMed + EDL_DEFAULTS.warmthGap;
    if (kind === "contrast") ok = clip.contrastLevel === "low";
    if (!ok) { dropped.push(`${label}: ${kind} not supported by the measurements`); continue; }
    kept.push({ clipId: e.clipId, kind, amount: e.amount === "moderate" ? "moderate" : "slight", why: e.why?.trim() || "" });
  }
  return { kept, dropped };
}

export const edlDurationSec = (edl: Pick<Edl, "segments">): number => r2(edl.segments.reduce((a, s) => a + (s.out - s.in), 0));

export function validateEdl(raw: RawEdl, clips: ClipForEdl[], opts: { targetSec?: { min: number; max: number } } = {}): { edl: Edl; warnings: string[] } {
  const byId = new Map(clips.map((c) => [c.id, c]));
  const warnings: string[] = [];
  const target = opts.targetSec ?? (raw.targetSec && raw.targetSec.min > 0 && raw.targetSec.max >= raw.targetSec.min ? { min: Math.round(raw.targetSec.min), max: Math.round(raw.targetSec.max) } : EDL_DEFAULTS.targetSec);

  // Segments: known clips, snapped, long enough.
  const segments: EdlSegment[] = [];
  raw.segments.forEach((s, i) => {
    const clip = byId.get(s.clipId);
    if (!clip) { warnings.push(`segment ${i + 1} refers to an unknown clip`); return; }
    const inT = snapTime(Math.min(s.in, s.out), clip, "in");
    const outT = snapTime(Math.max(s.in, s.out), clip, "out");
    if (outT - inT < EDL_DEFAULTS.minSegmentSec) { warnings.push(`segment ${i + 1} is too short after snapping`); return; }
    segments.push({ id: `s${segments.length + 1}`, clipId: s.clipId, in: inT, out: outT, role: "body", note: (s.note ?? "").trim() });
  });
  if (segments.length) {
    segments[0].role = "opener";
    if (segments.length >= 3) segments[segments.length - 1].role = "ending";
  }

  // Length: shorten body segments from the end until the cut fits the target.
  let total = edlDurationSec({ segments });
  if (total > target.max) {
    for (let i = segments.length - 1; i >= 0 && total > target.max; i--) {
      const s = segments[i];
      if (s.role === "opener") continue;
      const canCut = s.out - s.in - EDL_DEFAULTS.minSegmentSec;
      const cut = Math.min(canCut, total - target.max);
      if (cut > 0) { s.out = snapTime(s.out - cut, byId.get(s.clipId)!, "out"); total = edlDurationSec({ segments }); }
    }
    warnings.push(`trimmed to ${total}s to fit the ${target.max}s target`);
  }
  const notes = [...(raw.notes ?? []).map((n) => n.trim()).filter(Boolean)];
  if (total < target.min) notes.push(`This cut runs ${total}s, under the recommended ${target.min}s. Add another moment or let a clip breathe longer.`);

  // Text layers inside the output.
  const ROLES = new Set(["opening", "mid", "cta"]);
  const text: EdlText[] = (raw.text ?? [])
    .filter((t) => t.text?.trim())
    .map((t, i) => {
      const at = r2(clamp(t.at ?? 0, 0, Math.max(0, total - 0.5)));
      const end = r2(clamp(t.end ?? at + 2.5, at + 0.5, total || at + 2.5));
      return { id: `t${i + 1}`, at, end, text: t.text.trim(), role: (ROLES.has(t.role ?? "") ? t.role : at < 1 ? "opening" : "mid") as EdlText["role"] };
    });

  const inCut = clips.filter((c) => segments.some((s) => s.clipId === c.id));
  const enh = gateEnhancements(raw.enhance ?? [], inCut);
  warnings.push(...enh.dropped);
  const speechClips = inCut.filter((c) => c.hasSpeech && c.words?.length);

  const edl: Edl = {
    version: 1,
    fps: EDL_DEFAULTS.fps,
    width: EDL_DEFAULTS.width,
    height: EDL_DEFAULTS.height,
    targetSec: target,
    segments,
    text,
    captions: speechClips.length ? { source: "transcript" } : null,
    enhance: enh.kept,
    audio: audioBalance(inCut),
    cta: raw.cta?.trim() || null,
    music: raw.music?.trim() || null,
    caption: (raw.caption ?? "").trim(),
    notes,
  };
  return { edl, warnings };
}

/**
 * A person edited the EDL in the builder (reordered, trimmed, replaced,
 * rewrote text). Run it back through validation so cuts stay on word/pause
 * boundaries and nothing points outside a clip — without silently trimming
 * a cut they deliberately made longer than the original target.
 */
export function revalidateEdl(edited: Edl, clips: ClipForEdl[]): { edl: Edl; warnings: string[] } {
  const total = edlDurationSec(edited);
  const raw: RawEdl = {
    targetSec: { min: edited.targetSec.min, max: Math.max(edited.targetSec.max, Math.ceil(total)) },
    segments: edited.segments.map((s) => ({ clipId: s.clipId, in: s.in, out: s.out, role: s.role, note: s.note })),
    text: edited.text.map((t) => ({ at: t.at, end: t.end, text: t.text, role: t.role })),
    enhance: edited.enhance.map((e) => ({ clipId: e.clipId, kind: e.kind, amount: e.amount, why: e.why })),
    cta: edited.cta, music: edited.music, caption: edited.caption,
    notes: edited.notes.filter((n) => !/^This cut runs/.test(n)),
  };
  const r = validateEdl(raw, clips);
  // Captions are derived from speech; an explicit "off" from the person is kept.
  if (edited.captions === null) r.edl.captions = null;
  return r;
}

const ENHANCE_COPY: Record<EdlEnhance["kind"], string> = {
  brighten: "Brighten {clip} {amount} — it's darker than the rest of the footage.",
  darken: "Bring {clip} down {amount} — it's brighter than the rest.",
  warm: "Warm up {clip} {amount} — it reads cooler than the other clips.",
  cool: "Cool {clip} down {amount} — it reads warmer than the other clips.",
  contrast: "Add {amount} contrast to {clip} — it's flat next to the others.",
};

/** The edit, as numbered steps a person could follow in any editor. */
export function guideFromEdl(edl: Edl, clips: ClipForEdl[]): GuideStep[] {
  const byId = new Map(clips.map((c) => [c.id, c]));
  const label = (id: string) => clipLabel(byId.get(id)?.position ?? 0);
  const steps: GuideStep[] = [];
  const push = (kind: GuideStep["kind"], text: string, extra: Partial<GuideStep> = {}) => steps.push({ n: steps.length + 1, text, kind, ...extra });

  edl.segments.forEach((s, i) => {
    const verb = s.role === "opener" ? "Start with" : s.role === "ending" ? "Finish on" : i === 1 ? "Cut to" : "Then";
    push("cut", `${verb} ${label(s.clipId)}, ${fmtClock(s.in)}–${fmtClock(s.out)}${s.note ? ` — ${s.note}` : ""}`, { clipId: s.clipId, range: [s.in, s.out] });
  });
  for (const t of edl.text) {
    const when = t.role === "opening" ? "as it opens" : t.role === "cta" ? "at the end" : `from ${fmtClock(t.at)} to ${fmtClock(t.end)}`;
    push("text", `Put “${t.text}” on screen ${when}.`);
  }
  if (edl.captions) {
    const speechClips = clips.filter((c) => c.hasSpeech && edl.segments.some((s) => s.clipId === c.id)).map((c) => clipLabel(c.position));
    push("captions", `Add captions from the transcript (speech is in ${speechClips.join(" and ")}).`);
  } else {
    push("captions", "No speech was detected in these clips — skip captions.");
  }
  for (const e of edl.enhance) push("enhance", ENHANCE_COPY[e.kind].replace("{clip}", label(e.clipId)).replace("{amount}", e.amount === "moderate" ? "a little more" : "slightly"), { clipId: e.clipId });
  for (const a of edl.audio) push("audio", `${a.gainDb > 0 ? "Raise" : "Lower"} ${label(a.clipId)} by about ${Math.abs(a.gainDb)} dB — ${a.why}.`, { clipId: a.clipId });
  if (edl.music) push("music", `Music: ${edl.music}`);
  if (edl.cta) push("ending", `End with: “${edl.cta}”`);
  push("length", `Recommended length: ${edl.targetSec.min}–${edl.targetSec.max} seconds (this cut runs ${edlDurationSec(edl)}s).`);
  return steps;
}
