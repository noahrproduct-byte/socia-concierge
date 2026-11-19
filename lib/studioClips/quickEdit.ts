// The one-drop edit (components/studio/QuickEdit.tsx): one raw clip in, a
// finished cut out. Nothing here is new editing: it runs the passes the editor
// already has, in the order a person would press them, on the whole clip:
//   1. the speech tightened (pauses, retakes, restarts, fillers: speech.ts);
//   2. the look applied (themes/apply.ts);
//   3. the look's own edit (captions on, dead air, the hook, jump cuts: themes/autoEdit.ts).
// What it reports is counted from the cut itself, never estimated. Pure,
// unit-tested (quickEdit.test.ts).
import type { SplitSkinId } from "./splitSkins";
import { alignToBeats, type Beat } from "./beats";
import { clipsForEdl } from "./clientClips";
import { findScenes, type EdlScene } from "./scenes";
import { editSpeech, speechNote } from "./speech";
import { applyTheme } from "./themes/apply";
import { autoEdit } from "./themes/autoEdit";
import type { Theme } from "./themes/schema";
import { timeline } from "./timeline";
import type { BuildSource, Edl, TranscriptWord } from "./types";

export type QuickStats = {
  /** the raw footage the cut started from, seconds */
  rawSec: number;
  /** the finished cut, seconds */
  cutSec: number;
  /** words heard in the raw footage, and how many are still in the cut */
  words: number;
  wordsKept: number;
  /** stretches of the raw footage that are not in the cut */
  removed: number;
  /** pieces the cut is made of */
  shots: number;
  captions: boolean;
  /** graphic scenes on the cut (lib/studioClips/scenes.ts) */
  scenes: number;
};

type WordsById = Record<string, TranscriptWord[] | null | undefined>;
const r1 = (n: number) => Math.round(n * 10) / 10;
/** A stretch shorter than this is a snap to a word, not something taken out. */
const GAP_MIN_SEC = 0.1;

/** What a cut kept of the footage it was made from, counted from the two cuts. */
export function quickStats(base: Edl, cut: Edl, words: WordsById): QuickStats {
  const rawSec = base.segments.reduce((a, s) => a + (s.out - s.in), 0);
  let total = 0, kept = 0, removed = 0;
  for (const b of base.segments) {
    const ws = (words[b.clipId] ?? []).filter((w) => w.startMs / 1000 >= b.in - 0.05 && w.endMs / 1000 <= b.out + 0.05);
    total += ws.length;
    // The parts of this stretch that are still in the cut, in clip time, merged.
    const parts = cut.segments
      .filter((s) => s.clipId === b.clipId && s.out > b.in && s.in < b.out)
      .map((s) => ({ in: Math.max(s.in, b.in), out: Math.min(s.out, b.out) }))
      .sort((x, y) => x.in - y.in);
    const merged: { in: number; out: number }[] = [];
    for (const p of parts) {
      const last = merged[merged.length - 1];
      if (last && p.in <= last.out + GAP_MIN_SEC) last.out = Math.max(last.out, p.out);
      else merged.push({ ...p });
    }
    kept += ws.filter((w) => merged.some((m) => w.startMs / 1000 >= m.in - 0.05 && w.endMs / 1000 <= m.out + 0.05)).length;
    let at = b.in;
    for (const m of merged) { if (m.in - at >= GAP_MIN_SEC) removed += 1; at = m.out; }
    if (b.out - at >= GAP_MIN_SEC) removed += 1;
  }
  return { rawSec: r1(rawSec), cutSec: r1(timeline(cut).durationSec), words: total, wordsKept: kept, removed, shots: cut.segments.length, captions: Boolean(cut.captions), scenes: cut.scenes?.length ?? 0 };
}

/** One line for the cut's notes: the scenes that were added, by kind. */
export function sceneNote(scenes: EdlScene[]): string {
  const n = (kind: EdlScene["kind"]) => scenes.filter((s) => s.kind === kind).length;
  const parts = [n("stat") ? `${n("stat")} figure${n("stat") === 1 ? "" : "s"}` : "", n("change") ? `${n("change")} before and after` : "", n("steps") ? `${n("steps")} list${n("steps") === 1 ? "" : "s"}` : "", n("line") ? `${n("line")} key line${n("line") === 1 ? "" : "s"}` : ""].filter(Boolean);
  return `${scenes.length} animated graphic${scenes.length === 1 ? "" : "s"} from what is said: ${parts.join(", ")}. Change or remove them in the editor, under Words.`;
}

export type QuickOptions = {
  /** animated cards for the figures, lists and key lines that are said */
  scenes?: boolean;
  /** the graphics sit behind the person talking (the person is cut out of the shot in the browser) */
  behind?: boolean;
  /** split screen: the graphics take the top of the frame and the picture moves down under them */
  split?: boolean;
  /** the look the split screen wears */
  skin?: SplitSkinId;
  /** the beat of the music in the cut, when it has music with a steady beat: cuts land on it */
  beat?: Beat | null;
};

