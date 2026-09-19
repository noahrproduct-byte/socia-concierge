// When the account's own posts perform best: weekday × 3-hour blocks, scored
// by the MEDIAN relative performance of the posts in each bucket so one viral
// post cannot pick the time by itself. Sample sizes travel with every claim.
//
// Runs in the browser so hours land in the viewer's own time zone (the server
// is UTC). Pure, no I/O.

import { median } from "./metrics";

export type TimedPost = { id: string; t: string; e: number; format: string };

export const BLOCK_STARTS = [0, 3, 6, 9, 12, 15, 18, 21];
export const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DOW_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const hl = (h: number) => (h === 0 || h === 24 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
export const blockLabel = (b: number) => `${hl(BLOCK_STARTS[b])} to ${hl((BLOCK_STARTS[b] + 3) % 24)}`;
export const blockShort = (b: number) => hl(BLOCK_STARTS[b]).replace(" ", "");

/** Minimum dated posts before SOCIA names any time at all. */
export const MIN_POSTS = 8;
/** Posts in a bucket for "high confidence"; below SIGNAL_N nothing is ranked. */
export const RELIABLE_N = 4;
export const SIGNAL_N = 2;

export type Cell = { day: number; block: number; n: number; median: number | null; rel: number | null; postIds: string[] };
export type Rollup = { index: number; n: number; median: number | null; rel: number | null };
export type Window = { day: number; block: number; n: number; rel: number; confidence: "high" | "early"; label: string; postIds: string[] };
export type Windows = {
  enough: boolean;
  posts: number;
  /** Median engagement across all dated posts: the "typical post". */
  baseline: number | null;
  cells: Cell[][];
  byDay: Rollup[];
  byBlock: Rollup[];
  best: Window[];
  maxRel: number;
};

export function buildWindows(posts: TimedPost[]): Windows {
  const dated = posts.filter((p) => !isNaN(new Date(p.t).getTime()));
  const baseline = median(dated.map((p) => p.e));
  const rel = (xs: number[]): { median: number | null; rel: number | null } => {
    const m = median(xs);
    return { median: m, rel: m != null && baseline != null && baseline > 0 ? m / baseline : null };
  };
  const cellPosts: TimedPost[][][] = Array.from({ length: 7 }, () => Array.from({ length: 8 }, () => []));
  for (const p of dated) {
    const d = new Date(p.t);
    cellPosts[(d.getDay() + 6) % 7][Math.floor(d.getHours() / 3)].push(p);
  }
  const cells: Cell[][] = cellPosts.map((row, day) => row.map((ps, block) => ({ day, block, n: ps.length, ...rel(ps.map((p) => p.e)), postIds: ps.map((p) => p.id) })));
  const byDay: Rollup[] = cellPosts.map((row, day) => { const ps = row.flat(); return { index: day, n: ps.length, ...rel(ps.map((p) => p.e)) }; });
  const byBlock: Rollup[] = BLOCK_STARTS.map((_, block) => { const ps = cellPosts.map((row) => row[block]).flat(); return { index: block, n: ps.length, ...rel(ps.map((p) => p.e)) }; });
  const enough = dated.length >= MIN_POSTS && baseline != null && baseline > 0;
  const best: Window[] = enough
    ? cells.flat()
        .filter((c) => c.n >= SIGNAL_N && c.rel != null && c.rel >= 1.1)
        .sort((a, b) => (b.rel! - 1) * Math.min(b.n, RELIABLE_N) - (a.rel! - 1) * Math.min(a.n, RELIABLE_N))
        .slice(0, 3)
        .map((c) => ({ day: c.day, block: c.block, n: c.n, rel: c.rel!, confidence: c.n >= RELIABLE_N ? "high" : "early", label: `${DOW_LONG[c.day]} · ${blockLabel(c.block)}`, postIds: c.postIds }))
    : [];
  const maxRel = Math.max(0, ...cells.flat().map((c) => (c.n >= SIGNAL_N && c.rel != null ? c.rel : 0)));
  return { enough, posts: dated.length, baseline, cells, byDay, byBlock, best, maxRel };
}

export const relText = (rel: number) => `${rel >= 1 ? "+" : "−"}${Math.abs(Math.round((rel - 1) * 100))}% vs typical`;

/** How many of the last `n` posts landed in one of the best windows. */
export function inBestWindows(posts: TimedPost[], w: Windows, n = 10): { inWindow: number; total: number } {
  const recent = [...posts].sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime()).slice(0, n);
  const keys = new Set(w.best.map((b) => `${b.day}-${b.block}`));
  const inWindow = recent.filter((p) => { const d = new Date(p.t); return keys.has(`${(d.getDay() + 6) % 7}-${Math.floor(d.getHours() / 3)}`); }).length;
  return { inWindow, total: recent.length };
}
