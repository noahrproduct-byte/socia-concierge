// The raters: how SOCIA scores a clip, picks a moment and orders the posts,
// as arithmetic over what was measured and what the clip card says, so the
// same footage always gets the same number and the same sentence. A clip
// scores on four things a person would check: a clear hook, good light, a
// steady picture and clean sound. Anything not measured is left out of the
// average rather than guessed, and every result carries one plain sentence.
// Pure, unit-tested.
import type { BuildSource, ClipCard, ClipFacts, ClipMoment, Opportunity } from "./types";
import { clipLabel } from "./types";

export type RatedClip = { id: string; position: number; durationSec: number; card: ClipCard | null; facts: ClipFacts | null };

export type ScorePart = { id: "hook" | "light" | "steady" | "sound"; label: string; /** 0..1, or null when nothing measured it */ value: number | null; note: string };
export type ClipScore = { score: number | null; parts: ScorePart[]; reason: string; label: string };

const r = (n: number) => Math.round(n * 100) / 100;
const STRENGTH: Record<ClipMoment["strength"], number> = { strong: 3, good: 2, weak: 1 };

function hookPart(card: ClipCard | null): ScorePart {
  if (!card) return { id: "hook", label: "Clear hook", value: null, note: "not understood yet" };
  if (card.openerCandidate && card.speech.hookLine) return { id: "hook", label: "Clear hook", value: 1, note: `a spoken hook: “${card.speech.hookLine}”` };
  if (card.openerCandidate) return { id: "hook", label: "Clear hook", value: 0.9, note: "an opening that stops a scroll" };
  if (card.speech.hookLine) return { id: "hook", label: "Clear hook", value: 0.75, note: `a spoken line to open on: “${card.speech.hookLine}”` };
  const best = Math.max(0, ...card.moments.map((m) => STRENGTH[m.strength]));
  if (best >= 3) return { id: "hook", label: "Clear hook", value: 0.6, note: "a strong moment, though not in the first seconds" };
  if (best >= 2) return { id: "hook", label: "Clear hook", value: 0.4, note: "usable moments, none that opens a post" };
  return { id: "hook", label: "Clear hook", value: 0.1, note: "no moment that would hold attention" };
}

function lightPart(facts: ClipFacts | null): ScorePart {
  const v = facts?.visual;
  if (!v) return { id: "light", label: "Good light", value: null, note: "picture not measured" };
  let value = v.brightness === "ok" ? 1 : 0.45;
  const notes: string[] = [v.brightness === "ok" ? "well lit" : v.brightness === "dark" ? "dark" : "too bright"];
  if (v.clippedHighlights) { value -= 0.2; notes.push("blown highlights"); }
  if (v.crushedShadows) { value -= 0.15; notes.push("crushed shadows"); }
  if (v.contrast === "low") { value -= 0.15; notes.push("flat"); }
  return { id: "light", label: "Good light", value: r(Math.max(0, value)), note: notes.join(", ") };
}

function steadyPart(facts: ClipFacts | null, durationSec: number): ScorePart {
  const cuts = facts?.visual?.sceneCuts;
  if (!cuts || !(durationSec > 0)) return { id: "steady", label: "Steady picture", value: null, note: "picture changes not measured" };
  const perTen = (cuts.length / durationSec) * 10;
  const value = perTen === 0 ? 1 : perTen <= 2 ? 0.85 : perTen <= 5 ? 0.5 : 0.2;
  const note = perTen === 0 ? "a steady picture" : perTen <= 2 ? "a few scene changes" : perTen <= 5 ? "the picture changes often" : "the picture jumps around";
  return { id: "steady", label: "Steady picture", value, note };
}

