// Which media the editor fetches ahead so the preview plays from memory (components/studio/usePreloadMedia.ts).
// Measured 2026-11-26 on a 12-cut video with its clips streamed at 3 MB/s and 300 ms to first byte: the preview
// froze for 2.4 s at the first cut to another clip on the first play and 1.9 s again on a replay, because each
// shot's video element starts cold 1.5 s before its cut and the player waits for it. With the cut's clips in memory
// the same test played 16.8 s of video in 17.0 s with no freeze, twice. (On a local file there was no freeze before
// or after: the lag was the network, not the drawing.)
// Pure and browser-safe.
import type { BuildSource, Edl } from "./types";

/** One file larger than this is left to stream as before. */
export const PRELOAD_FILE_MAX = 120 * 1024 * 1024;
/** All the files fetched ahead for one cut stay under this; the rest stream as before. */
export const PRELOAD_TOTAL_MAX = 320 * 1024 * 1024;
/** On a device that reports little memory the total is this instead. */
export const PRELOAD_TOTAL_SMALL = 96 * 1024 * 1024;

/**
 * The media of a cut in the order the preview needs it: the small sounds first (music and voiced lines, which the
 * player also waits for), then each clip once, in the order its first shot comes up. Clips not in the cut are left out.
 */
export function preloadOrder(edl: Pick<Edl, "segments" | "broll">, sources: Record<string, Pick<BuildSource, "url">>, sounds: (string | null | undefined)[] = []): string[] {
  const out: string[] = [];
  const add = (url: string | null | undefined) => { if (url && /^https?:|^\//.test(url) && !out.includes(url)) out.push(url); };
  sounds.forEach(add);
  const uses = [...edl.segments.map((s, i) => ({ clipId: s.clipId, at: i })), ...(edl.broll ?? []).map((b) => ({ clipId: b.clipId, at: edl.segments.length + b.at }))];
  for (const u of uses) add(sources[u.clipId]?.url);
  return out;
}

/** How much may be held for this device: nothing with data saving on or very little memory, less on a small device. */
export function preloadBudget(device: { saveData?: boolean; memoryGb?: number | null }): number {
  if (device.saveData) return 0;
  if (device.memoryGb != null && device.memoryGb <= 2) return 0;
  if (device.memoryGb != null && device.memoryGb <= 4) return PRELOAD_TOTAL_SMALL;
  return PRELOAD_TOTAL_MAX;
}
