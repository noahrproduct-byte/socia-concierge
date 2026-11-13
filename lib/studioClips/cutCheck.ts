// SOCIA checks a cut before anyone sees it, and again live in the editor. The
// editing playbook Noah sent (2026-11-10) asks for the finished edit to be
// inspected, never assumed right, and fixed when a fix is safe. Each check is
// something a viewer would notice, from measurements and the transcript only:
//   stutter   two pieces of one shot a fraction of a second apart: the
//             picture skips and stutters (Noah's "worst video", 2026-11-10)
//   repeat    the same moment of footage plays twice
//   sentence  a shot ends while someone is still mid-sentence
//   voice     a dissolve over someone talking: two voices at once
//   ghost     a dissolve between the same shot a moment apart: the same
//             picture twice, one ghosted over the other
//   short     a shot too short for anyone to see what it is
//   black     a measured frame inside a shot is black
//   text      two lines of text on top of each other, text over the ending,
//             words SOCIA had to shorten or that don't fit their look, or an
//             opening line that spills a moment into the next shot
// repairCut fixes the first five when it can without inventing anything: it
// only joins, trims or lengthens a shot inside its own clip, or turns a
// dissolve into a hard cut; it also ends an opening line with its shot. The
// rest are reported for the person to decide.
// Pure, unit-tested (cutCheck.test.ts).
import { joinedPunches } from "./punch";
import type { ClipForEdl } from "./edl";
import { EDL_DEFAULTS } from "./edl";
import { timeline } from "./timeline";
import { joinContinuous, CONTINUOUS_GAP_SEC, END_CARD_SEC } from "./teach";
import { SPEECH_AT_JOIN_SEC, DISSOLVE_MIN_SKIP_SEC } from "./joins";
import { speechJump } from "./speech";
import { TEXT_PRESETS, presetForRole, presetOf, isTextPresetId, charCount } from "@/lib/textPresets";
import type { Edl, EdlSegment, EdlText } from "./types";
import { clipLabel, fmtClock } from "./types";

export type CheckId = "stutter" | "jump" | "repeat" | "sentence" | "voice" | "ghost" | "short" | "black" | "text";
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
  /** an opening line still up this little after the first cut flashes onto the next shot */
  spillSec: 0.6,
  /**
   * Two pieces of one moving shot this close in the footage: the picture and the
   * sound jump forward mid-motion and read as a glitch, not a cut (Noah,
   * 2026-11-12: "repeated parts/glitches in the video and audio"). Either one
   * continuous stretch, or this far apart.
   */
  sameTakeGapSec: 2.5,
  /** Two pieces joined into one continuous stretch may run this long; past it the later piece goes. */
  joinMaxSec: 7,
} as const;

/** Whether the clip changes shot (a sharp scene change) between two moments: then a short skip is a real cut. */
const sceneBetween = (c: ClipForEdl | undefined, a: number, b: number): boolean => Boolean(c?.sceneCuts?.some((t) => t > a - 0.05 && t < b + 0.05));

/** A skip inside one moving shot that reads as a glitch: same clip, a little ahead, no change of shot, nobody's speech edited there. */
export function jumpsInTake(prev: { clipId: string; out: number }, s: { clipId: string; in: number }, c: ClipForEdl | undefined): boolean {
  const gap = s.in - prev.out;
  return prev.clipId === s.clipId && gap >= CONTINUOUS_GAP_SEC && gap < CHECK.sameTakeGapSec && !sceneBetween(c, prev.out, s.in) && !speechJump(c?.words, prev.out, s.in);
}

/** The name of each check, as the editor lists what it found. */
export const CHECK_LABEL: Record<CheckId, string> = {
  stutter: "Stutters",
  jump: "Jumps inside one shot",
  repeat: "Plays twice",
  sentence: "Cut off mid-sentence",
  voice: "Transition over speech",
  ghost: "Dissolve doubles the picture",
  short: "Too short to see",
  black: "Black frame",
  text: "Text",
};

