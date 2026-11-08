"use client";

// Where the vertical frame should be during one stretch of the source: frames
// read in this browser, the choice made by Claude (the reframe route). Null
// when that doesn't work; the clip is still made.
import { api } from "./shared";
import { sourceFrames, type SourceSize } from "./sourceMedia";
import { sampleTimes, type CropKey } from "@/lib/clipper/reframe";

export async function findShots(id: string, url: string, size: SourceSize, startMs: number, endMs: number, item?: number): Promise<CropKey[] | null> {
  try {
    const start = startMs / 1000;
    const read = await sourceFrames(url, sampleTimes((endMs - startMs) / 1000).map((t) => start + t));
    const frames = read.map((f) => ({ t: Math.round((f.t - start) * 10) / 10, data: f.data }));
    if (!frames.length) return null;
    const r = await api<{ path: CropKey[] | null }>(`/api/clipper/clips/${id}/reframe`, { method: "POST", body: JSON.stringify({ frames, width: size.width, height: size.height, ...(item != null ? { item } : {}) }) });
    return r.path;
  } catch {
    return null;
  }
}
