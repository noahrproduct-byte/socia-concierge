// Which competitor should the user study? Not the biggest — the one most
// like them that is measurably doing better.
//
// Two inputs, both real: SOCIA's relevance score (niche, locality, comparable
// audience, verified metrics) and a metric-by-metric comparison on values
// both accounts actually publish. An account only qualifies if it beats the
// user on at least one comparable metric; the tie-break among qualifiers is
// similarity first, then how many metrics it leads on.
//
// "Why they're winning" is deterministic. Every sentence carries the two
// numbers it was derived from. Nothing here is guessed or generated.

import type { Cell, LeaderRow } from "@/lib/competitorRollup";

export type MetricKey = "audience" | "engagement" | "cadence" | "medianViews";

const METRICS: { key: MetricKey; label: string; pick: (r: LeaderRow) => Cell }[] = [
  { key: "engagement", label: "Engagement rate", pick: (r) => r.engagement },
  { key: "cadence", label: "Posts / week", pick: (r) => r.cadence },
  { key: "medianViews", label: "Median views", pick: (r) => r.medianViews },
  { key: "audience", label: "Audience", pick: (r) => r.audience },
];

const ok = (c: Cell): c is Cell & { value: number } => c.state === "ok" && c.value != null;

export type Comparison = {
  key: MetricKey;
  label: string;
  you: Cell;
  them: Cell;
  /** Percent difference (them vs you). Null when either side is absent. */
  diffPct: number | null;
  /** Their audience metric is named differently per platform. */
  unit: "count" | "pct" | "perWeek";
};

export function compareRows(you: LeaderRow, them: LeaderRow): Comparison[] {
  return METRICS.map(({ key, label, pick }) => {
    const a = pick(you);
    const b = pick(them);
    const diffPct =
      ok(a) && ok(b) && a.value !== 0 ? ((b.value - a.value) / a.value) * 100 : null;
    return {
      key, label, you: a, them: b, diffPct,
      unit: key === "engagement" ? "pct" : key === "cadence" ? "perWeek" : "count",
    };
  });
}

/** Number of comparable metrics on which `them` beats `you`. */
export function leadsOn(you: LeaderRow, them: LeaderRow): number {
  return compareRows(you, them).filter((c) => c.diffPct != null && c.diffPct > 0).length;
}

/** Ordering heuristic, 0-100, used only to decide which qualifier to study
 *  first. A discovered account carries SOCIA's real relevance score; a
 *  hand-tracked account has none, so its place in the order falls back to
 *  classification and audience proximity. That fallback is never shown as a
 *  number: the UI displays LeaderRow.match (real) or no match at all. */
export function similarity(you: LeaderRow, them: LeaderRow): number {
  if (them.match != null) return them.match;
  let s =
    them.classification === "direct_competitor" ? 60
    : them.classification === "local_competitor" ? 65
    : them.classification === "adjacent_competitor" ? 40
    : them.classification === "content_inspiration" ? 35
    : them.classification === "emerging_creator" ? 45
    : them.classification === "niche_leader" ? 30
    : 30;
  if (ok(you.audience) && ok(them.audience) && you.audience.value > 0) {
    const ratio = them.audience.value / you.audience.value;
    if (ratio >= 0.5 && ratio <= 3) s += 20;
    else if (ratio >= 0.25 && ratio <= 6) s += 10;
  }
  if (them.platform === you.platform) s += 5;
  return Math.max(0, Math.min(100, s));
}

export type SimilarPick = {
  row: LeaderRow;
  /** Ordering heuristic (see similarity()); not for display. */
  similarity: number;
  leads: number;
  comparisons: Comparison[];
};

/** The most similar account that is measurably outperforming the user.
 *  Null when nothing qualifies — that is a real answer, shown as such. */
export function pickMostSimilar(rows: LeaderRow[]): SimilarPick | null {
  const you = rows.find((r) => r.isYou);
  if (!you) return null;
  const qualified = rows
    .filter((r) => !r.isYou)
    .map((r) => ({ row: r, similarity: similarity(you, r), leads: leadsOn(you, r) }))
    .filter((x) => x.leads >= 1)
    .sort((a, b) => b.similarity - a.similarity || b.leads - a.leads);
  const best = qualified[0];
  return best ? { ...best, comparisons: compareRows(you, best.row) } : null;
}

export type Observation = {
  title: string;
  detail: string;
  /** Which comparison produced it, so the UI can link the two. */
  key: MetricKey | "theme";
};

const fmtN = (n: number): string =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M"
  : n >= 1e4 ? Math.round(n / 1e3) + "K"
  : n.toLocaleString("en-US");

const fmtBy = (c: Comparison, v: number) =>
  c.unit === "pct" ? `${v.toFixed(1)}%` : c.unit === "perWeek" ? `${v.toFixed(1)}/week` : fmtN(v);

/** Plain-language observations, each derived from one comparison the user can
 *  see. Themes come only from posts actually discovered for that account. */
export function doingWell(
  pick: SimilarPick,
  themeTags: { tag: string; count: number }[] = [],
): Observation[] {
  const out: Observation[] = [];
  for (const c of pick.comparisons) {
    if (c.diffPct == null || c.diffPct <= 0 || !ok(c.you) || !ok(c.them)) continue;
    const yours = fmtBy(c, c.you.value);
    const theirs = fmtBy(c, c.them.value);
    switch (c.key) {
      case "cadence":
        out.push({ key: c.key, title: "Posting more consistently", detail: `They publish ${theirs} compared with your ${yours}.` });
        break;
      case "engagement":
        out.push({ key: c.key, title: "Earning more engagement per follower", detail: `${theirs} engagement rate against your ${yours}.` });
        break;
      case "medianViews":
        out.push({ key: c.key, title: "Their typical post reaches further", detail: `${theirs} median views on recent posts versus your ${yours}.` });
        break;
      case "audience":
        out.push({ key: c.key, title: "Larger audience", detail: `${theirs} against your ${yours}.` });
        break;
    }
  }
  const themes = themeTags.filter((t) => t.count >= 2).slice(0, 3);
  if (themes.length) {
    out.push({
      key: "theme",
      title: "Recurring themes in their strongest posts",
      detail: themes.map((t) => `${t.tag} (${t.count})`).join(" · ") + ", counted across the posts SOCIA found.",
    });
  }
  return out;
}
