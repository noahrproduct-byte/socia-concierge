// Browser-side ingest for Build from Clips: everything SOCIA can measure
// about a clip on the person's own device before a byte is uploaded —
// identity (fingerprint), length and size, where the picture changes, which
// frames to keep, how the picture and the sound measure, and a 16 kHz mono
// WAV for transcription. Mediabunny (WebCodecs) does the decoding; a <video>
// element fallback covers browsers or files it cannot read.
import { extractFrames } from "@/lib/studio";
import { frameStats, sceneCuts, chooseKeyframes, visualSummary, parseWav, pcmWindows, audioSummary, type FrameSample } from "./facts";
import { KEYFRAME_WIDTH, SCAN_WIDTH, MIN_KEYFRAMES, MAX_KEYFRAMES, WAV_SAMPLE_RATE, MAX_CLIP_SEC, type AudioFacts, type ClipFacts } from "./types";

export type Probe = { durationSec: number; width: number | null; height: number | null; hasAudio: boolean; method: "mediabunny" | "video-element" };
export type Keyframe = { t: number; blob: Blob };
export type IngestStage = "frames" | "audio";
export type IngestResult = { frames: Keyframe[]; wav: Blob | null; facts: ClipFacts };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const NO_AUDIO: AudioFacts = { hasAudio: false, rmsDb: null, peakDb: null, audibleRatio: null, silences: [], level: "unknown" };

/**
 * A content fingerprint: SHA-256 over the file size and three 1 MB samples
 * (start, middle, end). Fast and memory-light; identical files always match,
 * and two different edits of the same footage almost never do. Not a full
 * hash, and never presented as one.
 */
export async function fingerprintFile(file: File): Promise<string> {
  const MB = 1024 * 1024;
  const parts: ArrayBuffer[] = [new TextEncoder().encode(`${file.size}`).buffer as ArrayBuffer];
  const spots = file.size <= 3 * MB ? [[0, file.size]] : [[0, MB], [Math.floor(file.size / 2 - MB / 2), Math.floor(file.size / 2 + MB / 2)], [file.size - MB, file.size]];
  for (const [a, b] of spots) parts.push(await file.slice(a, b).arrayBuffer());
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const joined = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { joined.set(new Uint8Array(p), off); off += p.byteLength; }
  const digest = await crypto.subtle.digest("SHA-256", joined);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Mediabunny = typeof import("mediabunny");
let mbPromise: Promise<Mediabunny | null> | null = null;
const loadMediabunny = () => (mbPromise ??= import("mediabunny").catch(() => null));

/** Length, dimensions and whether there is sound. Mediabunny first, <video> otherwise. */
export async function probeClip(file: File): Promise<Probe> {
  const mb = await loadMediabunny();
  if (mb) {
    const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(file) });
    try {
      const [video, audio] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
      if (video && (await video.canDecode())) {
        const [durationSec, width, height] = await Promise.all([input.computeDuration(), video.getDisplayWidth(), video.getDisplayHeight()]);
        return { durationSec, width, height, hasAudio: Boolean(audio), method: "mediabunny" };
      }
    } catch {
      /* fall through to the element */
    } finally {
      input.dispose();
    }
  }
  return probeWithElement(file);
}

function probeWithElement(file: File): Promise<Probe> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata"; v.muted = true; v.playsInline = true;
    const done = (fn: () => void) => { URL.revokeObjectURL(url); v.removeAttribute("src"); v.load(); fn(); };
    const t = setTimeout(() => done(() => reject(new Error("unsupported"))), 20000);
    v.onloadedmetadata = () => { clearTimeout(t); const d = v.duration; done(() => (isFinite(d) && d > 0 ? resolve({ durationSec: d, width: v.videoWidth || null, height: v.videoHeight || null, hasAudio: true, method: "video-element" }) : reject(new Error("unsupported")))); };
    v.onerror = () => { clearTimeout(t); done(() => reject(new Error("unsupported"))); };
    v.src = url;
  });
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function pixels(canvas: AnyCanvas): Uint8ClampedArray {
  const ctx = (canvas as HTMLCanvasElement).getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("unsupported");
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

async function toJpeg(canvas: AnyCanvas): Promise<Blob> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/jpeg", quality: 0.72 });
  return new Promise((res, rej) => (canvas as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error("unsupported"))), "image/jpeg", 0.72));
}

/** Frames, measured facts and the transcription WAV. Throws "unsupported" when nothing can read the file. */
export async function ingestClip(file: File, probe: Probe, onStage: (stage: IngestStage, done: number, total: number) => void): Promise<IngestResult> {
  if (probe.durationSec > MAX_CLIP_SEC) throw new Error("too_long");
  if (probe.method === "mediabunny") {
    const mb = await loadMediabunny();
    if (mb) {
      try { return await ingestWithMediabunny(mb, file, probe, onStage); }
      catch (e) { console.warn("[studio] mediabunny ingest failed, using <video> fallback:", (e as Error)?.message ?? e); }
    }
  }
  return ingestWithElement(file, probe, onStage);
}

