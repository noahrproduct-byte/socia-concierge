// SOCIA checks a cut before anyone sees it, and again live in the editor. The
// editing playbook Noah sent (2026-11-10) asks for the finished edit to be
// inspected, never assumed right, and fixed when a fix is safe. Each check is
// something a viewer would notice, from measurements and the transcript only:
//   stutter   two pieces of one shot a fraction of a second apart: the
//             picture skips and stutters (Noah's "worst video", 2026-11-10)
//   repeat    the same moment of footage plays twice
//   sentence  a shot ends while someone is still mid-sentence
//   voice     a dissolve over someone talking: two voices at once
//   short     a shot too short for anyone to see what it is
//   black     a measured frame inside a shot is black
//   text      two lines of text on top of each other, or text over the ending
// repairCut fixes the first four when it can without inventing anything: it
// only joins, trims or lengthens a shot inside its own clip, or turns a
// dissolve into a hard cut. The rest are reported for the person to decide.
// Pure, unit-tested (cutCheck.test.ts).
import type { ClipForEdl } from "./edl";
import { EDL_DEFAULTS } from "./edl";
import { timeline } from "./timeline";
import { joinContinuous, CONTINUOUS_GAP_SEC, END_CARD_SEC } from "./teach";
import { SPEECH_AT_JOIN_SEC } from "./joins";
import { speechJump } from "./speech";
import { TEXT_PRESETS, presetForRole, isTextPresetId } from "@/lib/textPresets";
import type { Edl, EdlSegment, EdlText } from "./types";
import { clipLabel, fmtClock } from "./types";

export type CheckId = "stutter" | "repeat" | "sentence" | "voice" | "short" | "black" | "text";
export type CutFinding = { id: CheckId; segmentId: string | null; detail: string };
export type CutCheck = { ran: CheckId[]; findings: CutFinding[]; line: string };

export const CHECK = {
  /** two showings of one clip overlapping by this much are the same moment twice */
  repeatSec: 0.3,
  /** a shot shorter than this can't be read */
  shortSec: 0.5,
  /** the next word starting this soon after a shot ends means the sentence was still going */
  sentenceGapSec: 0.6,
  /** how far a shot may be lengthened to let its sentence finish */
  sentenceReachSec: 3,
  /** a measured frame this dark is black */
  blackLuma: 0.03,
} as const;

/** The name of each check, as the editor lists what it found. */
export const CHECK_LABEL: Record<CheckId, string> = {
  stutter: "Stutters",
  repeat: "Plays twice",
  sentence: "Cut off mid-sentence",
  voice: "Transition over speech",
  short: "Too short to see",
  black: "Black frame",
  text: "Text overlaps",
};

/** What the person sees for each check that ran with nothing found. */
const CLEAN: Record<CheckId, string> = {
  stutter: "no shot stutters",
  repeat: "nothing plays twice",
  sentence: "no one is cut off mid-sentence",
  voice: "no dissolve runs over speech",
  short: "every shot is long enough to see",
  black: "no black frames",
  text: "no text overlaps",
};

