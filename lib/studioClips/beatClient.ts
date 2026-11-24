"use client";
// The beat and levels of the cut's soundtrack, measured in this browser from
// the track itself (lib/audio/features.ts): tempo and where the first beat
// falls (null when the track has no steady beat), plus its level every
// 10 ms, which draws the track and finds its best part (lib/music/bestPart.ts).
// Measured once per track URL in this tab; nothing is uploaded.
import { decodeToMono16k } from "@/lib/audio/decode";
import { beatOf, frameLevels, type Beat } from "@/lib/audio/features";

export type TrackAnalysis = { beat: Beat | null; rms: Float32Array; durationSec: number };

const cache = new Map<string, Promise<TrackAnalysis | null>>();

export function analysisOfTrack(url: string): Promise<TrackAnalysis | null> {
  const key = url.split("?")[0];
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const dec = await decodeToMono16k(await res.blob());
        if (!dec) return null;
        return { beat: beatOf(dec.pcm, dec.rate), rms: frameLevels(dec.pcm, dec.rate).rms, durationSec: dec.pcm.length / dec.rate };
      } catch {
        return null;
      }
    })());
  }
  return cache.get(key)!;
}

export function beatOfTrack(url: string): Promise<Beat | null> {
  return analysisOfTrack(url).then((a) => a?.beat ?? null);
}
