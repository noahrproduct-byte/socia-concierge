"use client";

// Reads the video the browser just made, the way renderCheck.ts plans: small
// grey frames around every join and in the middle of every shot, and the
// sound as 100 ms windows. Mediabunny decodes the file in this tab; nothing
// is uploaded. Fail-safe: a file that can't be read returns null and the
// video is saved as before, unchecked.
import { judgeRender, probeTime, renderPlan, RENDER, type FileRead, type FrameRead, type RenderReport, type SoundRead } from "./renderCheck";
import type { Edl } from "./types";

export async function inspectRender(blob: Blob, edl: Edl, expect: { sound: boolean; music: boolean }, signal?: AbortSignal): Promise<RenderReport | null> {
  const plan = renderPlan(edl);
  const mb = await import("mediabunny");
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(blob) });
  try {
    const read: FileRead = { durationSec: null, width: null, height: null, frames: [], sound: null };
    read.durationSec = await input.computeDuration().catch(() => null);
    const video = await input.getPrimaryVideoTrack();
    if (!video || !(await video.canDecode().catch(() => false))) return null;
    [read.width, read.height] = await Promise.all([video.getDisplayWidth(), video.getDisplayHeight()]);

    // The frames, each read once, in time order.
    const frames = Array.from(new Set(plan.probes.map((p) => p.frame))).sort((a, b) => a - b);
    const sink = new mb.CanvasSink(video, { width: RENDER.frameWidth });
    let k = 0;
    for await (const r of sink.canvasesAtTimestamps(frames.map((f) => probeTime(f, plan.fps)))) {
      if (signal?.aborted) return null;
      const frame = frames[k++];
      if (!r) continue;
      const c = r.canvas as HTMLCanvasElement | OffscreenCanvas;
      const ctx = (c as HTMLCanvasElement).getContext("2d") as CanvasRenderingContext2D | null;
      if (!ctx) continue;
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const grey = new Float32Array(d.length / 4);
      for (let i = 0, j = 0; i < d.length; i += 4, j++) grey[j] = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      read.frames.push({ frame, grey } satisfies FrameRead);
    }

    // The sound: RMS and sample peak per 100 ms window, across all channels.
    const audio = await input.getPrimaryAudioTrack();
    if (audio && (await audio.canDecode().catch(() => false))) {
      const total = read.durationSec ?? plan.durationSec;
      const n = Math.max(1, Math.ceil(total / RENDER.windowSec));
      const sumSq = new Float64Array(n), count = new Uint32Array(n), peak = new Float32Array(n);
      for await (const { buffer, timestamp } of new mb.AudioBufferSink(audio).buffers()) {
        if (signal?.aborted) return null;
        const sr = buffer.sampleRate;
        const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
        for (let i = 0; i < buffer.length; i++) {
          const w = Math.floor((timestamp + i / sr) / RENDER.windowSec);
          if (w < 0 || w >= n) continue;
          for (const ch of chans) { const x = ch[i]; sumSq[w] += x * x; count[w]++; const a = Math.abs(x); if (a > peak[w]) peak[w] = a; }
        }
      }
      const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -120);
      const sound: SoundRead = [];
      for (let w = 0; w < n; w++) sound.push({ rmsDb: count[w] ? db(Math.sqrt(sumSq[w] / count[w])) : -120, peakDb: count[w] ? db(peak[w]) : -120 });
      read.sound = sound;
    }
    return judgeRender(plan, read, expect);
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}
