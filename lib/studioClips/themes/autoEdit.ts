// The auto-edit a theme makes from the raw footage, on top of applyTheme:
//   1. captions on where there is speech;
//   2. dead air trimmed out of speech at the theme's threshold;
//   3. the strongest spoken line pulled to the front as the hook, with the
//      theme's title treatment (never invented: it is a sentence that was said);
//   4. B-roll cut to the theme's pacing (long silent shots trimmed, nothing
//      shorter than a usable cut);
//   5. on the talking-head themes, B-roll laid over the speech so the voice
//      runs on unbroken;
//   6. cuts moved onto the music's beat when the theme asks and a beat is known.
// Everything it decides is ordinary EDL data the person can change on the
// timeline afterwards. Pure, unit-tested (autoEdit.test.ts).
import type { ClipForEdl } from "../edl";
import { edlDurationSec } from "../edl";
import { sentences } from "../speech";
import { alignToBeats, type Beat } from "../beats";
import { varyJumpCuts } from "../jumpCuts";
import { cleanPunches } from "../punch";
import { findTakes } from "../takes";
import { settleCut } from "../cutCheck";
import { muteSilentShots, shotSoundNote } from "../shotSound";
import type { BrollItem, BuildSource, Edl, EdlSegment, EdlText, TranscriptWord } from "../types";
import { MIN_CUT_SEC } from "../tracks";
import { TEXT_PRESETS, fitLine, isTextPresetId, type TextPresetId } from "@/lib/textPresets";
import type { Theme } from "./schema";

const r2 = (n: number) => Math.round(n * 100) / 100;
/** A line that starts mid-sentence (the clip was cut there) still opens with a capital. */
const capital = (s: string) => s.replace(/^\s*\p{Ll}/u, (c) => c.toUpperCase());
/** Air kept either side of a trimmed pause, so words never clip. */
const AIR_SEC = 0.15;
/** The most words a hook line may run. */
const HOOK_MAX_WORDS = 9;
/** Words that make a sentence a hook when they are in it (a number, a question or one of these). */
const HOOK_WORDS = /\b(free|save|secret|never|nobody|stop|mistake|best|worst|why|how|truth|wrong|only|every|before|after|without)\b/i;
/** Numbers said as words count as numbers. */
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|hundred|thousand|million|half|double|triple|dozen)\b/i;
/** A B-roll shot over speech starts this far in (the hook plays clean) and repeats this often. */
const BROLL_FIRST_SEC = 2.5, BROLL_GAP_SEC = 3;

export type AutoEditContext = { clips: ClipForEdl[]; words: Record<string, TranscriptWord[] | null | undefined>; beat?: (Beat & { trackId?: string }) | null; sources?: Record<string, BuildSource> };
export type AutoEditResult = { edl: Edl; notes: string[] };

const wordsIn = (s: Pick<EdlSegment, "clipId" | "in" | "out">, words: AutoEditContext["words"]): TranscriptWord[] => (words[s.clipId] ?? []).filter((w) => w.startMs / 1000 >= s.in - 0.05 && w.endMs / 1000 <= s.out + 0.05);
const speaks = (s: Pick<EdlSegment, "clipId" | "in" | "out">, words: AutoEditContext["words"]): boolean => wordsIn(s, words).length >= 3;

/**
 * Dead air inside talking cuts trimmed at `thresholdSec`: a gap between two
 * words longer than that is closed to AIR_SEC either side, by splitting the
 * cut. Text lines after a trim move up with the footage. Cuts shorter than a
 * usable cut are never made.
 */
