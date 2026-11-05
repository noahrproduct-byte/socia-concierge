// Rate → Improve: the analysis as moments SOCIA can act on. Each moment is
// one thing it observed at a time in the video and the one fix for it, and
// every fix is something the Video editor really does (a text line in a
// preset, noise reduction, cutting pauses, a colour match, a track, captions)
// or the Caption tab does. What SOCIA can't do (reshoot, rewrite the speech)
// is left out rather than suggested. Pure.
import type { StudioAnalysis, TopFix } from "./studio";
import type { QuickAudio } from "./audio/quick";
import { TEXT_PRESETS, charCount, type TextPresetId } from "./textPresets";
import { humanText } from "./studioClips/overlay";
import { validCuts } from "./studioVerdict";

export type Capability = "text" | "noise" | "pauses" | "look" | "music" | "captions" | "caption";

/** The editor tab a fix opens on; the caption fix stays in Rate. */
export type EditorPanel = "cut" | "text" | "finish" | "audio";

export const CAPABILITY: Record<Capability, { label: string; where: string; panel: EditorPanel | null }> = {
  text: { label: "Put the line on the video", where: "Video editor · Text & captions", panel: "text" },
  noise: { label: "Reduce background noise", where: "Video editor · Look & sound", panel: "finish" },
  pauses: { label: "Cut the pauses", where: "Video editor · Cut", panel: "cut" },
  look: { label: "Correct the colour", where: "Video editor · Look & sound", panel: "finish" },
  music: { label: "Add a track from your taste", where: "Video editor · Music", panel: "audio" },
  captions: { label: "Add captions from the speech", where: "Video editor · Text & captions", panel: "text" },
  caption: { label: "Rewrite the caption", where: "Caption tab", panel: null },
};

