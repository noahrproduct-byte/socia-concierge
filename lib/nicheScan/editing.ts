// How a Reel is edited, measured from its video: where the picture changes
// (a cut), so how long shots last, how fast it cuts and when the first cut
// comes. Read with ffmpeg's scene detection on the video file Instagram's
// Business Discovery gives for a Reel (the same file the scan reads frames
// from, lib/nicheScan/frames.ts), over the first MEASURE_SEC seconds only.
// Joins (a dissolve or a whip) aren't told apart from cuts, and a fast camera
// move can read as a cut: the pattern library says so in its limitations.
// Anything that fails gives null, never a guess. Server only.
import { execFile } from "node:child_process";
import { ffmpeg, readableVideo } from "./frames";

export type ReelEditing = {
  /** The whole video's length, seconds, from the file; null when the file didn't say. */
  durationSec: number | null;
  /** How much of it was measured, seconds. */
  measuredSec: number;
  /** Where the picture changed, seconds from the start (within measuredSec). */
  cuts: number[];
  cutsPer10s: number;
  /** The median length of the shots in the measured window, seconds. */
  medianShotSec: number;
  /** When the first cut comes; null when none in the window (one continuous take). */
  firstCutSec: number | null;
};

/** How much of a Reel is measured: enough for the hook and the rhythm, light enough for a scan. */
export const MEASURE_SEC = 30;
/** How different two frames must be to count as a cut (ffmpeg's scene score, 0 to 1). */
const SCENE_THRESHOLD = 0.32;
/** Two changes this close are one cut (a flash, a whip blur). */
const MIN_GAP_SEC = 0.25;
const MEASURE_TIMEOUT_MS = 25_000;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** What ffmpeg printed, read: the cut times (showinfo's pts_time) and the file's duration. Pure. */
export function readSceneLog(log: string, measured: number): { cuts: number[]; durationSec: number | null } {
  const d = log.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const durationSec = d ? r2(Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3])) : null;
  const times = Array.from(log.matchAll(/pts_time:\s*([\d.]+)/g)).map((m) => Number(m[1])).filter((t) => Number.isFinite(t) && t > 0.15 && t < measured - 0.05);
  const cuts: number[] = [];
  for (const t of times.sort((a, b) => a - b)) if (!cuts.length || t - cuts[cuts.length - 1] >= MIN_GAP_SEC) cuts.push(r2(t));
  return { cuts, durationSec };
}

/** The numbers from the cut times. Pure. */
export function editingFrom(cuts: number[], durationSec: number | null, window = MEASURE_SEC): ReelEditing {
  const measuredSec = r2(Math.min(window, durationSec ?? window));
  const inside = cuts.filter((t) => t < measuredSec);
  const edges = [0, ...inside, measuredSec];
  const shots = edges.slice(1).map((t, i) => t - edges[i]).filter((s) => s > 0).sort((a, b) => a - b);
  const median = shots.length ? (shots.length % 2 ? shots[(shots.length - 1) / 2] : (shots[shots.length / 2 - 1] + shots[shots.length / 2]) / 2) : measuredSec;
  return {
    durationSec, measuredSec, cuts: inside,
    cutsPer10s: measuredSec > 0 ? r2((inside.length / measuredSec) * 10) : 0,
    medianShotSec: r2(median),
    firstCutSec: inside[0] ?? null,
  };
}

/** One Reel's editing, or null when its video can't be read. */
export async function measureEditing(video: string | null | undefined): Promise<ReelEditing | null> {
  const url = readableVideo(video);
  if (!url) return null;
  const bin = await ffmpeg();
  if (!bin) return null;
  const log = await new Promise<string | null>((resolve) => {
    execFile(
      bin,
      ["-hide_banner", "-t", String(MEASURE_SEC), "-i", url.toString(), "-an", "-vf", `scale=160:-2,select='gt(scene\\,${SCENE_THRESHOLD})',showinfo`, "-f", "null", "-"],
      { timeout: MEASURE_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      // ffmpeg writes everything to stderr; it exits 0 when the file was read.
      (err, _stdout, stderr) => resolve(err ? null : String(stderr ?? "")),
    );
  });
  if (log == null || !/Duration:/.test(log)) return null;
  const { cuts, durationSec } = readSceneLog(log, MEASURE_SEC);
  return editingFrom(cuts, durationSec);
}
