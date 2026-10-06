// Alert detectors: pure functions from real numbers to verified events.
//
// Each detector takes data the account actually produced and returns candidate
// alerts, or none. There is no model here and nothing is invented: a breakout
// is a post measured above its own format's median; a performance change is a
// metric measured against the previous equal period. The caller stores them
// (lib/alerts.ts); the fingerprint keeps re-runs from duplicating.

export type AlertType = "breakout" | "performance_change" | "competitor_move" | "trend" | "opportunity" | "plan_result" | "plan_ready";
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

// ---------------------------------------------------------------------------
// Phase-2 detectors: competitor movement, niche trends, format opportunity.
// Each still reads only real, already-stored numbers and invents nothing; when
// the data doesn't clear the bar it returns none rather than a soft signal.
// ---------------------------------------------------------------------------

export type CompetitorSeries = {
  handle: string;
  /** Daily follower/subscriber snapshots for this competitor, any order. */
  points: { day: string; followers: number | null }[];
};

/**
 * A tracked competitor whose follower count moved at least `minPct`% between the
 * oldest and newest snapshot in the set. Needs two dated points and a base of at
 * least `floor` followers so a tiny account's noise doesn't fire. Fingerprint is
 * per competitor per ISO week, so one sustained move reminds at most once a week.
 */
export function detectCompetitorMoves(input: {
  platform: string;
  competitors: CompetitorSeries[];
  weekKey: string;
  minPct?: number;
  floor?: number;
}): AlertCandidate[] {
  const { platform, competitors, weekKey } = input;
  const minPct = input.minPct ?? 8;
  const floor = input.floor ?? 200;
  const out: AlertCandidate[] = [];
  for (const c of competitors) {
    const pts = c.points
      .filter((p): p is { day: string; followers: number } => p.followers != null && Boolean(p.day))
      .sort((a, b) => a.day.localeCompare(b.day));
    if (pts.length < 2) continue;
    const first = pts[0], last = pts[pts.length - 1];
    if (first.day === last.day) continue;
    if (first.followers < floor) continue;
    const delta = last.followers - first.followers;
    const pct = (delta / first.followers) * 100;
    if (Math.abs(pct) < minPct) continue;
    const up = delta >= 0;
    const h = c.handle.replace(/^@/, "");
    out.push({
      type: "competitor_move",
      platform,
      fingerprint: `competitor_move:${platform}:${h.toLowerCase()}:${weekKey}`,
      severity: "info",
      title: `@${h} ${up ? "gained" : "lost"} ${fmt(Math.abs(delta))} followers (${up ? "+" : "−"}${Math.abs(Math.round(pct))}%)`,
      body: `From ${fmt(first.followers)} to ${fmt(last.followers)} between ${first.day} and ${last.day}. ${up ? "Worth a look at what they're posting." : "Their audience is shrinking."}`,
      evidence: { handle: h, from: first.followers, to: last.followers, pct: Math.round(pct), fromDay: first.day, toDay: last.day },
      entityRef: h,
    });
  }
  return out;
}

/**
 * A niche trend tag carried by at least `minItems` recently-discovered posts that
 * each beat their creator's median by `minMultiple`×. Only content within
 * `windowDays` counts, so a trend has to be current. Fingerprint is per tag per
 * ISO week. Returns the strongest few (by count) so the inbox isn't flooded.
 */
export function detectNicheTrends(input: {
  items: { trendTags: string[]; multiplier: number | null; whenMs: number }[];
  now: number;
  weekKey: string;
  windowDays?: number;
  minItems?: number;
  minMultiple?: number;
  maxAlerts?: number;
}): AlertCandidate[] {
  const { items, now, weekKey } = input;
  const windowDays = input.windowDays ?? 21;
  const minItems = input.minItems ?? 3;
  const minMultiple = input.minMultiple ?? 2;
  const maxAlerts = input.maxAlerts ?? 3;
  const cutoff = now - windowDays * 86400000;

  const byTag = new Map<string, number[]>(); // tag -> multipliers of winning posts
  for (const it of items) {
    if (!(it.whenMs >= cutoff)) continue;
    if (it.multiplier == null || it.multiplier < minMultiple) continue;
    for (const raw of it.trendTags ?? []) {
      const tag = String(raw ?? "").trim();
      if (!tag) continue;
      byTag.set(tag.toLowerCase(), [...(byTag.get(tag.toLowerCase()) ?? []), it.multiplier]);
    }
  }
  const ranked = [...byTag.entries()]
    .filter(([, mults]) => mults.length >= minItems)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, maxAlerts);

  return ranked.map(([tag, mults]) => {
    const med = median(mults) ?? minMultiple;
    return {
      type: "trend" as const,
      platform: "niche",
      fingerprint: `trend:${tag}:${weekKey}`,
      severity: "good" as const,
      title: `"${tag}" is winning in your niche right now`,
      body: `${mults.length} recent posts tagged "${tag}" are averaging ${fmtMult(med)} their creators' median. A format worth trying this week.`,
      evidence: { tag, count: mults.length, medianMultiple: Math.round(med * 10) / 10, windowDays },
      entityRef: null,
    };
  });
}