/** What the person sees for each check that ran with nothing found. */
const CLEAN: Record<CheckId, string> = {
  stutter: "no shot stutters",
  jump: "no skip inside a moving shot",
  repeat: "nothing plays twice",
  sentence: "no one is cut off mid-sentence",
  voice: "no dissolve runs over speech",
  ghost: "no dissolve doubles the picture",
  short: "every shot is long enough to see",
  black: "no black frames",
  text: "every line fits and nothing overlaps",
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

/** Where the first cut lands in the output, in seconds (the middle of a dissolve); Infinity with one shot. */
export function firstCutSec(edl: Edl): number {
  const tl = timeline(edl);
  const second = tl.segments[1];
  return second ? r2(second.startSec + second.overlapIn / 2 / edl.fps) : Infinity;
}

/**
 * An opening line that stays up a moment past the first cut (under
 * CHECK.spillSec) flashes onto the next shot: it ends with its shot instead.
 * A line placed well across the cut is left alone.
 */
export function endOpeningWithShot(edl: Edl): { edl: Edl; fixed: string | null } {
  const cut = firstCutSec(edl);
  let fixed: string | null = null;
  const text = edl.text.map((t) => {
    if (t.role !== "opening" || t.at >= cut - 0.5 || t.end <= cut + 0.05 || t.end - cut >= CHECK.spillSec) return t;
    fixed = `“${t.text}” now ends with the first shot instead of flashing over the second`;
    return { ...t, end: cut };
  });
  return fixed ? { edl: { ...edl, text }, fixed } : { edl, fixed };
}

/** What a viewer would notice in this cut, from measurements and the transcript only. */
export function checkCut(edl: Edl, clips: ClipForEdl[]): CutCheck {
  const byId = new Map(clips.map((c) => [c.id, c]));
  const label = (id: string) => clipLabel(byId.get(id)?.position ?? 0);
  const tl = timeline(edl);
  const at = (i: number) => fmtClock(tl.segments[i]?.startSec ?? 0);
  const segs = edl.segments;
  const findings: CutFinding[] = [];
  const ran: CheckId[] = ["stutter", "jump", "repeat", "short"];

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
    if (prev && jumpsInTake(prev, s, byId.get(s.clipId))) {
      findings.push({ id: "jump", segmentId: s.id, detail: `At ${at(i)} ${label(s.clipId)} skips ${(s.in - prev.out).toFixed(1)} s inside one moving shot, so the picture and sound jump like a glitch. Play it through, or skip further.` });
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
  if (segs.some((s, i) => i && s.transition && s.transition !== "cut")) {
    ran.push("ghost");
    segs.forEach((s, i) => {
      const prev = segs[i - 1];
      if (!i || s.transition !== "fade" || prev.clipId !== s.clipId || Math.abs(s.in - prev.out) > DISSOLVE_MIN_SKIP_SEC) return;
      findings.push({ id: "ghost", segmentId: s.id, detail: `The dissolve at ${at(i)} joins ${label(s.clipId)} to itself ${Math.abs(s.in - prev.out).toFixed(1)} s later, so the same picture shows twice, one over the other. A hard cut is cleaner.` });
    });
  }
  if (segs.some((s) => punctuated(byId.get(s.clipId)))) {
    ran.push("sentence");
    segs.forEach((s, i) => {
      if (s.volume === 0) return;
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
    const firstCut = firstCutSec(edl);
    edl.text.forEach((t, i) => {
      const clash = edl.text.slice(0, i).find((o) => slotOf(o) === slotOf(t) && Math.min(o.end, t.end) - Math.max(o.at, t.at) > 0.1);
      const max = presetOf(t).maxChars;
      if (clash) findings.push({ id: "text", segmentId: null, detail: `“${t.text}” and “${clash.text}” are on screen at the same time in the same place.` });
      else if (t.end > cardAt + 0.1) findings.push({ id: "text", segmentId: null, detail: `“${t.text}” is still up when the ending comes in at ${fmtClock(cardAt)}.` });
      else if (charCount(t.text) > max) findings.push({ id: "text", segmentId: null, detail: `“${t.text}” is ${charCount(t.text)} characters; its look holds ${max}, so words fall off. Shorten it or pick a roomier look.` });
      else if (t.shortened) findings.push({ id: "text", segmentId: null, detail: `“${t.text}” was shortened to fit. Read it, and rewrite it if it lost its point.` });
      else if (t.role === "opening" && t.at < firstCut && t.end > firstCut + 0.05 && t.end - firstCut < CHECK.spillSec) findings.push({ id: "text", segmentId: null, detail: `“${t.text}” stays up ${(t.end - firstCut).toFixed(1)} s into the second shot, so it flashes over it. End it with the first shot.` });
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

  // A skip of a second or two inside one moving shot reads as a glitch. In order of what keeps most:
  // start the later piece far enough on; play the two through as one stretch; or leave the later piece out.
  const smooth: EdlSegment[] = [];
  segments.forEach((s, idx) => {
    const isLast = idx === segments.length - 1;
    const prev = smooth[smooth.length - 1];
    const c = byId.get(s.clipId);
    if (!prev || !jumpsInTake(prev, s, c)) { smooth.push(s); return; }
    const later = r2(prev.out + CHECK.sameTakeGapSec);
    if (s.out - later >= Math.max(min, 1)) {
      s.in = later;
      fixed.push(`${label(s.clipId)} skips further on at ${fmtClock(later)}, so one moving shot doesn't jump like a glitch`);
      smooth.push(s);
    } else if (isLast && s.in - CHECK.sameTakeGapSec - prev.in >= Math.max(min, 1)) {
      // The ending stays: the shot before it ends sooner instead.
      prev.out = r2(s.in - CHECK.sameTakeGapSec);
      fixed.push(`${label(prev.clipId)} ends at ${fmtClock(prev.out)}, so the last shot doesn't jump a second inside one moving shot`);
      smooth.push(s);
    } else if (isLast || s.out - prev.in <= CHECK.joinMaxSec) {
      const sound = Boolean(prev.sound || s.sound);
      const punches = joinedPunches(prev, s, prev.out);
      smooth[smooth.length - 1] = { ...prev, out: s.out, role: s.role === "ending" ? "ending" : prev.role, ...(sound ? { sound: true } : {}), ...(punches.length ? { punches } : {}) };
      if (sound) delete smooth[smooth.length - 1].volume;
      fixed.push(`played ${label(s.clipId)} ${fmtClock(prev.in)} to ${fmtClock(s.out)} through as one shot instead of skipping a second inside it`);
    } else {
      fixed.push(`left out ${label(s.clipId)} ${fmtClock(s.in)} to ${fmtClock(s.out)}, which sat a second after the shot before it and would jump like a glitch`);
    }
  });
  segments = smooth;

  // Let a sentence finish. Before a quiet shot from another clip, the voice carries over it (an
  // L-cut) and the picture moves on; otherwise the shot runs on, inside its clip and short of
  // the next showing of the same clip.
  segments.forEach((s, i) => {
    // A muted shot has no sentence to finish.
    if (s.volume === 0) return;
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

/**
 * SOCIA listening to its own check: repair, check again, and keep going
 * while something is still found and a pass still changes the cut (at most
 * four). What repair cannot fix by itself is fixed here the blunt way: a shot
 * too short to see is dropped (never the opener or the ending; the ending is
 * lengthened inside its clip instead), a dissolve over speech becomes a cut.
 * Returns the cut, every fix made and what is still left for the person.
 */
export function settleCut(edl: Edl, clips: ClipForEdl[], opts: { keepTransitions?: boolean } = {}): { edl: Edl; fixed: string[]; left: CutFinding[] } {
  const byId = new Map(clips.map((c) => [c.id, c]));
  const label = (id: string) => clipLabel(byId.get(id)?.position ?? 0);
  let cur = edl;
  const fixed: string[] = [];
  let left: CutFinding[] = [];
  for (let pass = 0; pass < 4; pass++) {
    const before = JSON.stringify(cur.segments);
    const r = repairCut(cur, clips, opts);
    cur = r.edl; fixed.push(...r.fixed);
    left = checkCut(cur, clips).findings;
    if (!left.length) break;
    // Shots too short to see: the ending runs on inside its clip; any other one goes.
    const shorts = left.filter((f) => f.id === "short").map((f) => f.segmentId);
    if (shorts.length) {
      const segments: EdlSegment[] = [];
      cur.segments.forEach((s, i) => {
        if (!shorts.includes(s.id)) { segments.push(s); return; }
        const clip = byId.get(s.clipId);
        const isEdge = i === 0 || i === cur.segments.length - 1;
        if (isEdge && clip && clip.durationSec - s.in >= CHECK.shortSec + 0.3) { segments.push({ ...s, out: r2(Math.min(clip.durationSec, s.in + Math.max(CHECK.shortSec + 0.3, 1))) }); fixed.push(`${label(s.clipId)} runs on so it can be seen`); }
        else if (cur.segments.length > 1) fixed.push(`left out a ${(s.out - s.in).toFixed(1)} s piece of ${label(s.clipId)}, too short to see`);
        else segments.push(s);
      });
      cur = { ...cur, segments };
    }
    // A dissolve or a blur over speech becomes a hard cut, even when transitions were asked for: two voices at once is worse.
    const voices = left.filter((f) => f.id === "voice" || f.id === "ghost").map((f) => f.segmentId);
    if (voices.length) {
      cur = { ...cur, segments: cur.segments.map((s) => (voices.includes(s.id) ? (({ transition: _t, ...rest }) => { void _t; return rest; })(s) : s)) };
      fixed.push("made a join over speech a hard cut, so one voice plays at a time");
    }
    // A moment shown twice: the later showing goes (repair trims overlaps; a full repeat is dropped here).
    const repeats = left.filter((f) => f.id === "repeat").map((f) => f.segmentId);
    if (repeats.length && cur.segments.length > 1) {
      cur = { ...cur, segments: cur.segments.filter((s, i) => !(repeats.includes(s.id) && i > 0)) };
      fixed.push("took out a moment that was already shown");
    }
    left = checkCut(cur, clips).findings;
    if (!left.length || JSON.stringify(cur.segments) === before) break;
  }
  // Roles follow the order that is left.
  const segments = cur.segments.map((s, i, all) => ({ ...s, role: i === 0 ? ("opener" as const) : all.length >= 3 && i === all.length - 1 ? ("ending" as const) : s.role === "opener" || s.role === "ending" ? ("body" as const) : s.role }));
  return { edl: { ...cur, segments }, fixed: [...new Set(fixed)], left };
}
