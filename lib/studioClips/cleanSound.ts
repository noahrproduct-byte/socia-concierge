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

const cache = new Map<string, Promise<string | null>>();
// ffmpeg.wasm runs one job at a time.
let queue: Promise<unknown> = Promise.resolve();

async function run(url: string, n: number): Promise<string | null> {
  const ff = await loadFfmpeg();
  if (!ff) return null;
  const inName = `snd${n}.in`, outName = `snd${n}.m4a`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    await ff.writeFile(inName, new Uint8Array(await res.arrayBuffer()));
    const code = await ff.exec(["-i", inName, "-vn", "-af", CLEAN_FILTER, "-c:a", "aac", "-b:a", "160k", outName]);
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
export function cleanSound(clipId: string, url: string): Promise<string | null> {
  if (!cache.has(clipId)) {
    const n = ++seq;
    const job = queue.then(() => run(url, n));
    queue = job.catch(() => null);
    cache.set(clipId, job);
  }
  return cache.get(clipId)!;
}

/** Cleaned sound for every clip a cut uses (missing ones are left out: those clips keep their own sound). */
export async function cleanSounds(sources: { clipId: string; url: string }[], onEach?: (done: number, total: number) => void): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let done = 0;
  for (const s of sources) {
    const u = await cleanSound(s.clipId, s.url);
    if (u) out[s.clipId] = u;
    onEach?.(++done, sources.length);
  }
  return out;
}
