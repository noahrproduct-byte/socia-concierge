// The Content Rater's performance outlook (Noah's Virality Index brief,
// 2026-11-05): what a draft can expect, worked out from the account's own
// Reels and never written by a model.
//
// Three layers, each shown only when the data supports it:
//   1. The baseline. The median views of the account's last Reels that have
//      been out SETTLE_DAYS, with the middle half as the usual range, and
//      whether the most recent ones run above or below the ones before.
//   2. Patterns. What the draft's caption shares with those Reels (how it
//      opens, its subject, its length) and how the Reels with and without
//      that did. A pattern in a handful of posts, never a cause.
//   3. The virality score and predicted views (Noah, 2026-11-08: "It should
//      judge by the video"). Two numbers. Virality potential is the rater's read
//      of this video alone (videoStrength), so a great video scores as great on
//      a small account. Predicted views place that video within the account's
//      own range, with the history (baseline x momentum x caption patterns)
//      setting the scale. How strength maps to views is an assumption until
//      rated videos have results, so those views are always low confidence.
//
// What this can't see: SOCIA stores each Reel's latest numbers, not how they
// grew, so a Reel counts only once it has settled; Instagram gives no video
// length; and the video's own picture and sound are not predictors yet,
// because past Reels were not rated. Pure and browser-safe.

import { detectTrendTags, tagGroup } from "./discovery";
import { hookLine, hookStructures } from "./trendSignals";

/** Days a Reel must be out before its views count: the same three days SOCIA treats a post as settled everywhere else (lib/postResults.ts). */
export const SETTLE_DAYS = 3;
/** The baseline is the most recent settled Reels, up to this many. */
export const BASELINE_MAX = 30;
/** Fewer settled Reels than this and no baseline is stated. */
export const BASELINE_MIN = 5;
/** Recent momentum: the last RECENT_N against the ones before, which must number at least BASELINE_MIN. */
export const RECENT_N = 8;
/** Reels a pattern needs on each side (with it, without it). */
export const PATTERN_MIN = 3;
/** Replayed forecasts the model needs before it can be judged at all. */
export const BACKTEST_MIN = 12;
/** The model's typical error must be at most this share of the plain median's. */
export const BEAT_BY = 0.95;
/** And it must be the closer of the two on enough Reels that chance alone would do it less than this often. */
export const CHANCE_MAX = 0.05;
/** The range is built to hold 8 in 10; replayed, it must hold at least this share. */
export const COVERAGE_MIN = 0.7;
/** A pattern's pull is shrunk toward nothing while few Reels carry it. */
const SHRINK = 5;
const DAY = 86_400_000;

export type OutlookReel = { at: string; views: number; traits: string[] };

// ------------------------------------------------------------------- traits ----

/** The longest caption Instagram shows before "more". */
export const SHORT_CAPTION = 125;

/**
 * What can be read off a caption before the post goes out, and so compared
 * with past Reels: how its first line opens, its subjects, and whether it
 * fits above the fold. An empty caption has no traits.
 */
export function traitsOf(caption: string | null | undefined): string[] {
  const text = (caption ?? "").trim();
  if (!text) return [];
  const line = hookLine(text);
  const opens = line ? hookStructures(line).map((s) => `open:${s}`) : [];
  const themes = detectTrendTags(text).filter((t) => tagGroup(t) === "theme").map((t) => `theme:${t}`);
  const body = text.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, " ").replace(/\s+/g, " ").trim();
  return [...new Set([...opens, ...themes, body.length <= SHORT_CAPTION ? "caption:short" : "caption:long"])];
}

/** A trait as a phrase that completes "Reels where the ...". */
export function traitLabel(key: string): string {
  if (key === "caption:short") return `caption fits in ${SHORT_CAPTION} characters`;
  if (key === "caption:long") return `caption runs past ${SHORT_CAPTION} characters`;
  const [kind, name = ""] = key.split(/:(.*)/);
  if (kind === "open") return name === "Question" ? "caption opens with a question" : `caption's opening reads as "${name}"`;
  return `caption's subject is "${name}"`;
}

// -------------------------------------------------------------------- maths ----

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);

