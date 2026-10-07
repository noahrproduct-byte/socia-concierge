"use client";

// Phase C measuring, in the browser: for every clip in the cut, a handful of
// small frames from the parts the cut actually uses (for the picture
// solver) and the sound of that range as 100 ms windows with their true
// sample peaks (for the cleanup plan). Mediabunny reads the clip from its
// signed URL with range requests, so only the used part is fetched and
// decoded; nothing is uploaded.
import type { BuildSource, Edl } from "./types";
import type { SoundWindow } from "./sound";

export type ClipMeasure = {
  clipId: string;
  /** RGB triplets from frames inside the used ranges; null when the picture couldn't be read */
  pixels: Uint8Array | null;
  /** 100 ms windows over the used range; null without readable sound */
  windows: SoundWindow[] | null;
  range: [number, number];
  note: string | null;
};

const FRAME_WIDTH = 96;
const FRAMES_PER_SEGMENT = 3;
const MAX_FRAMES = 9;
const WINDOW = 0.1;

export async function measureCut(
  edl: Edl,
  sources: Record<string, BuildSource>,
  onProgress: (done: number, total: number, clipId: string) => void,
  signal?: AbortSignal,
): Promise<Record<string, ClipMeasure>> {
  const mb = await import("mediabunny");
  const byClip = new Map<string, { in: number; out: number }[]>();
  for (const s of edl.segments) if (sources[s.clipId]) byClip.set(s.clipId, [...(byClip.get(s.clipId) ?? []), { in: s.in, out: s.out }]);
  const ids = Array.from(byClip.keys());
  const out: Record<string, ClipMeasure> = {};
  for (let k = 0; k < ids.length; k++) {
    if (signal?.aborted) break;
    const id = ids[k];
    onProgress(k, ids.length, id);
    const segs = byClip.get(id)!;
    const range: [number, number] = [Math.min(...segs.map((s) => s.in)), Math.max(...segs.map((s) => s.out))];
    const m: ClipMeasure = { clipId: id, pixels: null, windows: null, range, note: null };
    const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.UrlSource(sources[id].url) });
    try {
      // Picture: evenly inside each used segment.
      const video = await input.getPrimaryVideoTrack();
      if (video && (await video.canDecode().catch(() => false))) {
        const times = segs.flatMap((s) => Array.from({ length: FRAMES_PER_SEGMENT }, (_, i) => s.in + ((i + 1) / (FRAMES_PER_SEGMENT + 1)) * (s.out - s.in))).slice(0, MAX_FRAMES);
        const sink = new mb.CanvasSink(video, { width: FRAME_WIDTH });
        const chunks: Uint8Array[] = [];
        for await (const r of sink.canvasesAtTimestamps(times)) {
          if (!r) continue;
          const c = r.canvas as HTMLCanvasElement | OffscreenCanvas;
          const ctx = (c as HTMLCanvasElement).getContext("2d") as CanvasRenderingContext2D | null;
          if (!ctx) continue;
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          const rgb = new Uint8Array((d.length / 4) * 3);
          for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { rgb[j] = d[i]; rgb[j + 1] = d[i + 1]; rgb[j + 2] = d[i + 2]; }
          chunks.push(rgb);
        }
        if (chunks.length) {
          const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
          let o = 0;
          for (const c of chunks) { all.set(c, o); o += c.length; }
          m.pixels = all;
        } else m.note = "No frames could be read from this clip.";
      } else m.note = "This browser can't decode this clip's video.";

      // Sound: RMS and true peak per 100 ms window, across all channels.
      const audio = await input.getPrimaryAudioTrack();
      if (audio && (await audio.canDecode().catch(() => false))) {
        const n = Math.max(1, Math.ceil((range[1] - range[0]) / WINDOW));
        const sumSq = new Float64Array(n), count = new Uint32Array(n), peak = new Float32Array(n);
        const sink = new mb.AudioBufferSink(audio);
        for await (const { buffer, timestamp } of sink.buffers(range[0], range[1])) {
          if (signal?.aborted) break;
          const sr = buffer.sampleRate;
          const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
          for (let i = 0; i < buffer.length; i++) {
            const t = timestamp + i / sr;
            if (t < range[0] || t >= range[1]) continue;
            const w = Math.min(n - 1, Math.floor((t - range[0]) / WINDOW));
            for (const ch of chans) { const x = ch[i]; sumSq[w] += x * x; count[w]++; const a = Math.abs(x); if (a > peak[w]) peak[w] = a; }
          }
        }
        const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -120);
        const windows: SoundWindow[] = [];
        // Windows stay contiguous (the gain curve is indexed by time); a window with no samples reads as silence.
        for (let w = 0; w < n; w++) {
          windows.push({ t: Number((range[0] + w * WINDOW).toFixed(2)), rmsDb: count[w] ? Number(db(Math.sqrt(sumSq[w] / count[w])).toFixed(1)) : -120, peakDb: count[w] ? Number(db(peak[w]).toFixed(1)) : -120 });
        }
        m.windows = count.some((c) => c > 0) ? windows : null;
      }
    } catch (e) {
      m.note = `Couldn't read this clip (${(e as Error)?.message ?? "unknown error"}).`;
    } finally {
      input.dispose();
    }
    out[id] = m;
    // Let the page breathe between clips.
    await new Promise((r) => setTimeout(r, 0));
  }
  onProgress(ids.length, ids.length, "");
  return out;
}
