// A ranking: a video's top moments counted down in one clip, the way ranking
// Reels do it. A title that stays on screen, a numbered list, and each name
// appearing as its moment plays, so the viewer stays to see number one. Pure,
// shared by the picker, the server and the browser render.

import type { ClipPick } from "./pick";
import { viewBox } from "./reframe";

/** Seconds one moment in a ranking may run. Short, because several share one clip. */
export const RANKING_MOMENT_SEC = { min: 5, max: 30 };
export const RANKING_SIZE = { min: 3, max: 5 };
/** A trailer is short lines from across the video. */
export const TRAILER_MOMENT_SEC = { min: 2, max: 12 };
export const TRAILER_SIZE = { min: 4, max: 8 };
/** Below this it is one clip, not a ranking. */
export const MIN_RANKED = 2;

/** One entry. `rank` 1 is the best. */
export type RankedMoment = { rank: number; label: string; startMs: number; endMs: number; reason: string };
/** What is being ranked and its moments in playing order: last place first, number one at the end. */
export type Ranking = { title: string; items: RankedMoment[]; kind?: "trailer" };
/** The on-screen list, each `at` in seconds into the finished clip. */
export type RankingOverlay = { title: string; items: { rank: number; label: string; at: number }[] };

/** Picks arrive best first (checkPicks sorts by score); a ranking plays them the other way round. */
export function rankingOf(title: string, picks: ClipPick[]): Ranking {
  const items = picks.map((p, i) => ({ rank: i + 1, label: p.title, startMs: p.startMs, endMs: p.endMs, reason: p.reason }));
  return { title: title || "Ranking the best moments", items: items.reverse() };
}

/** A trailer plays in story order: `rank` is just its place in the line-up, and there is no list on screen. */
export function trailerOf(title: string, picks: ClipPick[]): Ranking {
  return { title: title || "The best of this video", kind: "trailer", items: picks.map((p, i) => ({ rank: i + 1, label: p.title, startMs: p.startMs, endMs: p.endMs, reason: p.reason })) };
}

/** A ranking from the database, or null when it isn't one. */
export function readRanking(v: unknown): Ranking | null {
  if (!v || typeof v !== "object") return null;
  const r = v as { title?: unknown; items?: unknown };
  if (typeof r.title !== "string" || !Array.isArray(r.items)) return null;
  const items = r.items.filter((i): i is RankedMoment =>
    !!i && Number.isFinite(i.rank) && typeof i.label === "string" && Number.isFinite(i.startMs) && Number.isFinite(i.endMs) && i.endMs > i.startMs)
    .map((i) => ({ ...i, reason: typeof i.reason === "string" ? i.reason : "" }));
  return items.length >= MIN_RANKED ? { title: r.title, items, ...((v as { kind?: unknown }).kind === "trailer" ? { kind: "trailer" as const } : {}) } : null;
}

/** The panel above the picture, in 1080-wide pixels: the title, then one row per moment. */
export const RANKING_LAYOUT = { titleTop: 150, listTop: 320, row: 62, gap: 30 };

/** Where the picture sits: under the panel and down to the bottom of the frame, so the list never covers a face. */
export const rankingBand = (moments: number, outH: number) => {
  const top = RANKING_LAYOUT.listTop + moments * RANKING_LAYOUT.row + RANKING_LAYOUT.gap;
  return { top, height: outH - top };
};

/** The video's box in the frame: filling the band, centred on what the shots chose. */
export function rankingBox(srcW: number, srcH: number, outW: number, outH: number, moments: number, c: number) {
  const band = rankingBand(moments, outH);
  const b = viewBox(srcW, srcH, outW, band.height, { c, y: 0.5, s: 1 });
  const pct = (n: number) => `${Math.round(n * 100) / 100}%`;
  return { ...b, top: pct(((band.top + (parseFloat(b.top) / 100) * band.height) / outH) * 100), height: pct((parseFloat(b.height) * band.height) / outH) };
}

export const rankingMs = (r: Ranking) => r.items.reduce((sum, i) => sum + i.endMs - i.startMs, 0);

/** When each name appears: as its moment starts in the joined clip. */
export function rankingOverlay(r: Ranking): RankingOverlay {
  let at = 0;
  const items = r.items.map((i) => {
    const row = { rank: i.rank, label: i.label, at };
    at += (i.endMs - i.startMs) / 1000;
    return row;
  });
  return { title: r.title, items };
}
