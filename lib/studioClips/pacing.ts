// Pacing rules for a short-form cut, applied to SOCIA's cuts after
// validation and reported for every cut in the editor. Every rule is a plain
// number a person could check with a stopwatch:
//   - the opener starts on the action (never inside a silent lead-in) and runs
//     1 to 5 seconds unless speech carries it longer (one unbroken move can hold it);
//   - no cut drags: a cut without speech stops at 5 seconds, one with speech
//     at 10, both at a word or pause boundary; the silent shot straight after
//     the opening stops at 3, trimmed from its start so the move's end stays
//     (Noah's pizza cut, 2026-11-11: a 4.1 s oven pull right after the hook);
//   - the ending has room to land (1.5 seconds or more);
//   - a text line stays up long enough to read (0.8 s plus 45 ms a character,
//     1 to 4 seconds), and an opening line is on screen from the start.
// Pure, unit-tested (pacing.test.ts). Nothing here invents footage: a cut only
// ever moves inside its own clip.
import { punchPieces } from "./punch";
import type { ClipForEdl } from "./edl";
import { snapTime, EDL_DEFAULTS } from "./edl";
import { timeline } from "./timeline";
import { charCount } from "@/lib/textPresets";
import type { Edl, EdlSegment, EdlText } from "./types";
import { clipLabel } from "./types";
import { styleOf } from "./profiles";
import type { CutCheck } from "./cutCheck";

/** The highest score a cut gets while the cut check has found something; each further finding takes 10 more. */
export const MAX_WITH_FINDINGS = 80;
import { HOUSE_PACING } from "./houseStyle";

export const PACING = {
  openerMinSec: 1,
  openerMaxSec: 5,
  /** a cut with no words inside it stops here */
  silentMaxSec: 5,
  /** the silent shot straight after the opening stops here: the viewer has just been hooked */
  followMaxSec: 3,
  /** a cut carrying speech stops here */
  speechMaxSec: 10,
  endingMinSec: 1.5,
  /** an opening line is on screen by this time */
  openingTextBySec: 0.3,
  readBaseSec: 0.8,
  readPerCharSec: 0.045,
  readMinSec: 1,
  readMaxSec: 4,
  /** a lead-in of silence longer than this, before the first word, is skipped */
  leadInSec: 0.4,
  /** how much silence a cut keeps after its last sound */
  tailSec: 0.15,
  /** a cut this close to a beat (seconds, three frames) counts as on it */
  beatToleranceSec: 0.1,
  /** the most a cut is trimmed or lengthened to reach a beat */
  beatMoveSec: 0.3,
  /** a good Reel averages this long a cut */
  averageCutSec: [1, 4] as const,
  /** a one-take skit or a matched before/after is allowed to hold a silent shot this long (viral-reels study: 7–12 s one-takes) */
  genreSilentMaxSec: { one_take_skit: 12, before_after_match: 9 } as Record<string, number>,
} as const;

/** The pacing numbers for a cut: the defaults with its editing style's own (lib/studioClips/profiles.ts). */
export function pacingRules(edl: Pick<Edl, "editStyle">) {
  return { ...PACING, ...styleOf(edl.editStyle).pacing };
}
export type PacingRules = ReturnType<typeof pacingRules>;

const r2 = (n: number) => Math.round(n * 100) / 100;
const MIN = EDL_DEFAULTS.minSegmentSec;

/** How long a line needs on screen to be read: 0.8 s plus 45 ms a character, 1 to 4 seconds. */
export function minReadSec(text: string): number {
  return r2(Math.min(PACING.readMaxSec, Math.max(PACING.readMinSec, PACING.readBaseSec + charCount(text.trim()) * PACING.readPerCharSec)));
}

/** Words of the clip inside a cut, in clip seconds. */
const wordsIn = (clip: ClipForEdl, a: number, b: number) => (clip.words ?? []).filter((w) => (w.startMs + w.endMs) / 2000 >= a && (w.startMs + w.endMs) / 2000 <= b);
const hasSpeech = (clip: ClipForEdl | undefined, s: Pick<EdlSegment, "in" | "out">) => Boolean(clip && wordsIn(clip, s.in, s.out).length);