export type Moment = {
  id: string;
  capability: Capability;
  /** 1 first, 2 then, 3 if time. */
  priority: 1 | 2 | 3;
  t: number;
  end: number;
  title: string;
  observed: string;
  fix: string;
  /** text: the proposed line and the preset it starts in. */
  text?: { value: string; presetId: TextPresetId };
  /** pauses: the ranges to cut, output seconds. */
  cuts?: { start: number; end: number; reason: string }[];
  /** noise: what was measured. */
  sound?: { levelDb: number | null; level: QuickAudio["level"] };
  /** Which of the analysis's fixes this moment carries out (its index in topFixes); absent for moments SOCIA measured itself. */
  fixIndex?: number;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const clampT = (t: number | null | undefined, dur: number) => Math.max(0, Math.min(dur, typeof t === "number" && Number.isFinite(t) ? t : 0));

/** The preset for a proposed line: a Hook Title when it is short enough, else a Caption Bar; the ask is a Callout Box. */
export function presetForFix(kind: TopFix["kind"], text: string): TextPresetId {
  if (kind === "ending") return charCount(text) <= TEXT_PRESETS.callout_box.maxChars ? "callout_box" : "caption_bar";
  return charCount(text) <= TEXT_PRESETS.hook_title.maxChars ? "hook_title" : "caption_bar";
}

/** A line as it would go on the video, or null when it reads machine-made (lib/studioClips/overlay.ts). */
const lineFor = (s: string | null | undefined): string | null => (s ? humanText(s) : null);

export type MomentInput = {
  analysis: StudioAnalysis;
  durationSec: number;
  /** The hook and ask in use (Analyze → Use), which the text fixes carry. */
  hook?: string | null;
  cta?: string | null;
};

/**
 * The moments, in time order, with at most one per capability and time.
 * Sources: the analysis's highest-priority edits, its suggested cuts, the
 * measured sound (level and real pauses), and the ending.
 */
export function momentsFrom({ analysis: a, durationSec, hook, cta }: MomentInput): Moment[] {
  const dur = Math.max(1, durationSec || a.durationSec || 1);
  const out: Moment[] = [];
  const has = (cap: Capability, t: number) => out.some((m) => m.capability === cap && Math.abs(m.t - t) < 2);
  const push = (m: Omit<Moment, "id">) => { if (!has(m.capability, m.t)) out.push({ ...m, id: `${m.capability}-${Math.round(m.t * 10)}` }); };
  const span = (t: number, len = 3) => ({ t: r1(clampT(t, dur)), end: r1(Math.min(dur, clampT(t, dur) + len)) });

  // SOCIA's highest-priority edits, each only when there is a fix it can make.
  a.topFixes.forEach((f, fixIndex) => {
    const priority: Moment["priority"] = fixIndex === 0 ? 1 : 2;
    if (f.kind === "opening" || f.kind === "hook_text" || f.kind === "text") {
      const value = lineFor(f.apply?.field === "hook" || f.apply?.field === "onscreen" ? f.apply.value : null) ?? lineFor(hook) ?? lineFor(a.hooks.current);
      if (!value) return;
      const t = f.kind === "text" ? clampT(f.t, dur) : 0;
      push({ fixIndex, capability: "text", priority, ...span(t), title: f.title, observed: f.observed, fix: f.suggestion, text: { value, presetId: presetForFix(f.kind, value) } });
    } else if (f.kind === "ending") {
      const value = lineFor(f.apply?.field === "cta" ? f.apply.value : null) ?? lineFor(cta) ?? lineFor(a.cta.current);
      const t = Math.max(0, dur - 3.5);
      // Only with a line to put on screen. An ending that asks for nothing is not a music problem, so no track is offered for it.
      if (value) push({ fixIndex, capability: "text", priority, ...span(t, 3.5), title: f.title, observed: f.observed, fix: f.suggestion, text: { value, presetId: presetForFix("ending", value) } });
    } else if (f.kind === "pacing") {
      const cuts = validCuts<{ start: number; end: number; reason: string }>(a.cuts?.edits, dur).map((c) => ({ start: r1(c.start), end: r1(c.end), reason: c.reason }));
      if (!cuts.length) return;
      push({ fixIndex, capability: "pauses", priority, t: cuts[0].start, end: r1(Math.min(dur, cuts[cuts.length - 1].end)), title: f.title, observed: f.observed, fix: f.suggestion, cuts });
    } else if (f.kind === "audio") {
      const m = a.measuredAudio;
      if (!m || !m.hasAudio) return;
      push({ fixIndex, capability: "noise", priority, ...span(f.t ?? 0, 4), title: f.title, observed: f.observed, fix: f.suggestion, sound: { levelDb: m.levelDb, level: m.level } });
    } else if (f.kind === "visual") {
      push({ fixIndex, capability: "look", priority, ...span(f.t ?? 0, 4), title: f.title, observed: f.observed, fix: f.suggestion });
    } else if (f.kind === "caption") {
      push({ fixIndex, capability: "caption", priority, t: 0, end: 0, title: f.title, observed: f.observed, fix: f.suggestion });
    }
  });

  // Suggested cuts not already covered.
  const edits = validCuts<{ start: number; end: number; reason: string }>(a.cuts?.edits, dur);
  if (edits.length && !out.some((m) => m.capability === "pauses")) {
    const cuts = edits.map((c) => ({ start: r1(c.start), end: r1(c.end), reason: c.reason }));
    const saved = cuts.reduce((s, c) => s + (c.end - c.start), 0);
    push({ capability: "pauses", priority: 2, t: cuts[0].start, end: r1(Math.min(dur, cuts[cuts.length - 1].end)), title: `${cuts.length === 1 ? "One cut" : `${cuts.length} cuts`} would save ${r1(saved)} s`, observed: cuts.map((c) => c.reason).filter(Boolean).slice(0, 2).map((r) => r.charAt(0).toUpperCase() + r.slice(1).replace(/\.$/, "")).join(". ") + (cuts.some((c) => c.reason) ? "." : ""), fix: a.cuts?.note || "Remove them. Captions and text lines move with the cut.", cuts });
  }

  // The measured sound: quiet or loud speech, and real pauses the model didn't name.
  const m = a.measuredAudio;
  if (m && m.hasAudio) {
    if ((m.level === "quiet" || m.level === "loud") && !out.some((x) => x.capability === "noise")) {
      push({ capability: "noise", priority: 2, ...span(m.silentOpeningSec, 4), title: m.level === "quiet" ? "The sound is quiet" : "The sound is loud", observed: `Measured ${m.levelDb != null ? `${m.levelDb} dBFS` : "level"} over the audible parts${m.level === "quiet" ? "; phone speakers lose the words" : "; peaks may distort"}.`, fix: "Even out the level and turn down steady background noise, from the clip's own sound.", sound: { levelDb: m.levelDb, level: m.level } });
    }
    const long = m.pauses.filter((p) => p.end - p.start >= 1.2 && p.start > 0.3);
    if (long.length && !out.some((x) => x.capability === "pauses")) {
      const cuts = long.map((p) => ({ start: r1(p.start), end: r1(p.end), reason: `${r1(p.end - p.start)} s of silence` }));
      const saved = cuts.reduce((s, c) => s + (c.end - c.start), 0);
      push({ capability: "pauses", priority: 3, t: cuts[0].start, end: r1(Math.min(dur, cuts[cuts.length - 1].end)), title: `${cuts.length === 1 ? "A pause" : `${cuts.length} pauses`} of silence, ${r1(saved)} s in all`, observed: `Measured in the sound: no audible signal at ${cuts.map((c) => `${c.start}s`).join(", ")}.`, fix: "Cut them. The speech closes up and the captions move with it.", cuts });
    }
  }

  // Captions, when there is speech and none were seen.
  if (a.meta.autoTranscript && a.observed.onScreenText === false && !out.some((x) => x.capability === "captions")) {
    push({ capability: "captions", priority: 3, ...span(0, 3), title: "Speech without captions", observed: "There is speech in the video and no words on screen; most viewers watch muted.", fix: "Captions from the real transcript, word by word, in the brand's style." });
  }

  return out.sort((x, y) => x.t - y.t || x.priority - y.priority).slice(0, 7);
}

/** The plain summary line above the list. */
export function momentsSummary(ms: Moment[]): string {
  if (!ms.length) return "Nothing here needs a fix SOCIA can make. Check the Caption tab, then prepare the post.";
  const first = ms.filter((m) => m.priority === 1).length;
  return `${ms.length} moment${ms.length === 1 ? "" : "s"} to change${first ? `, ${first} before anything else` : ""}. Each is a fix SOCIA makes; the words and the cut stay yours.`;
}

/**
 * The cut's segments with these output-time ranges removed (Rate → "Cut the
 * pauses" on a one-clip edit). A piece shorter than the editor's minimum is
 * dropped rather than left as a sliver.
 */
export function applyCuts<S extends { id: string; in: number; out: number; role: "opener" | "body" | "ending"; note: string }>(segments: S[], cuts: { start: number; end: number }[], minSec = 0.8): S[] {
  // Never a zero-length or backwards range: only cuts the editor can really make (lib/studioVerdict.ts).
  const ranges = validCuts<{ start: number; end: number }>(cuts, Number.MAX_SAFE_INTEGER).sort((a, b) => a.start - b.start);
  if (!ranges.length) return segments;
  const out: S[] = [];
  let outT = 0;
  for (const s of segments) {
    const len = s.out - s.in;
    // Keep-intervals inside this segment, in clip time.
    let pieces: [number, number][] = [[s.in, s.out]];
    for (const c of ranges) {
      const a = s.in + (c.start - outT), b = s.in + (c.end - outT);
      pieces = pieces.flatMap(([x, y]) => (b <= x || a >= y ? [[x, y]] : [[x, Math.min(y, a)], [Math.max(x, b), y]].filter(([p, q]) => q - p > 0.01) as [number, number][]));
    }
    pieces.filter(([x, y]) => y - x >= minSec).forEach(([x, y], i) => out.push({ ...s, id: i === 0 ? s.id : `${s.id}-${i + 1}`, in: Math.round(x * 100) / 100, out: Math.round(y * 100) / 100 }));
    outT += len;
  }
  if (!out.length) return segments;
  out[0].role = "opener";
  for (let i = 1; i < out.length; i++) out[i].role = i === out.length - 1 && out.length >= 3 ? "ending" : "body";
  return out;
}
