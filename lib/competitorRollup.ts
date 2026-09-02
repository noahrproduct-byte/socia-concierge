// Leaderboard rows and niche benchmarks, assembled from every real source.
//
// The rule this file exists to enforce: a cell either carries a value with a
// known provenance, or it carries a reason it is absent. There is no third
// option. The four absences are distinct and must not be collapsed:
//
//   unavailable        the platform does not publish this metric at all
//   connection_needed  obtainable, but a connection the user hasn't made
//   insufficient       real source, too small a sample to state honestly
//   unknown            not fetched for this row yet
//
// Niche medians are computed from the accounts SOCIA actually holds data for,
// and always travel with their sample size. A median of three accounts is
// reported as a median of three accounts, never as "the niche".

export type CellState = "ok" | "unavailable" | "connection_needed" | "insufficient" | "unknown";

export type Cell = {
  value: number | null;
  state: CellState;
  /** Where the number came from, shown to the user on demand. */
  source?: "live_api" | "public_api" | "socia_snapshot" | "calculated";
  /** How many observations back a calculated value. */
  sample?: number | null;
};

export const cell = (
  value: number | null,
  source: Cell["source"] = "calculated",
  sample: number | null = null,
): Cell => (value == null ? { value: null, state: "unknown" } : { value, state: "ok", source, sample });

export const absent = (state: Exclude<CellState, "ok">): Cell => ({ value: null, state });

export const CELL_REASON: Record<Exclude<CellState, "ok">, string> = {
  unavailable: "Not available from platform",
  connection_needed: "Connection required",
  insufficient: "Not enough data",
  unknown: "—",
};

export const SOURCE_LABEL: Record<NonNullable<Cell["source"]>, string> = {
  live_api: "Live API",
  public_api: "Public data",
  socia_snapshot: "SOCIA snapshot",
  calculated: "Calculated",
};

export type LeaderRow = {
  id: string;
  platform: "instagram" | "youtube" | "facebook";
  handle: string;
  name: string;
  avatar: string | null;
  url: string | null;
  isYou: boolean;
  tracked: boolean;
  classification: string | null;
  /** Audience: followers on IG/FB, subscribers on YouTube. Labelled per row. */
  audience: Cell;
  engagement: Cell;
  cadence: Cell;
  medianViews: Cell;
  /** Only ever set from two real observations, never inferred. */
  momentum: Cell;
};

const med = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Median across rows that actually carry the metric, with its sample size.
 *  The user's own row is excluded — a benchmark you are inside of is not a
 *  benchmark to measure yourself against. */
export function nicheMedian(rows: LeaderRow[], pick: (r: LeaderRow) => Cell): Cell {
  const xs = rows
    .filter((r) => !r.isYou)
    .map((r) => pick(r))
    .filter((c) => c.state === "ok" && c.value != null)
    .map((c) => c.value!);
  // Two accounts is not a niche. Say so rather than publishing a fragile number.
  if (xs.length < 3) return absent("insufficient");
  return cell(med(xs), "calculated", xs.length);
}

/** Where the user sits among the accounts SOCIA can actually measure. */
export function rankOf(rows: LeaderRow[], pick: (r: LeaderRow) => Cell): { rank: number; of: number } | null {
  const measurable = rows.filter((r) => pick(r).state === "ok" && pick(r).value != null);
  if (measurable.length < 2) return null;
  const you = measurable.find((r) => r.isYou);
  if (!you) return null;
  const sorted = [...measurable].sort((a, b) => (pick(b).value ?? 0) - (pick(a).value ?? 0));
  return { rank: sorted.findIndex((r) => r.isYou) + 1, of: sorted.length };
}

/** Percentage difference against a benchmark, only when both are real. */
export function diffVs(you: Cell, bench: Cell): { pct: number; better: boolean } | null {
  if (you.state !== "ok" || bench.state !== "ok") return null;
  if (you.value == null || bench.value == null || bench.value === 0) return null;
  const pct = ((you.value - bench.value) / bench.value) * 100;
  return { pct, better: pct >= 0 };
}

export type PositionRow = {
  label: string;
  you: Cell;
  bench: Cell;
  diff: { pct: number; better: boolean } | null;
  /** Higher is better for most metrics; noted so the colour is correct. */
  higherIsBetter: boolean;
};

export function buildPositionRows(
  rows: LeaderRow[],
  you: LeaderRow | undefined,
): { wins: PositionRow[]; gaps: PositionRow[] } {
  if (!you) return { wins: [], gaps: [] };
  const defs: { label: string; pick: (r: LeaderRow) => Cell; higherIsBetter: boolean }[] = [
    { label: "Engagement rate", pick: (r) => r.engagement, higherIsBetter: true },
    { label: "Posting frequency", pick: (r) => r.cadence, higherIsBetter: true },
    { label: "Median views", pick: (r) => r.medianViews, higherIsBetter: true },
    { label: "Audience", pick: (r) => r.audience, higherIsBetter: true },
  ];

  const wins: PositionRow[] = [];
  const gaps: PositionRow[] = [];
  for (const d of defs) {
    const bench = nicheMedian(rows, d.pick);
    const yourCell = d.pick(you);
    const diff = diffVs(yourCell, bench);
    const row: PositionRow = { label: d.label, you: yourCell, bench, diff, higherIsBetter: d.higherIsBetter };
    // A row with no comparison belongs in neither column — it is not a win
    // and not a gap, it is simply unmeasured.
    if (!diff) continue;
    (diff.better === d.higherIsBetter ? wins : gaps).push(row);
  }
  return { wins, gaps };
}