/** The first second of sound inside [a, b): the end of a silence that covers `a`, when the clip speaks. */
function actionStart(clip: ClipForEdl, a: number, b: number): number {
  const sil = (clip.silences ?? []).find((s) => s.start <= a + 0.05 && s.end > a + PACING.leadInSec);
  if (!sil) return a;
  const firstWord = (clip.words ?? []).find((w) => w.startMs / 1000 >= a)?.startMs;
  const start = Math.min(sil.end, firstWord != null ? firstWord / 1000 : sil.end) - 0.1;
  return start < b - MIN ? r2(Math.max(a, start)) : a;
}

/** Where the sound stops before `b`: the start of a silence that runs to the out point, plus a short tail. */
function actionEnd(clip: ClipForEdl, a: number, b: number): number {
  const sil = (clip.silences ?? []).find((s) => s.start > a + PACING.openerMinSec && s.end >= b - 0.05 && s.start < b - PACING.leadInSec);
  if (!sil) return b;
  const end = r2(sil.start + PACING.tailSec);
  return end > a + MIN ? end : b;
}

export type PacingChange = { segmentId: string; what: string };

/**
 * SOCIA's cut, paced. Returns the EDL with its cuts and lines moved inside the
 * rules, and one line per change for the cut's notes. Idempotent: a cut that
 * already follows the rules comes back unchanged.
 */
export function applyPacing(edl: Edl, clips: ClipForEdl[]): { edl: Edl; changes: PacingChange[] } {
  const byId = new Map(clips.map((c) => [c.id, c]));
  const P = pacingRules(edl);
  const changes: PacingChange[] = [];
  const segments: EdlSegment[] = edl.segments.map((s) => ({ ...s }));
  const last = segments.length - 1;

  segments.forEach((s, i) => {
    const clip = byId.get(s.clipId);
    if (!clip) return;
    const label = clipLabel(clip.position);
    // Start on the action, stop when the sound stops.
    const inT = actionStart(clip, s.in, s.out);
    if (inT > s.in + 0.05) { changes.push({ segmentId: s.id, what: `${label} starts at ${inT.toFixed(1)}s, where the sound starts, instead of ${s.in.toFixed(1)}s.` }); s.in = inT; }
    const outT = actionEnd(clip, s.in, s.out);
    if (outT < s.out - 0.05) { changes.push({ segmentId: s.id, what: `${label} ends at ${outT.toFixed(1)}s, after its last sound, instead of ${s.out.toFixed(1)}s.` }); s.out = outT; }
    // No cut drags.
    const genreCap = edl.genre ? PACING.genreSilentMaxSec[edl.genre] : undefined;
    const cap = hasSpeech(clip, s) ? Math.max(P.speechMaxSec, genreCap ?? 0) : (genreCap ?? P.silentMaxSec);
    const isOpener = i === 0;
    // A one-take skit IS its opener: the hold before the payoff is the point, so the opener cap doesn't apply.
    const openerCap = isOpener && !hasSpeech(clip, s) && !genreCap ? Math.min(cap, P.openerMaxSec) : cap;
    // The silent shot right after the hook keeps the viewer moving: it gives up its start, so the move still lands.
    const follow = i === 1 && last >= 2 && !hasSpeech(clip, s) && !genreCap;
    if (follow && s.out - s.in > P.followMaxSec + 0.05) {
      const target = snapTime(s.out - P.followMaxSec, clip, "in");
      const inT = target < s.out - MIN && s.out - target <= P.followMaxSec + 0.05 ? target : r2(s.out - P.followMaxSec);
      changes.push({ segmentId: s.id, what: `${label} starts at ${inT.toFixed(1)}s so the shot after the opening runs ${(s.out - inT).toFixed(1)}s and keeps the pace.` });
      s.in = inT;
    } else if (!follow && s.out - s.in > openerCap + 0.05) {
      const target = snapTime(s.in + openerCap, clip, "out");
      const out = target > s.in + MIN ? target : r2(s.in + openerCap);
      changes.push({ segmentId: s.id, what: `${label} shortened to ${(out - s.in).toFixed(1)}s so it doesn't drag.` });
      s.out = out;
    }
    // The opener and the ending have room to land.
    const floor = isOpener ? P.openerMinSec : i === last ? P.endingMinSec : 0;
    if (floor && s.out - s.in < floor - 0.05 && clip.durationSec - s.in >= floor) {
      const target = snapTime(s.in + floor, clip, "out");
      const out = Math.min(clip.durationSec, Math.max(target, s.in + floor));
      changes.push({ segmentId: s.id, what: `${label} runs ${(out - s.in).toFixed(1)}s so the ${isOpener ? "opening" : "ending"} has room to land.` });
      s.out = r2(out);
    }
  });

  // Text lines: readable, and the opening line up from the start.
  const total = timeline({ ...edl, segments }).durationSec;
  const text: EdlText[] = edl.text.map((t) => {
    const need = minReadSec(t.text);
    let at = t.at, end = t.end;
    if (t.role === "opening" && at > PACING.openingTextBySec) at = 0.2;
    if (end - at < need) end = r2(Math.min(total, at + need));
    if (end - at < need) at = r2(Math.max(0, end - need));
    if (at !== t.at || end !== t.end) changes.push({ segmentId: t.id, what: `“${t.text}” shows from ${at.toFixed(1)}s to ${end.toFixed(1)}s so it can be read.` });
    return at !== t.at || end !== t.end ? { ...t, at, end } : t;
  });
  return { edl: { ...edl, segments, text }, changes };
}

