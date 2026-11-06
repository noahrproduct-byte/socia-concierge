"use client";
// Reduce background noise in a clip's sound, in this browser (Noah,
// 2026-11-02: "the audio in the background has to be filtered out"). The
// clip's own audio goes through ffmpeg.wasm (the copy SOCIA already ships for
// upload compression): rumble and hiss are cut, steady background noise is
// reduced, and the level is evened out. The result is a separate audio file
// the editor plays in place of the clip's own sound, in the preview and in
// the exported video alike. Nothing is uploaded; the original clip is untouched.
// Fail-safe: anything that goes wrong returns null and the clip keeps its
// own sound.
import { loadFfmpeg } from "@/lib/videoCompress";

/** The filter chain: high-pass (rumble), low-pass (hiss), spectral noise reduction, then a steady level. */
export const CLEAN_FILTER = "highpass=f=120,lowpass=f=8000,afftdn=nr=18:nf=-38:tn=1,loudnorm=I=-18:TP=-2:LRA=9";

/**
 * For a cut with no one talking where the action's own sound is the point
 * (Noah, 2026-11-06: "keep the cutting sound"). A phone records a pizza wheel
 * faintly under the kitchen hum: this takes out the hum, brings up the
 * frequencies the action lives in and lifts it to sit over the music. A cut plays
 * its other shots low (lib/studioClips/teach.ts).
 */
export const ACTION_FILTER = "highpass=f=450,equalizer=f=3500:t=o:w=2:g=9,volume=15dB,acompressor=threshold=-20dB:ratio=4:attack=4:release=90,volume=8dB,alimiter=limit=0.89:level=false";

export type SoundMode = "clean" | "action";
const FILTERS: Record<SoundMode, string> = { clean: CLEAN_FILTER, action: ACTION_FILTER };

const cache = new Map<string, Promise<string | null>>();
// ffmpeg.wasm runs one job at a time.
let queue: Promise<unknown> = Promise.resolve();

async function run(url: string, n: number, mode: SoundMode): Promise<string | null> {
  const ff = await loadFfmpeg();
  if (!ff) return null;
  const inName = `snd${n}.in`, outName = `snd${n}.m4a`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    await ff.writeFile(inName, new Uint8Array(await res.arrayBuffer()));
    const code = await ff.exec(["-i", inName, "-vn", "-af", FILTERS[mode], "-c:a", "aac", "-b:a", "160k", outName]);
    if (code !== 0) return null;
    const data = (await ff.readFile(outName)) as Uint8Array;
    if (!data?.byteLength) return null;
    return URL.createObjectURL(new Blob([data.slice().buffer as ArrayBuffer], { type: "audio/mp4" }));
  } catch {
    return null;
  } finally {
    try { await ff.deleteFile(inName); } catch { /* not written */ }
    try { await ff.deleteFile(outName); } catch { /* not written */ }
  }
}

let seq = 0;
/** A playable URL of the clip's cleaned sound, made once per clip in this tab; null when it can't be made. */
export function cleanSound(clipId: string, url: string, mode: SoundMode = "clean"): Promise<string | null> {
  const key = `${mode}:${clipId}`;
  if (!cache.has(key)) {
    const n = ++seq;
    const job = queue.then(() => run(url, n, mode));
    queue = job.catch(() => null);
    cache.set(key, job);
  }
  return cache.get(key)!;
}

/** Cleaned sound for every clip a cut uses (missing ones are left out: those clips keep their own sound). */
export async function cleanSounds(sources: { clipId: string; url: string }[], onEach?: (done: number, total: number) => void, mode: SoundMode = "clean"): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let done = 0;
  for (const s of sources) {
    const u = await cleanSound(s.clipId, s.url, mode);
    if (u) out[s.clipId] = u;
    onEach?.(++done, sources.length);
  }
  return out;
}