/** The q-th quantile, interpolated between neighbours. */
export function quantile(xs: number[], q: number): number {
  const a = sorted(xs);
  if (!a.length) return NaN;
  const pos = (a.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}
const median = (xs: number[]) => quantile(xs, 0.5);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** A count for a range or an estimate: two significant figures, so it never reads more exact than it is. */
export function roundViews(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}
export const fmtViews = (n: number): string => Math.round(n).toLocaleString("en-US");

function ranks(xs: number[]): number[] {
  const order = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1].v === order[i].v) j++;
    for (let k = i; k <= j; k++) out[order[k].i] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return out;
}

/** Rank agreement between two lists, -1 to 1; null when either list has no spread. */
export function rankAgreement(a: number[], b: number[]): number | null {
  if (a.length < 3 || a.length !== b.length) return null;
  const ra = ranks(a), rb = ranks(b);
  const ma = ra.reduce((s, x) => s + x, 0) / ra.length, mb = rb.reduce((s, x) => s + x, 0) / rb.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : null;
}

// ----------------------------------------------------------------- the data ----

type MediaLike = {
  media_type?: string; media_product_type?: string; timestamp?: string; caption?: string;
  collab_owner?: string; insights?: { views?: number };
};

/**
 * The account's own Reels that can be compared: a view count Instagram
 * reported, a date, and not a collab post another account published (its
 * numbers are that post's totals, not this account's usual). Oldest first.
 * `pending` counts the ones still inside their first SETTLE_DAYS.
 */
export function reelsFrom(media: MediaLike[], now: Date): { reels: OutlookReel[]; pending: number } {
  const reels: OutlookReel[] = [];
  let pending = 0;
  for (const m of media) {
    if (!(m.media_product_type === "REELS" || m.media_type === "VIDEO") || m.collab_owner) continue;
    const views = m.insights?.views;
    const at = m.timestamp ? Date.parse(m.timestamp) : NaN;
    if (typeof views !== "number" || !(views > 0) || Number.isNaN(at)) continue;
    if (now.getTime() - at < SETTLE_DAYS * DAY) { pending++; continue; }
    reels.push({ at: new Date(at).toISOString(), views, traits: traitsOf(m.caption) });
  }
  return { reels: reels.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)), pending };
}

// ---------------------------------------------------------------- the model ----

export type Baseline = { n: number; median: number; low: number; high: number; from: string; to: string };
export type Momentum = { recentN: number; recentMedian: number; earlierN: number; earlierMedian: number; ratio: number; word: "above" | "below" | "level" };
export type Pattern = { key: string; label: string; withN: number; withMedian: number; withoutN: number; withoutMedian: number; ratio: number };
export type Backtest = {
  n: number;
  /** Typical miss as a factor (1.6 = off by 1.6x either way), for the model and for the plain median. */
  modelError: number; medianError: number;
  /** Reels where the model was closer than the plain median, of the ones where they differed. */
  closer: number; differed: number;
  /** Share of replayed Reels whose views fell inside the range built without them. */
  coverage: number;
  rank: number | null;
  passes: boolean;
  why: string;
};
export type AccountModel = {
  /** none: no Reels with view counts. thin: fewer than BASELINE_MIN settled. ready: a baseline exists. */
  state: "none" | "thin" | "ready";
  reels: OutlookReel[];
  pending: number;
  baseline: Baseline | null;
  momentum: Momentum | null;
  patterns: Pattern[];
  backtest: Backtest | null;
};

const views = (rs: OutlookReel[]) => rs.map((r) => r.views);

/**
 * The model's estimate for a Reel with these traits, from the Reels before
 * it: their median, pulled half-way toward where the most recent ones run,
 * then by each trait enough of them carry (shrunk while few do). The whole
 * adjustment is capped at half to double, so no pattern in a handful of posts
 * can promise a multiple.
 */
export function estimate(history: OutlookReel[], traits: string[]): number | null {
  const base = history.slice(-BASELINE_MAX);
  if (base.length < BASELINE_MIN) return null;
  const med = median(views(base));
  let log = 0;
  if (base.length - RECENT_N >= BASELINE_MIN) log += 0.5 * Math.log(median(views(base.slice(-RECENT_N))) / med);
  for (const t of new Set(traits)) {
    const w = base.filter((r) => r.traits.includes(t));
    if (w.length < PATTERN_MIN || base.length - w.length < PATTERN_MIN) continue;
    log += (w.length / (w.length + SHRINK)) * Math.log(median(views(w)) / med);
  }
  return med * Math.exp(clamp(log, -Math.LN2, Math.LN2));
}

