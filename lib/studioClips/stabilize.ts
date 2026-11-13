// Video stabilization, done on the server: the one step the browser export
// cannot do (ffmpeg.wasm ships without vidstab). Two passes of ffmpeg's
// vidstab (vidstabdetect, then vidstabtransform with a fixed zoom to hide the
// borders), written next to the clip's source as stable-<strength>.mp4 and
// recorded on the clip row. The preview and the export both play that copy,
// so they match. Progress is written to the row as ffmpeg reports time.
// Node only (child_process, fs); used by app/api/studio/clips/[id]/stabilize.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STUDIO_BUCKET, type StabilizeStrength } from "./types";
import { signUrls, storageClient } from "./storage";

type Supa = SupabaseClient;

export type StabRecord = { status: "working" | "done" | "failed"; path?: string; progress?: number; error?: string | null; at: string };
export type StabilizedMap = Partial<Record<StabilizeStrength, StabRecord>>;

/** vidstab settings per strength: how much shake to look for, how long the smoothing window is, and the zoom that hides the borders (percent). */
export const STAB_PARAMS: Record<StabilizeStrength, { shakiness: number; smoothing: number; zoom: number }> = {
  low: { shakiness: 4, smoothing: 10, zoom: 3 },
  medium: { shakiness: 6, smoothing: 20, zoom: 6 },
  high: { shakiness: 9, smoothing: 30, zoom: 10 },
};

/** A job left "working" longer than this is taken as dead and may be started again. */
export const STAB_STALE_MS = 12 * 60 * 1000;
/** The longest a clip may be to stabilize on the server (the route's budget is 300 s, two passes). */
export const STAB_MAX_SEC = 180;

export const stablePath = (folder: string, strength: StabilizeStrength): string => `${folder}stable-${strength}.mp4`;

let ffmpegPath: string | null | undefined;
async function ffmpegBin(): Promise<string | null> {
  if (ffmpegPath !== undefined) return ffmpegPath;
  try {
    const mod = (await import("ffmpeg-static")) as unknown as { default?: string | null } | string;
    ffmpegPath = (typeof mod === "string" ? mod : mod.default) ?? null;
  } catch {
    ffmpegPath = null;
  }
  return ffmpegPath;
}

/** `ffmpeg args`, with `time=` lines from stderr reported as a share of `durationSec`. */
function run(bin: string, args: string[], durationSec: number, onProgress?: (share: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = execFile(bin, ["-hide_banner", "-y", "-nostdin", ...args], { timeout: 280_000, maxBuffer: 8 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) reject(new Error((stderr || err.message).split("\n").filter(Boolean).slice(-3).join(" ").slice(0, 300)));
      else resolve();
    });
    let last = 0;
    child.stderr?.on("data", (chunk: Buffer | string) => {
      const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(chunk));
      if (!m || !durationSec) return;
      const t = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      const share = Math.min(1, t / durationSec);
      if (share - last >= 0.04) { last = share; onProgress?.(share); }
    });
  });
}