export function trimSilences(edl: Edl, words: AutoEditContext["words"], thresholdSec: number): { edl: Edl; seconds: number; count: number } {
  const segments: EdlSegment[] = [];
  const removed: { at: number; len: number }[] = [];
  let outT = 0, seq = 0;
  for (const s of edl.segments) {
    const ws = wordsIn(s, words);
    if (ws.length < 2) { segments.push(s); outT += s.out - s.in; continue; }
    const pieces: { in: number; out: number }[] = [];
    let pieceIn = s.in;
    // The output time the current piece starts at; a pause's place in output time is where its piece ends.
    let cursor = outT;
    for (let i = 1; i < ws.length; i++) {
      const gapA = ws[i - 1].endMs / 1000, gapB = ws[i].startMs / 1000;
      if (gapB - gapA < thresholdSec + 2 * AIR_SEC) continue;
      const cutA = r2(gapA + AIR_SEC), cutB = r2(gapB - AIR_SEC);
      if (cutA - pieceIn < MIN_CUT_SEC || s.out - cutB < MIN_CUT_SEC) continue;
      pieces.push({ in: pieceIn, out: cutA });
      removed.push({ at: r2(cursor + (cutA - pieceIn)), len: r2(cutB - cutA) });
      cursor += cutA - pieceIn;
      pieceIn = cutB;
    }
    pieces.push({ in: pieceIn, out: s.out });
    pieces.forEach((p, i) => {
      segments.push({ ...s, id: i ? `${s.id}p${++seq}` : s.id, in: p.in, out: p.out, ...(i ? { role: "body" as const, transition: undefined, punches: undefined } : {}) });
      outT += p.out - p.in;
    });
  }
  if (!removed.length) return { edl, seconds: 0, count: 0 };
  const seconds = r2(removed.reduce((a, x) => a + x.len, 0));
  const shift = (t: number) => t - removed.filter((x) => x.at < t).reduce((a, x) => a + Math.min(x.len, t - x.at), 0);
  const text = edl.text.map((t) => ({ ...t, at: r2(Math.max(0, shift(t.at))), end: r2(Math.max(shift(t.at) + 0.5, shift(t.end))) }));
  return { edl: { ...edl, segments, text }, seconds, count: removed.length };
}

export type Hook = { clipId: string; start: number; end: number; text: string; segmentIndex: number };

/** The strongest spoken line in the cut: the first short sentence with a number, a question or a hook word; else the first short sentence. */
export function detectHook(edl: Pick<Edl, "segments">, words: AutoEditContext["words"]): Hook | null {
  let fallback: Hook | null = null;
  for (let i = 0; i < edl.segments.length; i++) {
    const s = edl.segments[i];
    const ws = wordsIn(s, words);
    if (ws.length < 3) continue;
    for (const [a, b] of sentences(ws)) {
      const run = ws.slice(a, b + 1);
      if (run.length > HOOK_MAX_WORDS || run.length < 2) continue;
      const text = run.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim();
      const hook: Hook = { clipId: s.clipId, start: r2(run[0].startMs / 1000), end: r2(run[run.length - 1].endMs / 1000), text, segmentIndex: i };
      if (/\d/.test(text) || NUMBER_WORDS.test(text) || /\?$/.test(text) || HOOK_WORDS.test(text)) return hook;
      if (!fallback) fallback = hook;
    }
  }
  return fallback;
}

/** The hook's sentence as its own cut at the front, the rest of its shot following; the opening line takes the words. */
export function pullHookToFront(edl: Edl, hook: Hook, titlePreset: TextPresetId): Edl {
  const s = edl.segments[hook.segmentIndex];
  if (!s) return edl;
  const a = r2(Math.max(s.in, hook.start - 0.08)), b = r2(Math.min(s.out, hook.end + AIR_SEC));
  if (b - a < MIN_CUT_SEC) return edl;
  const head: EdlSegment = { ...s, id: `${s.id}h`, in: a, out: b, role: "opener", purpose: "hook", transition: undefined, punches: undefined };
  const rest: EdlSegment[] = [];
  if (a - s.in >= MIN_CUT_SEC) rest.push({ ...s, id: `${s.id}a`, in: s.in, out: a, role: "body", purpose: undefined });
  if (s.out - b >= MIN_CUT_SEC) rest.push({ ...s, id: `${s.id}b`, in: b, out: s.out, role: "body", transition: rest.length ? s.transition : undefined, punches: undefined });
  const others = edl.segments.filter((_, i) => i !== hook.segmentIndex).map((x) => ({ ...x, role: "body" as const }));
  const segments = [head, ...(hook.segmentIndex === 0 ? [...rest, ...others] : [...others.slice(0, hook.segmentIndex), ...rest, ...others.slice(hook.segmentIndex)])];
  if (segments.length >= 3) segments[segments.length - 1] = { ...segments[segments.length - 1], role: "ending" };
  // The opening line: the person's own words stay; otherwise the hook, in the theme's title look.
  const preset = isTextPresetId(titlePreset) ? TEXT_PRESETS[titlePreset] : TEXT_PRESETS.hook_title;
  const fit = fitLine(capital(hook.text.replace(/[.!]+$/, "")), preset);
  const line: EdlText = { id: "thook", at: 0, end: r2(Math.min(b - a + 0.4, 3)), text: fit.text, role: "opening", presetId: fit.preset.id, ...(fit.slot ? { slot: fit.slot } : {}), ...(fit.shortened ? { shortened: true as const } : {}) };
  const hasOpening = edl.text.some((t) => t.role === "opening" && t.text.trim());
  // Text that was timed to the shot that moved keeps its place in output time (the hook is added at 0).
  const text = hasOpening ? edl.text : [line, ...edl.text.map((t) => ({ ...t, at: r2(t.at + (b - a)), end: r2(t.end + (b - a)) }))];
  return { ...edl, segments, text };
}