type Replay = { actual: number; model: number; plain: number };

/** Each Reel forecast from only the Reels that had already settled when it went out. */
function replay(reels: OutlookReel[]): Replay[] {
  const out: Replay[] = [];
  for (const r of reels) {
    const cutoff = Date.parse(r.at) - SETTLE_DAYS * DAY;
    const history = reels.filter((h) => Date.parse(h.at) <= cutoff);
    const model = estimate(history, r.traits);
    if (model == null) continue;
    out.push({ actual: r.views, model, plain: median(views(history.slice(-BASELINE_MAX))) });
  }
  return out;
}

const residuals = (rs: Replay[]) => rs.map((r) => Math.log(r.actual / r.model));

/** The chance of at least k heads in n fair coin flips. */
export function chanceOfAtLeast(k: number, n: number): number {
  let c = 1, sum = 0;
  for (let i = 0; i <= n; i++) { if (i >= k) sum += c; c = (c * (n - i)) / (i + 1); }
  return sum / 2 ** n;
}
const x1 = (n: number) => n.toFixed(1);

export function backtest(reels: OutlookReel[]): Backtest | null {
  const rs = replay(reels);
  if (!rs.length) return null;
  const modelError = Math.exp(median(rs.map((r) => Math.abs(Math.log(r.actual / r.model)))));
  const medianError = Math.exp(median(rs.map((r) => Math.abs(Math.log(r.actual / r.plain)))));
  const miss = rs.map((r) => [Math.abs(Math.log(r.actual / r.model)), Math.abs(Math.log(r.actual / r.plain))]).filter(([a, b]) => Math.abs(a - b) > 1e-9);
  const closer = miss.filter(([a, b]) => a < b).length, differed = miss.length;
  const res = residuals(rs);
  const held = res.filter((r, i) => {
    const others = res.filter((_, j) => j !== i);
    return others.length >= 4 && r >= quantile(others, 0.1) && r <= quantile(others, 0.9);
  }).length;
  const coverage = held / rs.length;
  const rank = rankAgreement(rs.map((r) => r.model), rs.map((r) => r.actual));
  const enough = rs.length >= BACKTEST_MIN;
  const beats = Math.log(modelError) <= Math.log(medianError) * BEAT_BY && differed > 0 && chanceOfAtLeast(closer, differed) <= CHANCE_MAX;
  const holds = coverage >= COVERAGE_MIN;
  const orders = (rank ?? 0) > 0;
  const passes = enough && beats && holds && orders;
  const why = !enough
    ? `Only ${rs.length} of your Reels could be replayed; the check needs ${BACKTEST_MIN}.`
    : !beats
      ? `Replayed over ${rs.length} of your Reels, the model was typically off by ${x1(modelError)}x and your plain median by ${x1(medianError)}x, and it was the closer of the two on ${closer} of ${differed}. It has to beat the median by more than chance would.`
      : !holds
        ? `Replayed over ${rs.length} of your Reels, its range held ${Math.round(coverage * 100)}% of the time; it has to hold at least ${Math.round(COVERAGE_MIN * 100)}%.`
        : !orders
          ? `Replayed over ${rs.length} of your Reels, it did not rank the stronger ones above the weaker ones.`
          : `Replayed over ${rs.length} of your Reels, each forecast from only the Reels before it: the model was typically off by ${x1(modelError)}x, your plain median by ${x1(medianError)}x, it was the closer of the two on ${closer} of ${differed}, and the range held ${Math.round(coverage * 100)}% of the time.`;
  return { n: rs.length, modelError, medianError, closer, differed, coverage, rank, passes, why };
}

