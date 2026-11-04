"use client";
// The beat of the cut's soundtrack, measured in this browser from the track
// itself (lib/audio/features.ts): tempo and where the first beat falls. A
// track that has no steady beat answers null. Measured once per track URL
// in this tab; nothing is uploaded.
import { decodeToMono16k } from "@/lib/audio/decode";
import { beatOf, type Beat } from "@/lib/audio/features";

const cache = new Map<string, Promise<Beat | null>>();

export function beatOfTrack(url: string): Promise<Beat | null> {
  const key = url.split("?")[0];
  if (!cache.has(key)) {
    cache.set(key, (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const dec = await decodeToMono16k(await res.blob());
        return dec ? beatOf(dec.pcm, dec.rate) : null;
      } catch {
        return null;
      }
    })());
  }
  return cache.get(key)!;
}
