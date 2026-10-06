// Content Yield: deciding which of the model's proposed posts are backed by
// enough distinct, usable footage to be shown. The model proposes groups of
// clips and moments; everything below is arithmetic over those proposals and
// the per-clip cards, so a "post" is never just a number the model said.
import type { ClipCard, MomentRef, Opportunity, RejectedIdea, YieldResult } from "./types";

export type ClipForYield = { id: string; position: number; durationSec: number; card: ClipCard | null };

/** What pass 2 hands over, before validation. */
export type ProposedGroup = {
  title: string;
  angle: string;
  clipIds: string[];
  moments: MomentRef[];
  opener: (MomentRef & { why: string }) | null;
  cta: string | null;
};

export const YIELD_RULES = {
  /** a post needs at least this much non-weak footage */
  minUsableSec: 8,
  /** and at least this many separate moments */
  minMoments: 2,
  /** "strong" needs this much footage … */
  strongUsableSec: 15,
  /** … this many moments, and an opener */
  strongMoments: 3,
  /** shorter moments are noise */
  minMomentSec: 0.8,
  maxOpportunities: 8,
} as const;

type Range = { start: number; end: number };

/** Sort and merge overlapping or near-adjacent ranges (gap under 0.25 s). */
export function mergeRanges(ranges: Range[]): Range[] {
  const s = ranges.filter((r) => r.end > r.start).sort((a, b) => a.start - b.start);
  const out: Range[] = [];
  for (const r of s) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end + 0.25) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

const overlap = (a: Range, b: Range): number => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

/** A referenced range counts as usable unless the clip card rates everything it touches weak. */
function usable(ref: Range, card: ClipCard | null): boolean {
  if (!card || !card.moments.length) return true;
  const touched = card.moments.filter((m) => overlap(ref, m) > 0);
  if (!touched.length) return true;
  return touched.some((m) => m.strength !== "weak");
}

function clampRef(ref: MomentRef, clip: ClipForYield): Range | null {
  const start = Math.max(0, Math.min(ref.start, clip.durationSec));
  const end = Math.max(0, Math.min(ref.end, clip.durationSec));
  return end - start >= YIELD_RULES.minMomentSec ? { start, end } : null;
}

const sec = (n: number) => `${Math.round(n)}s`;