const SENTENCE_END = /[.!?…]["')\]]?$/;
const r2 = (n: number) => Math.round(n * 100) / 100;

type Word = NonNullable<ClipForEdl["words"]>[number];
const mid = (w: Word) => (w.startMs + w.endMs) / 2000;
const punctuated = (c: ClipForEdl | undefined) => Boolean(c?.words?.some((w) => SENTENCE_END.test(w.text.trim())));

function talking(c: ClipForEdl | undefined, t: number, side: "before" | "after"): boolean {
  const ms = t * 1000, pad = SPEECH_AT_JOIN_SEC * 1000;
  return Boolean(c?.words?.some((w) => (side === "before" ? w.endMs > ms - pad && w.startMs < ms : w.startMs < ms + pad && w.endMs > ms)));
}

/**
 * Where the sentence a shot cuts into ends, in clip seconds; null when the shot
 * ends on a sentence's end, at a pause, or the clip has no punctuated words.
 */
export function sentenceEnd(c: ClipForEdl | undefined, s: Pick<EdlSegment, "in" | "out">): number | null {
  if (!c?.words?.length || !punctuated(c)) return null;
  const words = [...c.words].sort((a, b) => a.startMs - b.startMs);
  const inside = words.filter((w) => mid(w) >= s.in && mid(w) <= s.out);
  const last = inside[inside.length - 1];
  if (!last || SENTENCE_END.test(last.text.trim())) return null;
  const k = words.indexOf(last);
  const next = words[k + 1];
  if (!next || next.startMs / 1000 - s.out > CHECK.sentenceGapSec) return null;
  for (let i = k + 1; i < words.length; i++) {
    if (SENTENCE_END.test(words[i].text.trim())) return r2(Math.min(c.durationSec, words[i].endMs / 1000 + 0.12));
  }
  return null;
}

const slotOf = (t: EdlText) => t.slot ?? (isTextPresetId(t.presetId) ? TEXT_PRESETS[t.presetId].slot : presetForRole(t.role).slot);

/** What a viewer would notice in this cut, from measurements and the transcript only. */
export function checkCut(edl: Edl, clips: ClipForEdl[]): CutCheck {
  const byId = new Map(clips.map((c) => [c.id, c]));
  const label = (id: string) => clipLabel(byId.get(id)?.position ?? 0);
  const tl = timeline(edl);
  const at = (i: number) => fmtClock(tl.segments[i]?.startSec ?? 0);
  const segs = edl.segments;
  const findings: CutFinding[] = [];
  const ran: CheckId[] = ["stutter", "repeat", "short"];

  segs.forEach((s, i) => {
    const prev = segs[i - 1];
    if (prev && prev.clipId === s.clipId && s.in - prev.out < CONTINUOUS_GAP_SEC && s.out > prev.in && !speechJump(byId.get(s.clipId)?.words, prev.out, s.in)) {
      const skip = s.in - prev.out;
      findings.push({ id: "stutter", segmentId: s.id, detail: skip >= 0
        ? `At ${at(i)} ${label(s.clipId)} skips only ${skip.toFixed(1)} s ahead, so the picture jumps. Join the two into one shot.`
        : `At ${at(i)} ${label(s.clipId)} jumps back ${(-skip).toFixed(1)} s and replays what was just shown.` });
    }
    for (let j = 0; j < i; j++) {
      const o = segs[j];
      if (o.clipId !== s.clipId || j === i - 1 && s.in - o.out < CONTINUOUS_GAP_SEC) continue;
      const overlap = Math.min(o.out, s.out) - Math.max(o.in, s.in);
      if (overlap >= CHECK.repeatSec) {
        findings.push({ id: "repeat", segmentId: s.id, detail: `${label(s.clipId)} ${fmtClock(Math.max(o.in, s.in))} to ${fmtClock(Math.min(o.out, s.out))} plays twice, at ${at(j)} and again at ${at(i)}.` });
        break;
      }
    }
    if (s.out - s.in < CHECK.shortSec) findings.push({ id: "short", segmentId: s.id, detail: `The shot at ${at(i)} lasts ${(s.out - s.in).toFixed(1)} s, too short to see what it is.` });
  });

  if (segs.some((s) => byId.get(s.clipId)?.words?.length)) {
    ran.push("voice");
    segs.forEach((s, i) => {
      if (!i || !s.transition || s.transition === "cut") return;
      const prev = segs[i - 1];
      if (prev.voiceTail || talking(byId.get(prev.clipId), prev.out, "before") || talking(byId.get(s.clipId), s.in, "after")) {
        findings.push({ id: "voice", segmentId: s.id, detail: `The ${s.transition === "fade" ? "dissolve" : s.transition} at ${at(i)} runs over someone talking, so two voices play at once. A hard cut keeps the words clear.` });
      }
    });
  }
  if (segs.some((s) => punctuated(byId.get(s.clipId)))) {
    ran.push("sentence");
    segs.forEach((s, i) => {
      const end = sentenceEnd(byId.get(s.clipId), { in: s.in, out: s.out + (s.voiceTail ?? 0) });
      if (end != null) findings.push({ id: "sentence", segmentId: s.id, detail: `The shot at ${at(i)} ends mid-sentence; the sentence finishes at ${fmtClock(end)} in ${label(s.clipId)}.` });
    });
  }
  if (segs.some((s) => byId.get(s.clipId)?.lumaSamples?.length)) {
    ran.push("black");
    segs.forEach((s, i) => {
      const dark = byId.get(s.clipId)?.lumaSamples?.find((f) => f.t >= s.in && f.t <= s.out && f.luma < CHECK.blackLuma);
      if (dark) findings.push({ id: "black", segmentId: s.id, detail: `The shot at ${at(i)} is black around ${fmtClock(dark.t)} in ${label(s.clipId)}.` });
    });
  }
  if (edl.text.length) {
    ran.push("text");
    const cardAt = edl.endCard ? tl.durationSec - END_CARD_SEC : Infinity;
    edl.text.forEach((t, i) => {
      const clash = edl.text.slice(0, i).find((o) => slotOf(o) === slotOf(t) && Math.min(o.end, t.end) - Math.max(o.at, t.at) > 0.1);
      if (clash) findings.push({ id: "text", segmentId: null, detail: `“${t.text}” and “${clash.text}” are on screen at the same time in the same place.` });
      else if (t.end > cardAt + 0.1) findings.push({ id: "text", segmentId: null, detail: `“${t.text}” is still up when the ending comes in at ${fmtClock(cardAt)}.` });
    });
  }

  const found = new Set(findings.map((f) => f.id));
  const clean = ran.filter((id) => !found.has(id)).map((id) => CLEAN[id]);
  const line = findings.length
    ? `${findings.length} thing${findings.length === 1 ? "" : "s"} to look at${clean.length ? `; otherwise ${clean.join(", ")}` : ""}.`
    : `Checked: ${clean.join(", ")}.`;
  return { ran, findings, line };
}

/**
 * The safe fixes, applied to SOCIA's own cut: pieces of one shot joined back
 * together, a repeated moment trimmed off the later showing, a shot lengthened
 * (up to 3 s, inside its clip) to let its sentence finish, a dissolve over
 * speech made a hard cut (unless the person named the transitions). One plain
 * line per fix for the cut's notes.
 */
export function repairCut(edl: Edl, clips: ClipForEdl[], opts: { keepTransitions?: boolean } = {}): { edl: Edl; fixed: string[] } {
  const byId = new Map(clips.map((c) => [c.id, c]));
  const label = (id: string) => clipLabel(byId.get(id)?.position ?? 0);
  const fixed: string[] = [];
  const min = EDL_DEFAULTS.minSegmentSec;

  let segments = edl.segments.map((s) => ({ ...s }));
  const joined = joinContinuous(segments, (prev, s) => speechJump(byId.get(s.clipId)?.words, prev.out, s.in));
  if (joined.length < segments.length) {
    fixed.push(`joined ${segments.length - joined.length} piece${segments.length - joined.length === 1 ? "" : "s"} of the same shot back together so the picture doesn't stutter`);
    segments = joined;
  }

  // The same moment twice: the later showing gives up the part already seen. The last shot is never dropped.
  const keep: EdlSegment[] = [];
  segments.forEach((s, i) => {
    for (const o of keep) {
      if (o.clipId !== s.clipId || Math.min(o.out, s.out) - Math.max(o.in, s.in) < CHECK.repeatSec) continue;
      if (s.out > o.out && s.out - o.out >= min) { s.in = r2(o.out); fixed.push(`${label(s.clipId)} no longer replays a moment already shown`); }
      else if (s.in < o.in && o.in - s.in >= min) { s.out = r2(o.in); fixed.push(`${label(s.clipId)} no longer replays a moment already shown`); }
      else if (i < segments.length - 1) { fixed.push(`took out a second showing of ${label(s.clipId)} ${fmtClock(s.in)} to ${fmtClock(s.out)}`); return; }
    }
    keep.push(s);
  });
  segments = keep;

  // Let a sentence finish. Before a quiet shot from another clip, the voice carries over it (an
  // L-cut) and the picture moves on; otherwise the shot runs on, inside its clip and short of
  // the next showing of the same clip.
  segments.forEach((s, i) => {
    const c = byId.get(s.clipId);
    const end = sentenceEnd(c, { in: s.in, out: s.out + (s.voiceTail ?? 0) });
    if (end == null || end - s.out > CHECK.sentenceReachSec) return;
    const next = segments[i + 1];
    const tail = r2(end - s.out);
    const nextWords = next ? byId.get(next.clipId)?.words : null;
    const nextQuiet = next && next.clipId !== s.clipId && !nextWords?.some((w) => w.endMs / 1000 > next.in && w.startMs / 1000 < next.in + tail + 0.2);
    if (next && nextQuiet && next.out - next.in >= tail + 0.3) {
      s.voiceTail = tail;
      fixed.push(`${label(s.clipId)} finishes its sentence over the next shot`);
      return;
    }
    const nextSame = segments.filter((o) => o !== s && o.clipId === s.clipId && o.in >= s.out).sort((a, b) => a.in - b.in)[0];
    if (nextSame && end > nextSame.in) return;
    fixed.push(`${label(s.clipId)} runs to ${fmtClock(end)} so its sentence isn't cut off`);
    s.out = end;
  });

  // A dissolve over speech becomes a hard cut, unless the person chose the joins themselves.
  segments.forEach((s, i) => {
    if (!i || opts.keepTransitions || !s.transition || s.transition === "cut") return;
    const prev = segments[i - 1];
    if (prev.voiceTail || talking(byId.get(prev.clipId), prev.out, "before") || talking(byId.get(s.clipId), s.in, "after")) {
      delete s.transition;
      fixed.push(`a dissolve over speech at ${label(s.clipId)} is now a hard cut`);
    }
  });

  if (!fixed.length) return { edl, fixed };
  segments.forEach((s, i) => {
    s.id = `s${i + 1}`;
    s.role = i === 0 ? "opener" : segments.length >= 3 && i === segments.length - 1 ? "ending" : "body";
    if (i === 0) delete s.transition;
  });
  return { edl: { ...edl, segments }, fixed };
}
