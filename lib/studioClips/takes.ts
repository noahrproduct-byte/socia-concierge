// Takes of the same line. People film a line two or three times; the cut
// should use the best take once, never two of them. Takes are found from
// what was said (the same opening words, most of the same words), and the
// best one is the complete, clean one: no restarts or broken-off words, no
// dead air, a full stop at the end, no profanity, later rather than earlier
// (the retake is usually the keeper). Pure, unit-tested (takes.test.ts).
import { classifyPauses, findMistakes, sentences } from "./speech";
import type { TranscriptWord } from "./types";
import { clipLabel } from "./types";

export type TakeClip = { id: string; position: number; durationSec: number; words: TranscriptWord[] | null | undefined };
export type TakeGroup = { clipIds: string[]; keep: string; why: string };
export type Takes = { groups: TakeGroup[]; /** clip id → the take kept instead, with the reason */ repeats: Map<string, { of: string; why: string }> };

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const PROFANE = /\b(fuck\w*|shit\w*|bitch\w*|asshole|damn|crap)\b/i;
/** Two clips with at least this many words each are compared. */
const MIN_WORDS = 3;
/** The first N words agreeing, or this share of the words shared, makes two clips takes of one line. */
const SAME_START = 3;
const SAME_SHARE = 0.55;

const tokens = (c: TakeClip): string[] => (c.words ?? []).map((w) => norm(w.text)).filter(Boolean);

/** The share of the words the two clips have in common, against the larger of the two: a long pitch that contains a short line is not a take of it. */
function shared(a: string[], b: string[]): number {
  const sa = new Set(a), sb = new Set(b);
  let hit = 0;
  for (const w of sa) if (sb.has(w)) hit++;
  return hit / Math.max(1, sa.size, sb.size);
}

/** Whether two clips are takes of the same line. */
export function sameLine(a: TakeClip, b: TakeClip): boolean {
  const ta = tokens(a), tb = tokens(b);
  if (ta.length < MIN_WORDS || tb.length < MIN_WORDS) return false;
  const start = ta.slice(0, SAME_START).join(" ") === tb.slice(0, SAME_START).join(" ");
  return start || shared(ta, tb) >= SAME_SHARE;
}

/** Whether the clip's speech has profanity (an off-camera remark, a slip). */
export const profane = (words: TranscriptWord[] | null | undefined): boolean => (words ?? []).some((w) => PROFANE.test(w.text));

export type TakeScore = { score: number; reasons: string[] };

/** How good a take is, and why, in plain words. Higher is better. */
export function scoreTake(c: TakeClip): TakeScore {
  const ws = c.words ?? [];
  const reasons: string[] = [];
  let score = 0;
  const mistakes = findMistakes(ws);
  if (mistakes.length) { score -= 4 * mistakes.length; reasons.push(`${mistakes.length} restart${mistakes.length === 1 ? "" : "s"}`); }
  const broken = ws.filter((w) => /[-—]$/.test(w.text.trim())).length;
  if (broken) { score -= 3 * broken; reasons.push("a broken-off word"); }
  const dead = classifyPauses(ws).filter((p) => p.kind === "dead").length;
  if (dead) { score -= 2 * dead; reasons.push("dead air"); }
  const last = ws[ws.length - 1]?.text.trim() ?? "";
  if (/[.!?]["')\]]?$/.test(last)) score += 6; else reasons.push("trails off");
  if (profane(ws)) { score -= 20; reasons.push("profanity"); }
  // The full line beats a short one, and one with a sentence or two beats a fragment.
  score += Math.min(6, ws.length / 3);
  if (sentences(ws).length > 1 && ws.length > 20) score -= 2;
  return { score, reasons };
}

/**
 * The takes among these clips: each group of clips that say the same line,
 * the one to keep, and every other one as a repeat of it.
 */
export function findTakes(clips: TakeClip[]): Takes {
  const speech = clips.filter((c) => tokens(c).length >= MIN_WORDS);
  const parent = new Map<string, string>(speech.map((c) => [c.id, c.id]));
  const find = (id: string): string => { let p = parent.get(id)!; while (p !== parent.get(p)) p = parent.get(p)!; parent.set(id, p); return p; };
  for (let i = 0; i < speech.length; i++) for (let j = i + 1; j < speech.length; j++) if (sameLine(speech[i], speech[j])) parent.set(find(speech[i].id), find(speech[j].id));
  const members = new Map<string, TakeClip[]>();
  for (const c of speech) { const r = find(c.id); members.set(r, [...(members.get(r) ?? []), c]); }
  const groups: TakeGroup[] = [];
  const repeats = new Map<string, { of: string; why: string }>();
  for (const list of members.values()) {
    if (list.length < 2) continue;
    const scored = list.map((c) => ({ c, s: scoreTake(c) })).sort((a, b) => b.s.score - a.s.score || b.c.position - a.c.position);
    const best = scored[0];
    const why = `${clipLabel(best.c.position)} is the cleanest take of that line`;
    groups.push({ clipIds: list.map((c) => c.id), keep: best.c.id, why });
    for (const { c, s } of scored.slice(1)) repeats.set(c.id, { of: best.c.id, why: s.reasons.length ? `${clipLabel(c.position)} says the same line with ${s.reasons.join(", ")}` : `${clipLabel(c.position)} says the same line` });
  }
  return { groups, repeats };
}

/** One line for a cut's notes about the takes set aside; "" when none. */
export function takesNote(takes: Takes): string {
  if (!takes.repeats.size) return "";
  return `Takes of one line: ${takes.groups.map((g) => `${g.why}; ${g.clipIds.filter((id) => id !== g.keep).map((id) => takes.repeats.get(id)?.why ?? "").join("; ")} and stays in your clips`).join(". ")}.`;
}