export function validateYield(groups: ProposedGroup[], clips: ClipForYield[], now: Date = new Date()): Omit<YieldResult, "model" | "summary"> {
  const byId = new Map(clips.map((c) => [c.id, c]));
  const taken = new Map<string, string>(); // clipId → title of the opportunity that holds it
  const accepted: Opportunity[] = [];
  const rejected: RejectedIdea[] = [];

  for (const g of groups) {
    const title = g.title.trim() || "Untitled idea";
    const known = Array.from(new Set(g.clipIds)).filter((id) => byId.has(id));
    if (!known.length) { rejected.push({ title, reason: "None of its clips could be found in this project." }); continue; }

    // One clip belongs to one post: earlier (stronger) opportunities keep it.
    const free = known.filter((id) => !taken.has(id));
    if (!free.length) {
      const holder = taken.get(known[0])!;
      rejected.push({ title, reason: `Its footage is already used by “${holder}”.` });
      continue;
    }
    const lostTo = known.filter((id) => taken.has(id)).map((id) => taken.get(id)!);

    // Moments inside the remaining clips, clamped, merged, weak ones excluded.
    const perClip = new Map<string, Range[]>();
    for (const ref of g.moments) {
      if (!free.includes(ref.clipId)) continue;
      const clip = byId.get(ref.clipId)!;
      const r = clampRef(ref, clip);
      if (!r || !usable(r, clip.card)) continue;
      perClip.set(ref.clipId, [...(perClip.get(ref.clipId) ?? []), r]);
    }
    const merged: MomentRef[] = [];
    for (const [clipId, ranges] of perClip) for (const r of mergeRanges(ranges)) merged.push({ clipId, start: Number(r.start.toFixed(2)), end: Number(r.end.toFixed(2)) });
    const usableSec = merged.reduce((a, m) => a + (m.end - m.start), 0);
    const distinctMoments = merged.length;

    if (accepted.length >= YIELD_RULES.maxOpportunities) { rejected.push({ title, reason: "Enough posts already; this one would repeat footage." }); continue; }
    if (usableSec < YIELD_RULES.minUsableSec) {
      const shared = lostTo.length ? ` after “${lostTo[0]}” took its shared clips` : "";
      rejected.push({ title, reason: `Only ${sec(usableSec)} of usable footage${shared} (a post needs at least ${YIELD_RULES.minUsableSec}s).` });
      continue;
    }
    if (distinctMoments < YIELD_RULES.minMoments) { rejected.push({ title, reason: "One moment only — not enough variety for a post." }); continue; }

    // Opener: a real range in one of this post's clips, backed by the clip's card.
    let opener: Opportunity["opener"] = null;
    if (g.opener && free.includes(g.opener.clipId)) {
      const clip = byId.get(g.opener.clipId)!;
      const r = clampRef(g.opener, clip);
      const card = clip.card;
      const backed = !card || card.openerCandidate || Boolean(card.speech.hookLine) || card.moments.some((m) => m.strength === "strong" && overlap(r ?? { start: -1, end: -1 }, m) > 0);
      if (r && backed) opener = { clipId: g.opener.clipId, start: Number(r.start.toFixed(2)), end: Number(r.end.toFixed(2)), why: g.opener.why || "" };
    }
    const clipsUsed = Array.from(new Set(merged.map((m) => m.clipId)));
    const hasSpeech = clipsUsed.some((id) => byId.get(id)?.card?.speech.present);
    const strength: Opportunity["strength"] = usableSec >= YIELD_RULES.strongUsableSec && distinctMoments >= YIELD_RULES.strongMoments && opener != null ? "strong" : "possible";

    for (const id of clipsUsed) taken.set(id, title);
    accepted.push({
      idx: 0,
      title,
      angle: g.angle.trim(),
      clipIds: clipsUsed.sort((a, b) => (byId.get(a)!.position - byId.get(b)!.position)),
      moments: merged,
      opener,
      cta: g.cta?.trim() || null,
      evidence: { clips: clipsUsed.length, usableSec: Math.round(usableSec), distinctMoments, hasOpener: opener != null, hasSpeech },
      strength,
    });
  }

  // Strong first, then in the model's order; indices are assigned after sorting.
  const ordered = [...accepted.filter((o) => o.strength === "strong"), ...accepted.filter((o) => o.strength === "possible")].map((o, i) => ({ ...o, idx: i }));
  return {
    opportunities: ordered,
    rejected,
    clipsAnalyzed: clips.filter((c) => c.card).length,
    footageSec: Math.round(clips.reduce((a, c) => a + (c.durationSec || 0), 0)),
    createdAt: now.toISOString(),
  };
}

/** "5 clips · 24 sec usable footage · strong opening · 3 distinct moments" */
export function evidenceLine(o: Opportunity): string {
  const e = o.evidence;
  const parts = [`${e.clips} clip${e.clips === 1 ? "" : "s"}`, `${e.usableSec} sec usable footage`];
  if (e.hasOpener) parts.push("strong opening");
  parts.push(`${e.distinctMoments} distinct moment${e.distinctMoments === 1 ? "" : "s"}`);
  if (e.hasSpeech) parts.push("speech");
  return parts.join(" · ");
}

/** "You uploaded 14 clips. SOCIA found 4 strong posts you can make." */
export function yieldHeadline(y: Pick<YieldResult, "opportunities" | "clipsAnalyzed">): string {
  const strong = y.opportunities.filter((o) => o.strength === "strong").length;
  const possible = y.opportunities.length - strong;
  const clips = `You uploaded ${y.clipsAnalyzed} clip${y.clipsAnalyzed === 1 ? "" : "s"}.`;
  if (!y.opportunities.length) return `${clips} SOCIA didn't find enough distinct footage for a post yet.`;
  const s = strong ? `${strong} strong post${strong === 1 ? "" : "s"}` : "";
  const p = possible ? `${possible} possible post${possible === 1 ? "" : "s"}` : "";
  return `${clips} SOCIA found ${[s, p].filter(Boolean).join(" and ")} you can make.`;
}