/** Whether this ffmpeg has vidstab (the static builds do); without it the single-pass deshake filter stands in. Checked once. */
let vidstab: Promise<boolean> | null = null;
function hasVidstab(bin: string): Promise<boolean> {
  return (vidstab ??= new Promise((resolve) => {
    execFile(bin, ["-hide_banner", "-filters"], { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => resolve(!err && /vidstabtransform/.test(String(out))));
  }));
}

/** The filter graph for one pass. Pure, so the choice of filters can be tested. */
export function stabilizeFilters(strength: StabilizeStrength, trf: string, withVidstab: boolean): { detect: string | null; transform: string } {
  const p = STAB_PARAMS[strength];
  if (withVidstab) {
    return {
      detect: `vidstabdetect=shakiness=${p.shakiness}:accuracy=15:result=${trf}`,
      transform: `vidstabtransform=input=${trf}:smoothing=${p.smoothing}:zoom=${p.zoom}:optzoom=0:crop=black:interpol=bicubic,unsharp=5:5:0.6:3:3:0.3`,
    };
  }
  // deshake: one pass, a search window that grows with the strength (a multiple of 16, as the filter requires); the same zoom hides the borders.
  const rx = Math.min(64, 16 * Math.max(1, Math.round(p.shakiness / 3))), ry = rx;
  return { detect: null, transform: `deshake=rx=${rx}:ry=${ry}:edge=mirror:blocksize=8:contrast=125,scale=iw*${(1 + p.zoom / 100).toFixed(3)}:ih*${(1 + p.zoom / 100).toFixed(3)},crop=iw/${(1 + p.zoom / 100).toFixed(3)}:ih/${(1 + p.zoom / 100).toFixed(3)},unsharp=5:5:0.6:3:3:0.3` };
}

export type StabilizeArgs = {
  client: Supa;
  clip: { id: string; project_id: string; user_id: string; source_path: string; duration_s: number | null };
  strength: StabilizeStrength;
  /** write the row's progress (throttled by the caller) */
  onProgress?: (share: number) => Promise<void> | void;
};

/**
 * Make the stabilized copy: download the source, two ffmpeg passes, upload.
 * Returns the storage path. Throws with a plain message on failure.
 */
export async function stabilizeClip({ client, clip, strength, onProgress }: StabilizeArgs): Promise<string> {
  const bin = await ffmpegBin();
  if (!bin) throw new Error("ffmpeg is not available on this server.");
  const folder = clip.source_path.slice(0, clip.source_path.lastIndexOf("/") + 1);
  const urls = await signUrls(client, [clip.source_path], 600);
  const url = urls[clip.source_path];
  if (!url) throw new Error("The clip's file couldn't be read from storage.");
  const dur = Math.max(1, clip.duration_s ?? 1);
  const dir = await mkdtemp(join(tmpdir(), "socia-stab-"));
  try {
    const src = join(dir, "in.mp4"), trf = join(dir, "moves.trf"), out = join(dir, "out.mp4");
    const res = await fetch(url);
    if (!res.ok) throw new Error("The clip's file couldn't be downloaded.");
    await writeFile(src, Buffer.from(await res.arrayBuffer()));
    const filters = stabilizeFilters(strength, trf, await hasVidstab(bin));
    // Pass 1 (vidstab): measure the camera's moves.
    if (filters.detect) await run(bin, ["-i", src, "-vf", filters.detect, "-an", "-f", "null", "-"], dur, (s) => onProgress?.(s * 0.5));
    // Pass 2: apply the smoothed path, zoom to hide the borders, a touch of sharpening back.
    await run(bin, ["-i", src, "-vf", filters.transform, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", out], dur, (s) => onProgress?.(filters.detect ? 0.5 + s * 0.5 : s));
    const bytes = await readFile(out);
    const path = stablePath(folder, strength);
    // Stored with the service role when present: a copy made for a member's clip lands in the member's folder, which
    // the owner's own session could not write to (storage RLS keys on the first folder).
    const { error } = await storageClient(client).storage.from(STUDIO_BUCKET).upload(path, bytes, { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(`Couldn't store the stabilized copy: ${error.message}`);
    return path;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => null);
  }
}

/**
 * The stabilized copies that exist in storage for a clip folder, by strength.
 * The source of truth when the database has no `stabilized` column yet (the
 * migration in supabase/studio-stabilize.sql not run): a copy is "done" when
 * its file is there. Best-effort: an unreadable folder reads as none.
 */
export async function listStable(client: Supa, folder: string): Promise<Partial<Record<StabilizeStrength, string>>> {
  const dir = folder.replace(/\/$/, "");
  const st = storageClient(client).storage.from(STUDIO_BUCKET);
  const { data } = await st.list(dir, { limit: 100 }).catch(() => ({ data: null }));
  const out: Partial<Record<StabilizeStrength, string>> = {};
  for (const o of data ?? []) {
    const m = /^stable-(low|medium|high)\.mp4$/.exec(o.name);
    if (m && o.id) out[m[1] as StabilizeStrength] = `${dir}/${o.name}`;
  }
  return out;
}

/** Postgres "column does not exist" for the stabilized column: the migration has not run; storage stands in. */
export const isMissingStabColumn = (e: unknown): boolean => /stabilized|42703|column .* does not exist/i.test((e as Error)?.message ?? String(e));