/** Coarse content bucket, so IG's Reel/Carousel and the niche's short/video map together. */
export function formatBucket(raw: string): "video" | "image" | null {
  const s = (raw || "").toLowerCase();
  if (/reel|short|video|clip|tiktok/.test(s)) return "video";
  if (/image|carousel|photo|post|graphic/.test(s)) return "image";
  return null;
}

/**
 * A format the niche's winners lean on that the person barely posts. Fires only
 * when both samples are large enough (`minUserPosts`, `minNicheWinners`), the
 * winning format is a clear majority (`nicheShareMin`) and the person's share of
 * it is low (`userShareMax`) — a stark, honest gap, not a nudge. Once per format
 * per ISO week.
 */
export function detectFormatGap(input: {
  userFormats: string[];
  nicheWinnerFormats: string[];
  weekKey: string;
  minUserPosts?: number;
  minNicheWinners?: number;
  nicheShareMin?: number;
  userShareMax?: number;
}): AlertCandidate | null {
  const minUserPosts = input.minUserPosts ?? 6;
  const minNicheWinners = input.minNicheWinners ?? 4;
  const nicheShareMin = input.nicheShareMin ?? 0.6;
  const userShareMax = input.userShareMax ?? 0.2;

  const userBuckets = input.userFormats.map(formatBucket).filter((b): b is "video" | "image" => b != null);
  const nicheBuckets = input.nicheWinnerFormats.map(formatBucket).filter((b): b is "video" | "image" => b != null);
  if (userBuckets.length < minUserPosts || nicheBuckets.length < minNicheWinners) return null;

  const share = (arr: ("video" | "image")[], b: "video" | "image") => arr.filter((x) => x === b).length / arr.length;
  for (const bucket of ["video", "image"] as const) {
    const nicheShare = share(nicheBuckets, bucket);
    const userShare = share(userBuckets, bucket);
    if (nicheShare >= nicheShareMin && userShare <= userShareMax) {
      const label = bucket === "video" ? "short-form video" : "image & carousel";
      return {
        type: "opportunity",
        platform: "niche",
        fingerprint: `opportunity:format:${bucket}:${input.weekKey}`,
        severity: "info",
        title: `Your niche is winning with ${label} — you're barely posting it`,
        body: `${Math.round(nicheShare * 100)}% of the winning posts in your niche are ${label}, but only ${Math.round(userShare * 100)}% of your recent posts are.`,
        evidence: { bucket, nicheSharePct: Math.round(nicheShare * 100), userSharePct: Math.round(userShare * 100), userPosts: userBuckets.length, nicheWinners: nicheBuckets.length },
        entityRef: null,
      };
    }
  }
  return null;
}

// ------------------------------------------------------------ plan results --

export type PlanResultItem = {
  planId: string;
  index: number;
  day: string;
  concept: string;
  format: string;
  platform: string;
  /** The settled result (lib/postResults): multiplier against the account's own median. */
  multiplier: number | null;
  measured: boolean;
  early: boolean;
  short: string;
  text: string;
  permalink: string | null;
};

/**
 * One alert per planned post whose result has settled: the plan said what to
 * post, the person posted it, the platform reported how it did. Early results
 * (inside the settling window) and unreported posts produce nothing yet; the
 * fingerprint is the plan item, so each gets exactly one alert ever.
 */
export function detectPlanResults(items: PlanResultItem[]): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const it of items) {
    if (!it.measured || it.early) continue;
    const m = it.multiplier;
    const severity: AlertSeverity = m == null ? "info" : m >= 1.2 ? "good" : m < 0.8 ? "warning" : "info";
    const verdict = m == null ? `is in: ${it.short}` : m >= 1.2 ? `did ${fmtMult(m)} your median` : m < 0.8 ? `did ${fmtMult(m)} your median` : "landed about on your median";
    out.push({
      type: "plan_result",
      platform: it.platform,
      fingerprint: `plan_result:${it.planId}:${it.index}`,
      severity,
      title: `${it.day}'s planned ${it.format} ${verdict}`,
      body: `${it.text} Planned as: "${it.concept.slice(0, 90)}".`,
      evidence: { planId: it.planId, index: it.index, multiplier: m, platform: it.platform, concept: it.concept, format: it.format },
      entityRef: it.permalink ?? "/tool",
    });
  }
  return out;
}

/** "Your plan for this week is ready", once per generated plan. */
export function planReadyAlert(plan: { id: string; headline: string; posts: number; weekLabel: string }): AlertCandidate {
  return {
    type: "plan_ready",
    platform: "socia",
    fingerprint: `plan_ready:${plan.id}`,
    severity: "info",
    title: `Your plan for the week of ${plan.weekLabel} is ready`,
    body: `${plan.posts} posts, built from your results, goals and competitors. ${plan.headline}`.trim(),
    evidence: { planId: plan.id, posts: plan.posts },
    entityRef: "/tool",
  };
}
