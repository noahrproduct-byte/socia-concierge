"use client";

// The cut's clips fetched ahead into memory, one at a time, so the preview plays from there instead of starting each
// shot cold from storage (lib/studioClips/preload.ts has the measurement and the limits). Returns the in-memory
// address of each clip that is ready, by its own link. The editor swaps a clip over only while the player is paused
// (ClipBuilder): measured 2026-11-26, a video element whose source changes while the player waits on it never
// recovers, and the preview stays frozen. For the same reason this does its own fetch rather than Remotion's
// prefetch, which swaps whenever the download happens to finish; and it reads past the browser's HTTP cache, where
// a second request for a file being downloaded waits for the first to finish (which froze the first shot).
// Fetching waits while the preview plays, so a streaming shot never shares the connection with its own copy.
// The export never uses these copies: it reads the originals. Anything too large, or past the device's budget,
// streams as it did before.
import { useEffect, useRef, useState } from "react";
import { PRELOAD_FILE_MAX, preloadBudget } from "@/lib/studioClips/preload";

type Nav = Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
type Held = { stop: AbortController; size: number; blobUrl: string | null };

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readAll(res: Response, limit: () => number, entry: Held, busy: () => boolean): Promise<Blob | null> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > limit()) return null;
  const reader = res.body?.getReader();
  if (!reader) return null;
  const parts: BlobPart[] = [];
  for (;;) {
    // While the preview plays, the download waits (nothing is read, so the connection backs off): the shot on
    // screen is streaming and must not share the line with a copy of itself.
    while (busy() && !entry.stop.signal.aborted) await pause(250);
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    entry.size += value.byteLength;
    if (entry.size > limit()) { await reader.cancel().catch(() => undefined); return null; }
  }
  return new Blob(parts, { type: res.headers.get("content-type") ?? "video/mp4" });
}

export function usePreloadMedia(urls: string[], /** true while the preview is playing: fetching waits */ busy: () => boolean = () => false): Record<string, string> {
  const busyRef = useRef(busy);
  busyRef.current = busy;
  // The list as one string: the effect runs again only when the media itself changes, not on every edit.
  const key = urls.join("\n");
  const held = useRef(new Map<string, Held>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [ready, setReady] = useState<Record<string, string>>({});
  useEffect(() => {
    const want = key ? key.split("\n") : [];
    const drop = (url: string, h: Held) => { h.stop.abort(); if (h.blobUrl) URL.revokeObjectURL(h.blobUrl); held.current.delete(url); };
    // What the cut no longer uses is let go; what it still uses stays as it is (an edit never fetches a clip twice).
    let dropped = false;
    for (const [url, h] of Array.from(held.current)) if (!want.includes(url)) { drop(url, h); dropped = true; }
    if (dropped) setReady((r) => Object.fromEntries(Object.entries(r).filter(([url]) => want.includes(url))));
    const nav = navigator as Nav;
    const budget = preloadBudget({ saveData: nav.connection?.saveData, memoryGb: nav.deviceMemory ?? null });
    if (!budget) return;
    for (const url of want) {
      if (held.current.has(url)) continue;
      const entry: Held = { stop: new AbortController(), size: 0, blobUrl: null };
      held.current.set(url, entry);
      queue.current = queue.current.then(async () => {
        if (held.current.get(url) !== entry) return;
        const others = () => Array.from(held.current.values()).reduce((a, h) => a + (h === entry ? 0 : h.size), 0);
        const limit = () => Math.min(PRELOAD_FILE_MAX, budget - others());
        if (limit() <= 0) return;
        try {
          while (busyRef.current() && !entry.stop.signal.aborted) await pause(250);
          const res = await fetch(url, { cache: "no-store", signal: entry.stop.signal });
          const blob = res.ok ? await readAll(res, limit, entry, () => busyRef.current()) : null;
          if (!blob || held.current.get(url) !== entry) { entry.size = 0; return; }
          entry.blobUrl = URL.createObjectURL(blob);
          setReady((r) => ({ ...r, [url]: entry.blobUrl! }));
        } catch { entry.size = 0; /* not fetched (offline, stopped, no access from here): it streams */ }
      });
    }
  }, [key]);
  useEffect(() => {
    const all = held.current;
    return () => { for (const h of all.values()) { h.stop.abort(); if (h.blobUrl) URL.revokeObjectURL(h.blobUrl); } all.clear(); };
  }, []);
  return ready;
}
