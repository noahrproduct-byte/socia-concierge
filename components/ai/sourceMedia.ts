"use client";

// Every moment of a job plays from the same long source, and browsers stall
// when several video elements load one large file at once: on a real 4-minute
// source, five previews stayed empty for over 35 seconds, while one alone
// loaded in 10. So the source is measured once per job, and previews load one
// at a time, only when they are on screen.

export type SourceSize = { width: number; height: number; duration: number };

// Each slot's turn ends when its preview has loaded or failed, or after this long, so one bad load can't hold up the rest.
const SLOT_MS = 20_000;

let busy = false;
const waiting: (() => void)[] = [];

function next() {
  const go = waiting.shift();
  if (go) { busy = true; go(); } else busy = false;
}

/** Wait for a turn to load video. Call the returned function when done; extra calls are harmless. Pass a signal to leave the line. */
export function takeSlot(signal?: AbortSignal): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const start = () => {
      let done = false;
      const release = () => { if (done) return; done = true; clearTimeout(timer); next(); };
      const timer = setTimeout(release, SLOT_MS);
      if (signal?.aborted) { release(); reject(new DOMException("Left the line", "AbortError")); return; }
      resolve(release);
    };
    if (busy) waiting.push(start);
    else { busy = true; start(); }
  });
}

const sizes = new Map<string, Promise<SourceSize | null>>();

/** The source's size and length, read once per source. Null when it can't be read. */
export function sourceSize(url: string): Promise<SourceSize | null> {
  const known = sizes.get(url);
  if (known) return known;
  const read = (async () => {
    const release = await takeSlot();
    return new Promise<SourceSize | null>((resolve) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      const finish = (size: SourceSize | null) => {
        release();
        if (!size) sizes.delete(url); // A failed read may be tried again.
        v.removeAttribute("src");
        v.load(); // Lets go of the connection.
        resolve(size);
      };
      v.onloadedmetadata = () => finish(v.videoWidth > 0 ? { width: v.videoWidth, height: v.videoHeight, duration: v.duration } : null);
      v.onerror = () => finish(null);
      v.src = url;
    });
  })();
  sizes.set(url, read);
  return read;
}