/** Silent shots trimmed to the theme's B-roll beat (the end is cut, the action at the start stays). */
export function paceBroll(edl: Edl, words: AutoEditContext["words"], brollSec: number, maxClipSec: number): { edl: Edl; trimmed: number } {
  let trimmed = 0;
  const cap = Math.max(MIN_CUT_SEC, Math.min(maxClipSec, brollSec * 1.3));
  const segments = edl.segments.map((s) => {
    if (speaks(s, words) || s.out - s.in <= cap + 0.3) return s;
    trimmed++;
    return { ...s, out: r2(s.in + cap) };
  });
  return { edl: trimmed ? { ...edl, segments } : edl, trimmed };
}

/**
 * The talking-head layout: silent shots leave the main track and become
 * B-roll over the speech, so the voice never breaks. Placed from 2.5 s in,
 * one every few seconds, each a B-roll beat long, never past the end.
 */
export function overlayBroll(edl: Edl, words: AutoEditContext["words"], brollSec: number): { edl: Edl; placed: number } {
  const talking = edl.segments.filter((s) => speaks(s, words));
  const silent = edl.segments.filter((s) => !speaks(s, words));
  if (!talking.length || !silent.length) return { edl, placed: 0 };
  const main = { ...edl, segments: talking.map((s, i) => ({ ...s, role: i === 0 ? ("opener" as const) : i === talking.length - 1 && talking.length >= 3 ? ("ending" as const) : ("body" as const) })) };
  const total = edlDurationSec(main);
  const broll: BrollItem[] = [];
  let at = BROLL_FIRST_SEC, n = 0;
  while (at + MIN_CUT_SEC < total - 0.5 && n < silent.length * 2 && broll.length < 12) {
    const src = silent[n % silent.length];
    const len = Math.min(brollSec, src.out - src.in, total - 0.5 - at);
    if (len < MIN_CUT_SEC) break;
    // Walk through the silent shot on repeat visits so the same frames are not shown twice.
    const offset = Math.min(src.out - src.in - len, Math.floor(n / silent.length) * len);
    broll.push({ id: `b${broll.length + 1}`, clipId: src.clipId, in: r2(src.in + offset), out: r2(src.in + offset + len), at: r2(at) });
    at += len + BROLL_GAP_SEC; n++;
  }
  if (!broll.length) return { edl, placed: 0 };
  return { edl: { ...main, broll }, placed: broll.length };
}

/** Consecutive pieces of one clip that touch (the next starts where the last ended, a hard cut between) joined into one. */
export function joinContiguous(edl: Edl): Edl {
  const segments: EdlSegment[] = [];
  for (const s of edl.segments) {
    const prev = segments[segments.length - 1];
    if (prev && prev.clipId === s.clipId && Math.abs(s.in - prev.out) <= 0.05 && !s.transition) {
      segments[segments.length - 1] = { ...prev, out: s.out, role: prev.role === "opener" ? "opener" : s.role === "ending" ? "ending" : prev.role, punches: cleanPunches([...(prev.punches ?? []), ...(s.punches ?? [])], prev.in, s.out) };
      continue;
    }
    segments.push(s);
  }
  return segments.length === edl.segments.length ? edl : { ...edl, segments };
}

/**
 * Takes of one line (lib/studioClips/takes.ts): when a cut has two or more takes of the same
 * line, only the cleanest stays; the others' cuts go. A cut with just one take of a line is left alone.
 */
export function dropRepeatTakes(edl: Edl, ctx: AutoEditContext): { edl: Edl; dropped: string[] } {
  const takes = findTakes(ctx.clips.map((c) => ({ id: c.id, position: c.position, durationSec: c.durationSec, words: c.words })));
  const inCut = new Set(edl.segments.map((s) => s.clipId));
  const drop = new Set<string>();
  for (const g of takes.groups) if (g.clipIds.filter((id) => inCut.has(id)).length > 1) for (const id of g.clipIds) if (id !== g.keep && inCut.has(id)) drop.add(id);
  // The kept take must itself be in the cut, else the best present take stays.
  for (const g of takes.groups) {
    if (!inCut.has(g.keep)) { const present = g.clipIds.filter((id) => inCut.has(id)); for (const id of present.slice(1)) drop.add(id); present.slice(0, 1).forEach((id) => drop.delete(id)); }
  }
  if (!drop.size) return { edl, dropped: [] };
  const segments = edl.segments.filter((s) => !drop.has(s.clipId));
  if (!segments.length) return { edl, dropped: [] };
  const dropped = Array.from(drop).map((id) => takes.repeats.get(id)?.why ?? "a repeated take");
  return { edl: { ...edl, segments: segments.map((s, i, all) => ({ ...s, role: i === 0 ? "opener" : all.length >= 3 && i === all.length - 1 ? "ending" : "body" })) }, dropped };
}

