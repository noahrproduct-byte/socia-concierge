"use client";

// Browser side of "Audio that works": fetch one past post's file through
// SOCIA (which only hands out files the person is entitled to), decode its
// sound with Mediabunny and measure it. The file is never kept; only the
// numbers go back.
import { parseWav } from "@/lib/studioClips/facts";
import { WAV_SAMPLE_RATE } from "@/lib/studioClips/types";
import { analyzeAudio, type AudioFeatures } from "./features";

export class MeasureError extends Error {
  constructor(public kind: "expired" | "forbidden" | "decode" | "network", message: string) {
    super(message);
    this.name = "MeasureError";
  }
}

export async function measureMedia(mediaId: string): Promise<AudioFeatures> {
  const res = await fetch(`/api/studio/audio/media?id=${encodeURIComponent(mediaId)}`).catch(() => null);
  if (!res) throw new MeasureError("network", "Couldn't reach SOCIA.");
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new MeasureError(res.status === 410 ? "expired" : res.status === 403 || res.status === 404 ? "forbidden" : "network", j?.error ?? `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const mb = await import("mediabunny");
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(blob) });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode().catch(() => false))) throw new MeasureError("decode", "This browser can't decode the post's audio.");
    const output = new mb.Output({ format: new mb.WavOutputFormat(), target: new mb.BufferTarget() });
    const conversion = await mb.Conversion.init({ input, output, video: { discard: true }, audio: { numberOfChannels: 1, sampleRate: WAV_SAMPLE_RATE, sampleFormat: "s16" } });
    if (!conversion.isValid) throw new MeasureError("decode", "The post's audio couldn't be read.");
    await conversion.execute();
    const buf = output.target.buffer;
    const parsed = buf ? parseWav(buf) : null;
    if (!parsed) throw new MeasureError("decode", "The post's audio couldn't be read.");
    const pcm = new Float32Array(parsed.samples.length);
    for (let i = 0; i < pcm.length; i++) pcm[i] = parsed.samples[i] / 32768;
    return analyzeAudio(pcm, parsed.sampleRate);
  } finally {
    input.dispose();
  }
}
