"use client";

// Every moment of a job comes from the same long source, which can be large on
// a slow connection (at 170 KB/s, video elements for a 44 MB talk showed
// nothing after 75 seconds). So nothing streams it until someone presses play:
// Mediabunny reads the source's header once per job, then a still frame per
// moment, with range requests for only those bytes.

export type SourceSize = { width: number; height: number; duration: number };

type Opened = {
  size: SourceSize;
  frame: (seconds: number) => Promise<string | null>;
  /** JPEG frames (base64, no prefix) at these times, for the framing decision. */
  frames: (times: number[]) => Promise<{ t: number; data: string }[]>;
};

const opened = new Map<string, Promise<Opened | null>>();

// Frames are read one at a time, so the first card isn't held up by the rest.
let line: Promise<unknown> = Promise.resolve();

async function open(url: string): Promise<Opened | null> {
  const mb = await import("mediabunny");
  const input = new mb.Input({
    formats: mb.ALL_FORMATS,
    source: new mb.UrlSource(url, { getRetryDelay: (n) => (n < 3 ? 1 : null), maxCacheSize: 16 * 1024 * 1024 }),
  });
  const video = await input.getPrimaryVideoTrack();
  if (!video) return null;
  const [duration, width, height, decodable] = await Promise.all([input.computeDuration(), video.getDisplayWidth(), video.getDisplayHeight(), video.canDecode().catch(() => false)]);
  const sink = decodable ? new mb.CanvasSink(video, { width: 640, poolSize: 1 }) : null;
  const toJpeg = (src: HTMLCanvasElement | OffscreenCanvas, quality: number) => {
    const out = document.createElement("canvas");
    out.width = src.width;
    out.height = src.height;
    out.getContext("2d")?.drawImage(src as CanvasImageSource, 0, 0);
    return out.toDataURL("image/jpeg", quality);
  };
  return {
    size: { width, height, duration },
    frame: async (seconds) => {
      if (!sink) return null;
      const got = await sink.getCanvas(seconds);
      if (!got) return null;
      return toJpeg(got.canvas as HTMLCanvasElement | OffscreenCanvas, 0.8);
    },
    frames: async (times) => {
      if (!sink) return [];
      const out: { t: number; data: string }[] = [];
      let i = 0;
      for await (const got of sink.canvasesAtTimestamps(times)) {
        const t = times[i++];
        if (got) out.push({ t, data: toJpeg(got.canvas as HTMLCanvasElement | OffscreenCanvas, 0.6).split(",")[1] });
      }
      return out;
    },
  };
}

function openOnce(url: string): Promise<Opened | null> {
  const known = opened.get(url);
  if (known) return known;
  const next = open(url).catch((e) => {
    console.warn("[clipper] source could not be read:", (e as Error)?.message ?? e);
    return null;
  });
  void next.then((o) => { if (!o) opened.delete(url); }); // A failed read may be tried again.
  opened.set(url, next);
  return next;
}

/** The source's size and length. Null when it can't be read. */
export async function sourceSize(url: string): Promise<SourceSize | null> {
  return (await openOnce(url))?.size ?? null;
}

/** A still of the moment, as an image URL. Null when it can't be read; the video still plays. */
export function sourceFrame(url: string, seconds: number): Promise<string | null> {
  const run = line.then(async () => {
    const o = await openOnce(url);
    return o ? o.frame(seconds) : null;
  }).catch(() => null);
  line = run;
  return run;
}

/** Frames at these source times, in line with the stills. Empty when they can't be read. */
export function sourceFrames(url: string, times: number[]): Promise<{ t: number; data: string }[]> {
  const run = line.then(async () => {
    const o = await openOnce(url);
    return o ? o.frames(times) : [];
  }).catch(() => []);
  line = run;
  return run;
}