/** The theme's edit of the raw footage (see the file's header). */
export function autoEdit(edl: Edl, theme: Theme, ctx: AutoEditContext): AutoEditResult {
  const notes: string[] = [];
  let out: Edl = edl;
  // Two takes of one line never both play: the cleanest stays.
  const takes = dropRepeatTakes(out, ctx);
  if (takes.dropped.length) { out = takes.edl; notes.push(`${takes.dropped.join("; ")}: only the cleanest take is in.`); }
  const anyWords = out.segments.some((s) => (ctx.words[s.clipId] ?? []).length);
  if (anyWords && !out.captions && !out.captionsOff) out = { ...out, captions: { source: "transcript" } };
  const dead = trimSilences(out, ctx.words, theme.pacing.silenceSec);
  if (dead.count) { out = dead.edl; notes.push(`${dead.seconds}s of dead air trimmed (${dead.count} pause${dead.count === 1 ? "" : "s"}).`); }
  if (theme.pacing.hook) {
    const hook = detectHook(out, ctx.words);
    const alreadyFirst = hook && hook.segmentIndex === 0 && Math.abs(out.segments[0].in - hook.start) < 0.3;
    if (hook && !alreadyFirst) { out = pullHookToFront(out, hook, theme.typography.titlePreset as TextPresetId); notes.push(`Opens on “${hook.text}”.`); }
    else if (hook && !out.text.some((t) => t.role === "opening" && t.text.trim())) {
      const preset = isTextPresetId(theme.typography.titlePreset) ? TEXT_PRESETS[theme.typography.titlePreset] : TEXT_PRESETS.hook_title;
      const fit = fitLine(capital(hook.text.replace(/[.!]+$/, "")), preset);
      out = { ...out, text: [{ id: "thook", at: 0, end: r2(Math.min(hook.end - hook.start + 0.4, 3)), text: fit.text, role: "opening", presetId: fit.preset.id, ...(fit.slot ? { slot: fit.slot } : {}) }, ...out.text] };
    }
  }
  if (theme.motion.alternateZoom) {
    const over = overlayBroll(out, ctx.words, theme.motion.brollSec);
    if (over.placed) { out = over.edl; notes.push(`${over.placed} B-roll shot${over.placed === 1 ? "" : "s"} laid over the speech.`); }
  }
  const paced = paceBroll(out, ctx.words, theme.motion.brollSec, theme.pacing.maxClipSec);
  if (paced.trimmed) { out = paced.edl; notes.push(`${paced.trimmed} shot${paced.trimmed === 1 ? "" : "s"} cut to the theme's beat.`); }
  if (theme.motion.beatSync && ctx.beat && out.segments.length > 1) {
    const r = alignToBeats(out, ctx.clips, ctx.beat);
    if (r.moved) { out = r.edl; notes.push(`${r.moved} cut${r.moved === 1 ? "" : "s"} moved onto the beat.`); }
  }
  // Two pieces of one clip that follow on exactly (the hook pulled out of the middle of a shot leaves its
  // neighbours touching) are one shot again; pieces with a real gap read as a jump cut, and every other
  // one punches in a little so each cut reads as a change of shot (lib/studioClips/jumpCuts.ts).
  out = joinContiguous(out);
  // SOCIA listens to its own check: repair and check again until the cut is clean (lib/studioClips/cutCheck.ts).
  const settled = settleCut(out, ctx.clips);
  out = settled.edl;
  if (settled.fixed.length) notes.push(`Checked and fixed: ${settled.fixed.slice(0, 3).join("; ")}${settled.fixed.length > 3 ? ` and ${settled.fixed.length - 3} more` : ""}.`);
  // The voice carries a cut with speech: shots where no one speaks play without their camera sound (lib/studioClips/shotSound.ts).
  const quiet = muteSilentShots(out, ctx.words);
  if (quiet.muted) { out = quiet.edl; notes.push(shotSoundNote(quiet.muted)); }
  const varied = varyJumpCuts(out);
  if (varied.changed) out = varied.edl;
  return { edl: out, notes };
}