/** What every one-drop cut gets last: its cuts on the beat of its music, then the scenes its own words support. */
function finish(cut: Edl, notes: string[], sources: BuildSource[], words: WordsById, opts: QuickOptions): { edl: Edl; notes: string[] } {
  let out = cut;
  if (opts.beat && out.segments.length > 1) {
    const r = alignToBeats(out, clipsForEdl(sources), opts.beat);
    if (r.moved) { out = r.edl; notes.push(`${r.moved} of ${r.total} cut${r.total === 1 ? "" : "s"} moved onto the beat of the music (${Math.round(r.bpm)} BPM).`); }
  }
  // The scenes keep clear of the lines the look just placed, so they are found on the finished cut.
  const { scenes: _old, scenesBehind: _was, scenesSplit: _split, scenesSkin: _skin, ...rest } = out; void _old; void _was; void _split; void _skin;
  const scenes = opts.scenes ? findScenes(rest, words) : [];
  if (scenes.length) notes.push(sceneNote(scenes));
  if (scenes.length && opts.split) notes.push("Split screen: each graphic takes the top of the frame and the picture moves down under it.");
  else if (scenes.length && opts.behind) notes.push("The graphics sit behind the person talking, wherever the two cross.");
  return { edl: scenes.length ? { ...rest, scenes, ...(opts.split ? { scenesSplit: true as const, ...(opts.skin && opts.skin !== "socia" ? { scenesSkin: opts.skin } : {}) } : opts.behind ? { scenesBehind: true as const } : {}) } : rest, notes };
}

/** The cut SOCIA makes of one raw talking clip in one go, in the given look, with a line for each thing it did. */
export function quickCut(base: Edl, theme: Theme, sources: BuildSource[], opts: QuickOptions = {}): { edl: Edl; notes: string[] } {
  const words: WordsById = Object.fromEntries(sources.map((s) => [s.clipId, s.words]));
  const tight = editSpeech(base.segments, words);
  const said = speechNote(tight.removed);
  const themed = applyTheme({ ...base, segments: tight.segments }, theme, { words });
  // A clip where no one speaks has nothing to cut by: it plays whole, with its own sound, in the look. (The look's
  // pacing of silent shots is for B-roll between talking shots; alone it would leave a few seconds of the clip.)
  if (!sources.some((s) => s.words?.length)) return { edl: themed, notes: ["No speech was heard in this clip, so nothing was cut. It plays whole, in this look."] };
  const byId = Object.fromEntries(sources.map((s) => [s.clipId, s]));
  const auto = autoEdit(themed, theme, { clips: clipsForEdl(sources), words, sources: byId, beat: opts.beat });
  return finish(auto.edl, [...(said ? [said] : []), ...auto.notes], sources, words, opts);
}

/**
 * A cut SOCIA already made from what is in the picture (several clips, or a
 * clip where no one speaks: the server's own cut from a brief), put in the
 * look. The same look as the cut already has leaves its shots as they were
 * chosen; another look makes its own edit on top, as picking it in the editor does.
 */
export function quickLook(base: Edl, theme: Theme, sources: BuildSource[], opts: QuickOptions = {}): { edl: Edl; notes: string[] } {
  const words: WordsById = Object.fromEntries(sources.map((s) => [s.clipId, s.words]));
  if (base.theme?.id === theme.id) return finish(base, [], sources, words, opts);
  const byId = Object.fromEntries(sources.map((s) => [s.clipId, s]));
  const auto = autoEdit(applyTheme(base, theme, { words }), theme, { clips: clipsForEdl(sources), words, sources: byId, beat: opts.beat });
  return finish(auto.edl, auto.notes, sources, words, opts);
}

/** The whole of every clip, end to end: what a cut from several clips is counted against. */
export function rawOf(cut: Edl, sources: BuildSource[]): Edl {
  return { ...cut, segments: [...sources].sort((a, b) => a.position - b.position).map((s, i) => ({ id: `r${i + 1}`, clipId: s.clipId, in: 0, out: s.durationSec, role: "body" as const, note: "" })), text: [], broll: undefined, scenes: undefined };
}

/**
 * What SOCIA is asked for when the cut is made from the picture. It covers
 * both kinds of footage, because what is in the clips is only known once they
 * are understood; the improver then fits it to these clips (BriefPanel does the same).
 */
export const PICTURE_BRIEF = "Make one short vertical video from these clips, 15 to 30 seconds. If someone talks, keep the cleanest take of each line, open on the strongest line and lay the shots where no one speaks over the talking. If no one talks, cut to the picture: open on the most finished, best-looking shot, then show the making in the order it happens, and end on the result. Use only the best moment of each clip, keep every shot short, and never repeat a shot.";
