// Prompt mode: a written brief becomes the same shape the editor already cuts
// from (an Opportunity), built only from what the clips' cards say exists.
// Pure and tested; the model never sees anything invented here.
import type { ClipCard, Opportunity, MomentRef } from "./types";

export type BriefClip = { id: string; position: number; durationSec: number; card: ClipCard | null };

export const PROMPT_MIN = 8;
export const PROMPT_MAX = 2000;
export const TITLE_MAX = 70;

/** The first sentence or line of the brief, shortened to a title. */
export function titleFromPrompt(prompt: string): string {
  const first = prompt.trim().split(/\n+/)[0]?.split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
  const t = first.replace(/^["'“”]+|["'“”.]+$/g, "").trim();
  if (!t) return "Video from your brief";
  return t.length <= TITLE_MAX ? t : `${t.slice(0, TITLE_MAX - 1).replace(/\s+\S*$/, "")}…`;
}

/** Trim and bound a brief; null when it is too short to cut from. */
export function cleanPrompt(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const p = raw.replace(/\r/g, "").trim().slice(0, PROMPT_MAX);
  return p.length >= PROMPT_MIN ? p : null;
}

/**
 * The brief as an Opportunity over every understood clip: all non-weak
 * moments are offered, the first opener candidate's strongest early moment is
 * the opener, and the evidence counts what is really there.
 */
export function opportunityFromPrompt(prompt: string, clips: BriefClip[], idx = -1): Opportunity {
  const carded = clips.filter((c) => c.card);
  const moments: MomentRef[] = [];
  for (const c of carded) for (const m of c.card!.moments) if (m.strength !== "weak" && m.end > m.start) moments.push({ clipId: c.id, start: m.start, end: m.end });
  const clipIds = [...new Set(moments.map((m) => m.clipId))];
  const openerClip = carded.find((c) => c.card!.openerCandidate && c.card!.moments.some((m) => m.strength !== "weak"));
  let opener: Opportunity["opener"] = null;
  if (openerClip) {
    const m = [...openerClip.card!.moments].filter((x) => x.strength !== "weak").sort((a, b) => (a.strength === b.strength ? a.start - b.start : a.strength === "strong" ? -1 : 1))[0];
    if (m) opener = { clipId: openerClip.id, start: m.start, end: m.end, why: openerClip.card!.speech.hookLine ? `a hook line is spoken early: "${openerClip.card!.speech.hookLine}"` : "flagged as a scroll-stopping opening" };
  }
  const usableSec = moments.reduce((a, m) => a + (m.end - m.start), 0);
  return {
    idx,
    title: titleFromPrompt(prompt),
    angle: prompt.trim(),
    clipIds,
    moments,
    opener,
    cta: null,
    evidence: { clips: clipIds.length, usableSec: Math.round(usableSec * 10) / 10, distinctMoments: moments.length, hasOpener: Boolean(opener), hasSpeech: carded.some((c) => c.card!.speech.present) },
    strength: usableSec >= 15 && moments.length >= 3 ? "strong" : "possible",
  };
}

/** The next index for a prompt build in a project: -1, then -2, and so on. */
export const nextPromptIdx = (existing: number[]): number => Math.min(0, ...existing.filter((i) => i < 0)) - 1;