function soundPart(facts: ClipFacts | null, card: ClipCard | null): ScorePart {
  const a = facts?.audio;
  if (!a) return { id: "sound", label: "Clean sound", value: null, note: "sound not measured" };
  if (!a.hasAudio || a.level === "silent") return { id: "sound", label: "Clean sound", value: 0.4, note: "no sound" };
  if (a.level === "unknown") return { id: "sound", label: "Clean sound", value: null, note: "sound not measured" };
  let value = a.level === "ok" ? 1 : 0.5;
  const notes = [a.level === "ok" ? "clean sound" : a.level === "quiet" ? "quiet sound" : "loud sound"];
  if (card?.quality.audio === "noisy") { value -= 0.3; notes.push("background noise"); }
  return { id: "sound", label: "Clean sound", value: r(Math.max(0, value)), note: notes.join(" with ") };
}

const WORD = (s: number) => (s >= 80 ? "Strong clip" : s >= 60 ? "Usable clip" : s >= 40 ? "Weak clip" : "Hard to use");

/** One clip's score and the sentence that explains it. */
export function clipScore(c: RatedClip): ClipScore {
  const parts = [hookPart(c.card), lightPart(c.facts), steadyPart(c.facts, c.durationSec), soundPart(c.facts, c.card)];
  const known = parts.filter((p): p is ScorePart & { value: number } => p.value != null);
  if (!known.length) return { score: null, parts, reason: `${clipLabel(c.position)} hasn't been measured or understood yet.`, label: "Not rated yet" };
  const score = Math.round((known.reduce((a, p) => a + p.value, 0) / known.length) * 100);
  const good = known.filter((p) => p.value >= 0.75), bad = known.filter((p) => p.value < 0.75);
  const list = (xs: ScorePart[]) => xs.map((p) => p.note).join(", ").replace(/, ([^,]*)$/, " and $1");
  const reason = good.length && bad.length ? `${list(good)}, but ${list(bad)}.` : good.length ? `${list(good)}.` : `${list(bad)}.`;
  return { score, parts, reason: reason.charAt(0).toUpperCase() + reason.slice(1), label: WORD(score) };
}

/** Clips best first; ties by upload order, so the order never shifts between runs. */
export function rankClips<T extends RatedClip>(clips: T[]): (T & { rating: ClipScore })[] {
  return clips.map((c) => ({ ...c, rating: clipScore(c) })).sort((a, b) => (b.rating.score ?? -1) - (a.rating.score ?? -1) || a.position - b.position);
}

/** A clip's best moment to cut in: the strongest, then the longest, with why. */
export function bestMomentFor(src: Pick<BuildSource, "moments" | "durationSec" | "position">, maxSec = 6): { start: number; end: number; why: string } {
  const ok = src.moments.filter((m) => m.end > m.start && m.strength !== "weak").sort((a, b) => STRENGTH[b.strength] - STRENGTH[a.strength] || (b.end - b.start) - (a.end - a.start));
  const m = ok[0];
  if (!m) return { start: 0, end: r(Math.min(src.durationSec, Math.max(0.8, Math.min(maxSec, src.durationSec)))), why: `${clipLabel(src.position)} has no rated moment, so its first ${Math.min(maxSec, src.durationSec).toFixed(0)} seconds go in.` };
  return { start: r(m.start), end: r(Math.min(m.end, m.start + maxSec)), why: `${clipLabel(src.position)}'s ${m.strength} moment “${m.label}”${m.why ? `: ${m.why}` : ""}.` };
}

/** Why this post was picked, in one sentence from its evidence. */
export function whyPost(o: Opportunity): string {
  const e = o.evidence;
  const bits = [`${e.usableSec}s of usable footage across ${e.clips} clip${e.clips === 1 ? "" : "s"}`];
  if (e.hasOpener) bits.unshift(o.opener?.why ? `it opens on ${o.opener.why.replace(/\.$/, "")}` : "it has a strong opening");
  bits.push(`${e.distinctMoments} distinct moment${e.distinctMoments === 1 ? "" : "s"}`);
  if (e.hasSpeech) bits.push("speech to caption");
  const s = `${o.strength === "strong" ? "A strong post because" : "Possible because"} ${bits.join(", ").replace(/, ([^,]*)$/, " and $1")}.`;
  return s;
}

/** How the posts are ordered, said once above the list. */
export const ORDER_LINE = "Strong posts first, then the most usable footage; the same clips always give the same order.";
