// The Content Rater as an improvement workspace (Noah, 2026-11-05): what the
// analysis adds beyond scores so a person can act on it. A one-line diagnosis,
// each fix with a priority, a time range and the evidence behind it, a
// comparison with competitors' Reels that took off, small-sample signals kept
// as experiments, and three creative directions to test.
//
// The model writes the words; everything here bounds them. A link or a number
// about another account is never the model's: it cites a post by its id and
// the server attaches that post's own data. Nothing predicts views. Pure and
// browser-safe.

export type FixPriority = "critical" | "high" | "medium" | "experiment";
export const PRIORITY_LABEL: Record<FixPriority, string> = { critical: "Critical", high: "High priority", medium: "Medium priority", experiment: "Experiment" };
const PRIORITY_RANK: Record<FixPriority, number> = { critical: 0, high: 1, medium: 2, experiment: 3 };
const isPriority = (v: unknown): v is FixPriority => v === "critical" || v === "high" || v === "medium" || v === "experiment";

export type Confidence = "low" | "moderate" | "high";
export const CONFIDENCE_LABEL: Record<Confidence, string> = { low: "Low", moderate: "Moderate", high: "High" };
const isConfidence = (v: unknown): v is Confidence => v === "low" || v === "moderate" || v === "high";

/** Why SOCIA recommends a fix: what it saw, what the account's and the niche's posts show, and how sure that is. */
export type FixEvidence = {
  /** Which of the account's own posts support it; "" when none do. */
  account: string;
  /** Which competitor or niche posts support it; "" when none do. */
  niche: string;
  confidence: Confidence;
  /** One sentence on what the confidence rests on, and what else could explain it. */
  confidenceWhy: string;
};

export type FixExtras = {
  priority: FixPriority;
  /** Where the problem ends, in seconds; null when it is one moment or has no time. */
  end: number | null;
  /** The creative problem the change addresses, in one sentence. Never a predicted number. */
  why: string;
  evidence: FixEvidence | null;
  /** How to make the change, in order, each step naming where it happens and what goes there. */
  steps: string[];
  /** How the line or shot should move on screen, with timings; "" when nothing moves. */
  motion: string;
  /** The part of the score this fix lifts, and the editor's estimate of that part once it is made. Never views. */
  part: string | null;
  scoreAfter: number | null;
  /** A complete prompt for an AI tool, when an AI tool could make this change; "" otherwise. */
  aiPrompt: string;
};

/** The most one fix may be estimated to lift a part of the score: a bigger claim isn't credible from one edit. */
export const MAX_GAIN = 30;
const KIND_PART: Record<string, string> = { opening: "hook", hook_text: "hook", ending: "cta", pacing: "pacing", text: "captions", audio: "audio", visual: "visual", caption: "goal" };