export function buildModel(reels: OutlookReel[], pending: number): AccountModel {
  if (!reels.length) return { state: "none", reels, pending, baseline: null, momentum: null, patterns: [], backtest: null };
  if (reels.length < BASELINE_MIN) return { state: "thin", reels, pending, baseline: null, momentum: null, patterns: [], backtest: null };
  const base = reels.slice(-BASELINE_MAX);
  const v = views(base);
  const baseline: Baseline = { n: base.length, median: median(v), low: quantile(v, 0.25), high: quantile(v, 0.75), from: base[0].at, to: base[base.length - 1].at };

  let momentum: Momentum | null = null;
  const earlier = base.slice(0, -RECENT_N);
  if (earlier.length >= BASELINE_MIN) {
    const recentMedian = median(views(base.slice(-RECENT_N))), earlierMedian = median(views(earlier));
    const ratio = recentMedian / earlierMedian;
    momentum = { recentN: RECENT_N, recentMedian, earlierN: earlier.length, earlierMedian, ratio, word: ratio >= 1.25 ? "above" : ratio <= 0.8 ? "below" : "level" };
  }

  const patterns = [...new Set(base.flatMap((r) => r.traits))].flatMap((key): Pattern[] => {
    const w = base.filter((r) => r.traits.includes(key)), wo = base.filter((r) => !r.traits.includes(key));
    if (w.length < PATTERN_MIN || wo.length < PATTERN_MIN) return [];
    const withMedian = median(views(w)), withoutMedian = median(views(wo));
    return [{ key, label: traitLabel(key), withN: w.length, withMedian, withoutN: wo.length, withoutMedian, ratio: withMedian / withoutMedian }];
  });

  return { state: "ready", reels, pending, baseline, momentum, patterns, backtest: backtest(reels) };
}

// ---------------------------------------------------------------- the draft ----

/** How much each part of the rater's score counts toward reach. An ask or a brand fit doesn't make a video travel, so those don't count. */
export const REACH_WEIGHTS: Record<string, number> = { hook: 0.3, structure: 0.15, pacing: 0.15, clarity: 0.15, visual: 0.15, captions: 0.05, audio: 0.05 };
type Part = { id: string; score: number | null };

/** The rater's read of this video as one number, 0 to 100, from the parts it could score. Null when too little could be scored. */
export function videoStrength(parts: Part[]): number | null {
  let sum = 0, weight = 0;
  for (const p of parts) {
    const w = REACH_WEIGHTS[p.id];
    if (w && p.score != null) { sum += w * p.score; weight += w; }
  }
  return weight >= 0.5 ? sum / weight : null;
}

/** The same read with each fix made: every part at the best score a fix is estimated to reach. */
export function strengthAfter(parts: Part[], fixes: { part?: string | null; scoreAfter?: number | null }[]): number | null {
  return videoStrength(parts.map((p) => {
    const best = Math.max(p.score ?? 0, ...fixes.filter((f) => f.part === p.id && f.scoreAfter != null).map((f) => f.scoreAfter as number));
    return p.score == null ? p : { ...p, score: best };
  }));
}

/** How much of the estimate comes from the video rather than the account's history. */
export const VIDEO_SHARE = 0.7;
/** The rater's middle for an ordinary draft: a video this strong should land at the account's median. */
const ORDINARY = 60;
/** Each point of strength moves a video this far through the account's own range of views. */
const PER_POINT = 0.015;
/** From this strength the range reaches at least the account's best Reel. */
export const STRONG_VIDEO = 75;

export type Forecast = {
  /** With a video: its potential on its own, with no account history in it. Without one: where the estimate sits among the baseline Reels. Not a probability. */
  index: number;
  estimate: number;
  low: number;
  high: number;
  /** The replay passed and no untested video assumption is in the number. False: show it as low confidence. */
  checked: boolean;
  /** This forecast read the video, not only the account's history. */
  video: boolean;
};
export type Outlook = {
  /** Patterns in the account's Reels that this draft's caption shares, strongest difference first. */
  shared: Pattern[];
  /** Null only without a baseline: below BASELINE_MIN Reels there is nothing to calculate from. */
  forecast: Forecast | null;
};

/** Replayed misses a range needs before it is built from them; fewer, and the spread of the Reels themselves stands in. */
const RANGE_MIN_REPLAYS = 5;

