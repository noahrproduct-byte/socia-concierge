// Alert detectors: pure functions from real numbers to verified events.
//
// Each detector takes data the account actually produced and returns candidate
// alerts, or none. There is no model here and nothing is invented: a breakout
// is a post measured above its own format's median; a performance change is a
// metric measured against the previous equal period. The caller stores them
// (lib/alerts.ts); the fingerprint keeps re-runs from duplicating.

export type AlertType = "breakout" | "performance_change";
export type AlertSeverity = "good" | "info" | "warning";

export type AlertCandidate = {
  type: AlertType;
  platform: string;
  /** Stable dedup key: same event, same string, forever. */
  fingerprint: string;
  severity: AlertSeverity;
  title: string;
  body: string;
  evidence: Record<string, unknown>;
  entityRef?: string | null;
};

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtMult = (x: number) => `${x >= 10 ? x.toFixed(0) : x.toFixed(1)}×`;
/** Median of a non-empty list; null when empty. */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type BreakoutPost = {
  id: string;
  /** Human format label, e.g. "Reel", "Carousel", "Video". */
  format: string;
  interactions: number;
  timestampMs: number;
  permalink?: string | null;
  caption?: string | null;
};

/**
 * A post whose interactions are at least `factor`× the median of OTHER posts in
 * the same format. The median is taken over a stable comparison set (posts of
 * that format, excluding the candidate) with at least `minPerFormat` of them, so
 * one lucky post cannot set its own bar. Only posts published within
 * `windowDays` are considered, so old posts do not alert on a later run; the
 * fingerprint (per post) means each post can alert at most once regardless.
 */
export function detectBreakouts(input: {
  platform: string;
  posts: BreakoutPost[];
  now: number;
  windowDays?: number;
  minPerFormat?: number;
  factor?: number;
}): AlertCandidate[] {
  const { platform, posts, now } = input;
  const windowDays = input.windowDays ?? 7;
  const minPerFormat = input.minPerFormat ?? 3;
  const factor = input.factor ?? 3;
  const cutoff = now - windowDays * 86400000;

  const byFormat = new Map<string, BreakoutPost[]>();
  for (const p of posts) byFormat.set(p.format, [...(byFormat.get(p.format) ?? []), p]);

  const out: AlertCandidate[] = [];
  for (const p of posts) {
    if (p.timestampMs < cutoff) continue;
    if (!(p.interactions > 0)) continue;
    const peers = (byFormat.get(p.format) ?? []).filter((q) => q.id !== p.id);
    if (peers.length < minPerFormat) continue; // not enough of this format to set a fair bar
    const med = median(peers.map((q) => q.interactions));
    if (med == null || med <= 0) continue;
    const mult = p.interactions / med;
    if (mult < factor) continue;
    out.push({
      type: "breakout",
      platform,
      fingerprint: `breakout:${platform}:${p.id}`,
      severity: "good",
      title: `Your ${p.format} is performing ${fmtMult(mult)} your recent ${p.format} median`,
      body: `${caption(p.caption)} earned ${fmt(p.interactions)} interactions against a ${p.format} median of ${fmt(med)}.`,
      evidence: { interactions: p.interactions, formatMedian: Math.round(med), multiplier: Math.round(mult * 10) / 10, format: p.format, sample: peers.length },
      entityRef: p.permalink ?? p.id,
    });
  }
  return out;
}

function caption(c: string | null | undefined): string {
  const t = (c ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "A post";
  return `"${t.slice(0, 40)}${t.length > 40 ? "…" : ""}"`;
}

/**
 * A metric that moved at least `minPct`% against the previous equal period.
 * Both periods must carry a real value and the previous one must be non-trivial
 * (>= `floor`) so a jump from near-zero does not fire. Fingerprint is per metric
 * per ISO week, so a sustained change reminds at most once a week.
 */
export function detectPerformanceChange(input: {
  platform: string;
  metric: string;
  metricLabel: string;
  current: number | null;
  previous: number | null;
  periodDays: number;
  weekKey: string;
  minPct?: number;
  floor?: number;
}): AlertCandidate | null {
  const { platform, metric, metricLabel, current, previous, periodDays, weekKey } = input;
  const minPct = input.minPct ?? 25;
  const floor = input.floor ?? 1;
  if (current == null || previous == null) return null;
  if (previous < floor) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < minPct) return null;
  const up = pct >= 0;
  return {
    type: "performance_change",
    platform,
    fingerprint: `perf:${platform}:${metric}:${weekKey}`,
    severity: up ? "good" : "warning",
    title: `${metricLabel} ${up ? "up" : "down"} ${Math.abs(Math.round(pct))}% vs the previous ${periodDays} days`,
    body: `${fmt(current)} in the last ${periodDays} days, against ${fmt(previous)} in the ${periodDays} days before.`,
    evidence: { metric, current: Math.round(current), previous: Math.round(previous), pct: Math.round(pct), periodDays },
    entityRef: null,
  };
}

/** ISO-week key like "2026-W40", for weekly de-duplication of performance changes. */
export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7; // Mon=0
  t.setUTCDate(t.getUTCDate() - day + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