// ------------------------------------------------------------------ report ----

export type PacingPart = { id: "opener" | "pace" | "drag" | "ending" | "text" | "beat"; label: string; ok: boolean; detail: string };
export type PacingReport = { score: number; line: string; parts: PacingPart[]; averageCutSec: number; cuts: number };

/**
 * How a cut reads against the rules, as a share of rules met (0 to 100) with
 * one plain sentence and the parts behind it. Deterministic: the same cut
 * always gets the same report. `beat` is only judged when a tempo is known.
 */
export function pacingReport(edl: Edl, clips: ClipForEdl[], beat?: { bpm: number; offsetSec: number } | null, check?: Pick<CutCheck, "findings"> | null): PacingReport {
  const byId = new Map(clips.map((c) => [c.id, c]));
  const P = pacingRules(edl);
  const tl = timeline(edl);
  // A continuous take with punch-ins reads as its pieces (lib/studioClips/punch.ts).
  const segs = edl.segments.flatMap((s) => (s.punches?.length ? punchPieces(s).map((p) => ({ ...s, in: p.in, out: p.out })) : [s]));
  const lens = segs.map((s) => s.out - s.in);
  const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const parts: PacingPart[] = [];

  const first = segs[0];
  const firstClip = first ? byId.get(first.clipId) : undefined;
  if (first) {
    const len = first.out - first.in;
    const silentLead = firstClip ? actionStart(firstClip, first.in, first.out) > first.in + 0.05 : false;
    const holdCap = edl.genre ? PACING.genreSilentMaxSec[edl.genre] : undefined;
    const ok = !silentLead && len >= P.openerMinSec - 0.05 && (hasSpeech(firstClip, first) || len <= (holdCap ?? P.openerMaxSec) + 0.05);
    parts.push({ id: "opener", label: "Strong opening", ok, detail: silentLead ? `The first cut starts ${(actionStart(firstClip!, first.in, first.out) - first.in).toFixed(1)}s before its sound.` : `The first cut runs ${len.toFixed(1)}s${hasSpeech(firstClip, first) ? " with speech" : ""}.` });
  }
  if (segs.length) {
    const genreCap = edl.genre ? PACING.genreSilentMaxSec[edl.genre] : undefined;
    // A sports montage runs 0.75–0.9 s a shot (house style); the general floor is the edit style's.
    const paceFloor = edl.genre ? Math.min(P.averageCutSec[0], HOUSE_PACING[edl.genre].medianShotSec[0]) : P.averageCutSec[0];
    const ok = avg >= paceFloor - 0.05 && avg <= (genreCap ?? P.averageCutSec[1]) + 0.05;
    parts.push({ id: "pace", label: "Short-form pace", ok, detail: `${segs.length} cut${segs.length === 1 ? "" : "s"} averaging ${avg.toFixed(1)}s.` });
    const capFor = (s: EdlSegment, i: number) => hasSpeech(byId.get(s.clipId), s) ? Math.max(P.speechMaxSec, genreCap ?? 0) : genreCap ?? (i === 1 && segs.length >= 3 ? Math.min(P.silentMaxSec, P.followMaxSec) : P.silentMaxSec);
    const dragging = segs.filter((s, i) => s.out - s.in > capFor(s, i) + 0.05);
    parts.push({ id: "drag", label: "No cut drags", ok: !dragging.length, detail: dragging.length ? `${dragging.map((s) => `${clipLabel(byId.get(s.clipId)?.position ?? 0)} (${(s.out - s.in).toFixed(1)}s)`).join(", ")} run${dragging.length === 1 ? "s" : ""} longer than a viewer waits.` : `The longest cut is ${Math.max(...lens).toFixed(1)}s.` });
    const ending = segs[segs.length - 1];
    const endLen = ending.out - ending.in;
    parts.push({ id: "ending", label: "Room to land", ok: segs.length === 1 || endLen >= P.endingMinSec - 0.05, detail: `The last cut runs ${endLen.toFixed(1)}s.` });
  }
  if (edl.text.length) {
    const short = edl.text.filter((t) => t.end - t.at < minReadSec(t.text) - 0.05);
    parts.push({ id: "text", label: "Readable text", ok: !short.length, detail: short.length ? `“${short[0].text}” is up ${(short[0].end - short[0].at).toFixed(1)}s and needs ${minReadSec(short[0].text).toFixed(1)}s.` : `${edl.text.length} line${edl.text.length === 1 ? "" : "s"}, each up long enough to read.` });
  }
  if (beat && beat.bpm > 0 && tl.segments.length > 1) {
    const period = 60 / beat.bpm;
    const tol = Math.min(PACING.beatToleranceSec, period / 4);
    const bounds = tl.segments.slice(1).map((s) => s.startSec + s.overlapIn / 2 / edl.fps);
    const on = bounds.filter((b) => { const k = Math.round((b - beat.offsetSec) / period); return Math.abs(b - (beat.offsetSec + k * period)) <= tol; }).length;
    parts.push({ id: "beat", label: "On the beat", ok: on === bounds.length, detail: `${on} of ${bounds.length} cuts land on the music's beat (${Math.round(beat.bpm)} BPM).` });
  }
  const met = parts.filter((p) => p.ok).length;
  const failing = parts.filter((p) => !p.ok);
  // What the cut check found (lib/studioClips/cutCheck.ts) is something a viewer sees: the score can't read as finished while it's there.
  const found = check?.findings.length ?? 0;
  const held = Math.max(0, MAX_WITH_FINDINGS + 10 - found * 10);
  const raw = parts.length ? Math.round((met / parts.length) * 100) : 0;
  const score = found ? Math.min(raw, held) : raw;
  const heldLine = found && score < raw ? ` Held at ${score} until the ${found === 1 ? "thing" : `${found} things`} below ${found === 1 ? "is" : "are"} fixed.` : "";
  const line = !parts.length
    ? "No cuts to pace yet."
    : !failing.length
      ? `${found ? "Paced well" : "Paced like a good short-form edit"}: ${segs.length} cut${segs.length === 1 ? "" : "s"} averaging ${avg.toFixed(1)}s, a ${(lens[0] ?? 0).toFixed(1)}s opening${edl.text.length ? ", every line readable" : ""}${beat ? ", on the beat" : ""}.${heldLine}`
      : `${met} of ${parts.length} pacing rules met. ${failing.map((p) => p.detail).join(" ")}${heldLine}`;
  return { score, line, parts, averageCutSec: r2(avg), cuts: segs.length };
}