async function ingestWithMediabunny(mb: Mediabunny, file: File, probe: Probe, onStage: (stage: IngestStage, done: number, total: number) => void): Promise<IngestResult> {
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(file) });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("no video track");
    const d = probe.durationSec;

    // 1) A coarse scan for scene changes (small frames, never uploaded).
    const step = clamp(d / 48, 0.5, 2);
    const scanTimes: number[] = [];
    for (let t = 0.05; t < d; t += step) scanTimes.push(Math.min(t, Math.max(0, d - 0.05)));
    const scan = new mb.CanvasSink(video, { width: SCAN_WIDTH });
    const samples: FrameSample[] = [];
    for await (const r of scan.canvasesAtTimestamps(scanTimes)) {
      if (!r) continue;
      samples.push(frameStats(pixels(r.canvas), r.timestamp));
      onStage("frames", samples.length, scanTimes.length + MAX_KEYFRAMES);
    }
    const cuts = sceneCuts(samples);

    // 2) The keyframes SOCIA keeps: one per scene plus the opening.
    const keyTimes = chooseKeyframes(d, cuts, MIN_KEYFRAMES, MAX_KEYFRAMES);
    const keys = new mb.CanvasSink(video, { width: KEYFRAME_WIDTH });
    const frames: Keyframe[] = [];
    for await (const r of keys.canvasesAtTimestamps(keyTimes)) {
      if (!r) continue;
      frames.push({ t: Number(r.timestamp.toFixed(2)), blob: await toJpeg(r.canvas) });
      onStage("frames", scanTimes.length + frames.length, scanTimes.length + keyTimes.length);
    }
    if (!frames.length) throw new Error("no frames decoded");

    // 3) Sound: a 16 kHz mono WAV for transcription, measured on the way.
    let wav: Blob | null = null;
    let audio: AudioFacts = NO_AUDIO;
    const track = await input.getPrimaryAudioTrack();
    if (track && (await track.canDecode().catch(() => false))) {
      onStage("audio", 0, 1);
      const output = new mb.Output({ format: new mb.WavOutputFormat(), target: new mb.BufferTarget() });
      const conversion = await mb.Conversion.init({ input, output, video: { discard: true }, audio: { numberOfChannels: 1, sampleRate: WAV_SAMPLE_RATE, sampleFormat: "s16" } });
      if (conversion.isValid) {
        await conversion.execute();
        const buf = output.target.buffer;
        if (buf) {
          wav = new Blob([buf], { type: "audio/wav" });
          const parsed = parseWav(buf);
          audio = parsed ? audioSummary(pcmWindows(parsed.samples, parsed.sampleRate)) : { ...NO_AUDIO, hasAudio: true };
        }
      }
      onStage("audio", 1, 1);
    }
    return { frames, wav, facts: { method: "mediabunny", visual: visualSummary(samples, cuts), audio } };
  } finally {
    input.dispose();
  }
}

async function ingestWithElement(file: File, probe: Probe, onStage: (stage: IngestStage, done: number, total: number) => void): Promise<IngestResult> {
  const sampled = await extractFrames(file, (done, total) => onStage("frames", done, total));
  const frames: Keyframe[] = [];
  const samples: FrameSample[] = [];
  for (let i = 0; i < sampled.frames.length; i++) {
    const bytes = Uint8Array.from(atob(sampled.frames[i]), (c) => c.charCodeAt(0));
    frames.push({ t: sampled.times[i], blob: new Blob([bytes], { type: "image/jpeg" }) });
    samples.push(frameStats(await decodeJpeg(sampled.thumbs[i].src), sampled.times[i]));
  }
  // Keep the model's frame count in line with the Mediabunny path.
  const keep = frames.length > MAX_KEYFRAMES ? frames.filter((_, i) => i === 0 || i % Math.ceil(frames.length / MAX_KEYFRAMES) === 0).slice(0, MAX_KEYFRAMES) : frames;

  let wav: Blob | null = null;
  let audio: AudioFacts = NO_AUDIO;
  // decodeAudioData needs the whole file in memory; skip very large files.
  if (file.size <= 200 * 1024 * 1024) {
    try {
      onStage("audio", 0, 1);
      const pcm = await renderMono16k(await file.arrayBuffer(), probe.durationSec);
      if (pcm) {
        wav = new Blob([pcm], { type: "audio/wav" });
        const parsed = parseWav(pcm);
        if (parsed) audio = audioSummary(pcmWindows(parsed.samples, parsed.sampleRate));
      }
      onStage("audio", 1, 1);
    } catch {
      audio = { ...NO_AUDIO, hasAudio: true, level: "unknown" };
    }
  }
  return { frames: keep, wav, facts: { method: "video-element", visual: visualSummary(samples, null), audio } };
}

function decodeJpeg(dataUrl: string): Promise<Uint8ClampedArray> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext("2d");
      if (!ctx) return rej(new Error("unsupported"));
      ctx.drawImage(img, 0, 0);
      res(ctx.getImageData(0, 0, c.width, c.height).data);
    };
    img.onerror = () => rej(new Error("unsupported"));
    img.src = dataUrl;
  });
}

/** Decode with Web Audio, resample to 16 kHz mono, write a PCM WAV. */
async function renderMono16k(bytes: ArrayBuffer, durationSec: number): Promise<ArrayBuffer | null> {
  const Offline = (window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext);
  if (!Offline) return null;
  const length = Math.max(1, Math.ceil(durationSec * WAV_SAMPLE_RATE));
  const ctx = new Offline(1, length, WAV_SAMPLE_RATE);
  const decoded = await ctx.decodeAudioData(bytes.slice(0));
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  src.connect(ctx.destination);
  src.start(0);
  const rendered = await ctx.startRendering();
  const ch = rendered.getChannelData(0);
  const out = new ArrayBuffer(44 + ch.length * 2);
  const v = new DataView(out);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + ch.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, WAV_SAMPLE_RATE, true); v.setUint32(28, WAV_SAMPLE_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, ch.length * 2, true);
  const pcm = new Int16Array(out, 44);
  for (let i = 0; i < ch.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(ch[i] * 32767)));
  return out;
}