const text = (v: unknown, n: number): string => (typeof v === "string" ? v.replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim().slice(0, n) : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * A fix's priority, range and evidence, bounded. The first fix is at least
 * high priority unless the model called it an experiment; an unknown priority
 * follows its rank (first high, the rest medium).
 */
export function cleanFixExtras(raw: unknown, index: number, t: number | null, durationSec: number, scores: Record<string, number | null> = {}): FixExtras {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const priority: FixPriority = isPriority(r.priority) ? r.priority : index === 0 ? "high" : "medium";
  const endRaw = num(r.end);
  const end = t != null && endRaw != null && endRaw > t + 0.2 ? Math.min(endRaw, Math.max(0, durationSec)) : null;
  const e = (r.evidence && typeof r.evidence === "object" ? r.evidence : null) as Record<string, unknown> | null;
  const evidence: FixEvidence | null = e
    ? { account: text(e.account, 300), niche: text(e.niche, 300), confidence: isConfidence(e.confidence) ? e.confidence : "low", confidenceWhy: text(e.confidenceWhy, 300) }
    : null;
  // The part must be one the analysis scored; the estimate must lift it, by no more than one edit plausibly can.
  const named = typeof r.part === "string" && r.part in scores ? r.part : KIND_PART[r.kind as string] ?? null;
  const part = named && scores[named] != null ? named : null;
  const after = num(r.scoreAfter);
  const now = part ? (scores[part] as number) : null;
  const scoreAfter = now != null && after != null && after > now ? Math.min(100, now + MAX_GAIN, Math.round(after)) : null;
  return {
    priority, end: end != null && end > (t ?? 0) ? end : null, why: text(r.why, 240), evidence,
    steps: (Array.isArray(r.steps) ? r.steps : []).map((x) => text(x, 220)).filter(Boolean).slice(0, 5),
    motion: text(r.motion, 260), part: scoreAfter != null ? part : null, scoreAfter, aiPrompt: text(r.aiPrompt, 1200),
  };
}

/**
 * Creative readiness if every fix were made: each part's largest estimated
 * gain, averaged over the parts that were scored, added to the overall score.
 * Null when no fix carries an estimate. An estimate of the editor's score, never views.
 */
export function scoreAfterEdits(a: { score: { overall: number }; categories: { id: string; score: number | null }[]; topFixes: { part?: string | null; scoreAfter?: number | null }[] }): number | null {
  const scored = a.categories.filter((c) => c.score != null);
  if (!scored.length) return null;
  const gain = new Map<string, number>();
  for (const f of a.topFixes) {
    const now = scored.find((c) => c.id === f.part)?.score;
    if (now == null || f.scoreAfter == null) continue;
    gain.set(f.part as string, Math.max(gain.get(f.part as string) ?? 0, f.scoreAfter - now));
  }
  if (!gain.size) return null;
  const total = [...gain.values()].reduce((x, y) => x + y, 0);
  return Math.min(100, Math.round(a.score.overall + total / scored.length));
}

/** Fixes in the order to work on them: by priority, keeping the model's order inside one priority. */
export function byPriority<T extends { priority?: FixPriority }>(fixes: T[]): T[] {
  return fixes.map((f, i) => ({ f, i })).sort((a, b) => PRIORITY_RANK[a.f.priority ?? "medium"] - PRIORITY_RANK[b.f.priority ?? "medium"] || a.i - b.i).map((x) => x.f);
}

/** A cut the editor may really make: inside the video, start before end, at least MIN_CUT_SEC long. */
export const MIN_CUT_SEC = 0.3;
export function validCuts<C extends { start: number; end: number }>(edits: unknown, durationSec: number): C[] {
  return (Array.isArray(edits) ? edits : []).flatMap((c): C[] => {
    if (!c || typeof c !== "object") return [];
    const start = num((c as C).start), end = num((c as C).end);
    if (start == null || end == null) return [];
    const s = Math.max(0, start), e = Math.min(durationSec, end);
    return e - s >= MIN_CUT_SEC ? [{ ...(c as C), start: s, end: e }] : [];
  });
}

/** A time for a range label: tenths of a second under ten seconds, so a short cut never reads "0:00 to 0:00". */
export function fmtSpan(start: number, end: number): string {
  const one = (s: number) => (end < 10 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
  return `${one(start)} to ${one(end)}`;
}

// ---------------------------------------------------------------- post refs ----

/** A real post a comparison rests on: one of the account's own top posts, or a competitor's Reel SOCIA read. */
export type PostRef = {
  /** W1.. for the account's own posts, R1.. for competitors' Reels: the id the model cites. */
  id: string;
  title: string;
  url: string | null;
  thumb: string | null;
  /** Who posted it; null for the account's own posts. */
  account: string | null;
  /** Its published result in words ("5,012 views, 2.4x their usual"); only numbers SOCIA read. */
  result: string;
};

/** The ids a row cites, limited to posts that were actually shown to the model. */
export function citedIds(raw: unknown, posts: PostRef[]): string[] {
  const known = new Set(posts.map((p) => p.id));
  return [...new Set((Array.isArray(raw) ? raw : []).filter((v): v is string => typeof v === "string").map((v) => v.trim().toUpperCase()).filter((v) => known.has(v)))].slice(0, 4);
}

export type RefRow = { label: string; current: string; theirs: string; verdict: "better" | "similar" | "worse" | "unknown"; refs: string[] };
export type CompetitorCompare = {
  basis: string;
  rows: RefRow[];
  /** What the competitors' Reels do that this draft could adopt, hedged. */
  takeaways: string[];
  summary: string;
  posts: PostRef[];
};

const VERDICTS = new Set(["better", "similar", "worse", "unknown"]);

/** The comparison with competitors' Reels, or null when none were on file or the model returned no rows. */
export function cleanCompetitors(raw: unknown, posts: PostRef[], basis: string): CompetitorCompare | null {
  if (!posts.length || !raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const rows = (Array.isArray(r.rows) ? r.rows : []).flatMap((x): RefRow[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const label = text(o.label, 60), current = text(o.current, 160), theirs = text(o.theirs, 160);
    if (!label || (!current && !theirs)) return [];
    return [{ label, current, theirs, verdict: VERDICTS.has(o.verdict as string) ? (o.verdict as RefRow["verdict"]) : "unknown", refs: citedIds(o.refs, posts) }];
  }).slice(0, 6);
  if (!rows.length) return null;
  return {
    basis, rows, posts,
    takeaways: (Array.isArray(r.takeaways) ? r.takeaways : []).map((t) => text(t, 220)).filter(Boolean).slice(0, 4),
    summary: text(r.summary, 500),
  };
}

// --------------------------------------------------------------- experiments ----

/** A signal too thin to act on as fact (a few posts, other differences between them): something to test. */
export type Experiment = { title: string; hypothesis: string; basis: string; how: string };

export function cleanExperiments(raw: unknown): Experiment[] {
  return (Array.isArray(raw) ? raw : []).flatMap((x): Experiment[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const title = text(o.title, 90), how = text(o.how, 300);
    if (!title || !how) return [];
    return [{ title, hypothesis: text(o.hypothesis, 240), basis: text(o.basis, 300), how }];
  }).slice(0, 3);
}

// ---------------------------------------------------------------- directions ----

export type DirectionBeat = { at: string; shot: string; say: string };
/** One way to remake the video: an alternative to test, with its tradeoff. Never a promise of results. */
export type Direction = {
  name: string;
  approach: string;
  /** The opening line, ready to use. */
  opening: string;
  storyboard: DirectionBeat[];
  lengthSec: number | null;
  bestFor: string;
  tradeoff: string;
  /** What in the draft, the account's posts or the niche supports trying it. */
  evidence: string;
  /** The one SOCIA would test first. */
  testFirst: boolean;
};

export function cleanDirections(raw: unknown): Direction[] {
  const out = (Array.isArray(raw) ? raw : []).flatMap((x): Direction[] => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const name = text(o.name, 40), opening = text(o.opening, 120);
    if (!name || !opening) return [];
    const storyboard = (Array.isArray(o.storyboard) ? o.storyboard : []).flatMap((b): DirectionBeat[] => {
      if (!b || typeof b !== "object") return [];
      const v = b as Record<string, unknown>;
      const shot = text(v.shot, 200);
      return shot ? [{ at: text(v.at, 16), shot, say: text(v.say, 200) }] : [];
    }).slice(0, 6);
    const len = num(o.lengthSec);
    return [{
      name, opening, storyboard, approach: text(o.approach, 240), lengthSec: len != null && len >= 3 && len <= 180 ? Math.round(len) : null,
      bestFor: text(o.bestFor, 160), tradeoff: text(o.tradeoff, 200), evidence: text(o.evidence, 300), testFirst: o.testFirst === true,
    }];
  }).slice(0, 3);
  // Exactly one to test first: the first the model marked, else the first listed.
  const first = Math.max(0, out.findIndex((d) => d.testFirst));
  return out.map((d, i) => ({ ...d, testFirst: i === first }));
}

/** A direction as text, to copy or hand to the editor as a brief. */
export function directionText(d: Direction): string {
  return [
    `${d.name}${d.lengthSec ? ` (about ${d.lengthSec} seconds)` : ""}`,
    d.approach,
    `Opening: ${d.opening}`,
    ...d.storyboard.map((b) => `${b.at ? `${b.at}: ` : ""}${b.shot}${b.say ? ` Say: "${b.say}"` : ""}`),
    d.bestFor ? `Best for: ${d.bestFor}` : "",
    d.tradeoff ? `Tradeoff: ${d.tradeoff}` : "",
  ].filter(Boolean).join("\n");
}