export function outlookFor(model: AccountModel, caption: string | null | undefined, strength: number | null = null): Outlook {
  const traits = traitsOf(caption);
  const shared = model.patterns.filter((p) => traits.includes(p.key)).sort((a, b) => Math.abs(Math.log(b.ratio)) - Math.abs(Math.log(a.ratio))).slice(0, 3);
  if (!model.baseline) return { shared, forecast: null };
  const est = estimate(model.reels, traits);
  if (est == null) return { shared, forecast: null };
  const base = views(model.reels.slice(-BASELINE_MAX));
  const res = residuals(replay(model.reels));
  // Where this video should land in the account's own range, weighed with what the history expects.
  const place = strength == null ? null : clamp(0.5 + (strength - ORDINARY) * PER_POINT, 0.05, 0.95);
  const center = place == null ? est : Math.exp(VIDEO_SHARE * Math.log(quantile(base, place)) + (1 - VIDEO_SHARE) * Math.log(est));
  // Too few replays to measure the miss: use how far the account's own Reels spread, around where this video lands.
  const mid = quantile(base, 0.5);
  const fewLow = strength == null ? quantile(base, 0.1) : center * (quantile(base, 0.25) / mid);
  const fewHigh = strength == null ? quantile(base, 0.9) : center * (quantile(base, 0.75) / mid);
  const low = res.length >= RANGE_MIN_REPLAYS ? center * Math.exp(quantile(res, 0.1)) : fewLow;
  let high = res.length >= RANGE_MIN_REPLAYS ? center * Math.exp(quantile(res, 0.9)) : fewHigh;
  if (strength != null && strength >= STRONG_VIDEO) high = Math.max(high, ...base);
  const history = (base.filter((x) => x < est).length / base.length) * 100;
  return {
    shared,
    forecast: {
      index: Math.round(strength == null ? history : clamp(strength, 0, 100)),
      estimate: roundViews(center),
      low: roundViews(Math.min(low, center)),
      high: roundViews(Math.max(high, center)),
      checked: strength == null && model.backtest?.passes === true,
      video: strength != null,
    },
  };
}

/** One pattern as a sentence, with both samples in it. */
export function patternLine(p: Pattern): string {
  const s = (n: number) => (n === 1 ? "" : "s");
  return `Your ${p.withN} Reel${s(p.withN)} where the ${p.label} have a median of ${fmtViews(p.withMedian)} views, against ${fmtViews(p.withoutMedian)} for the other ${p.withoutN}.`;
}

// ------------------------------------------------------------ kept with a post ----

/** What SOCIA said before a rated video was posted, kept so its result can be read against it. */
export type OutlookRecord = {
  /** usual: the account's usual range at the time. forecast: the model's range for this draft. */
  kind: "usual" | "forecast";
  n: number;
  median: number;
  low: number;
  high: number;
  index: number | null;
};

export function recordOf(model: AccountModel | null, o: Outlook | null): OutlookRecord | null {
  const b = model?.baseline;
  if (!b) return null;
  const f = o?.forecast ?? null;
  return f
    ? { kind: "forecast", n: b.n, median: Math.round(b.median), low: f.low, high: f.high, index: f.index }
    : { kind: "usual", n: b.n, median: Math.round(b.median), low: roundViews(b.low), high: roundViews(b.high), index: null };
}

export function sanitizeRecord(v: unknown): OutlookRecord | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.round(x) : null);
  const count = n(o.n), med = n(o.median), low = n(o.low), high = n(o.high), index = n(o.index);
  if (count == null || med == null || low == null || high == null || high < low || count < BASELINE_MIN) return null;
  const kind = o.kind === "forecast" && index != null ? "forecast" : "usual";
  return { kind, n: count, median: med, low, high, index: kind === "forecast" ? Math.min(100, index!) : null };
}

/** How a post's views read against what was said before it went out. */
export function recordCheck(r: OutlookRecord, viewsNow: number, early: boolean): string {
  const range = `${fmtViews(r.low)} to ${fmtViews(r.high)} views`;
  const said = r.kind === "forecast" ? `SOCIA's range for it was ${range}.` : `Your usual range then was ${range}.`;
  const where = viewsNow < r.low ? "below the range" : viewsNow > r.high ? "above the range" : "inside the range";
  return `${said} It has ${fmtViews(viewsNow)}${early ? " so far" : ""}: ${where}${early ? ", and the number is still moving" : ""}.`;
}
