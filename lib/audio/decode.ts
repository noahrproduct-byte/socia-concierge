"use client";

// Decode a video's sound in the browser to 16 kHz mono: the PCM for
// measuring and a WAV for transcription. Mediabunny (WebCodecs) first; the
// Web Audio API when Mediabunny can't read the file. Nothing leaves the device.
import { parseWav } from "@/lib/studioClips/facts";
import { WAV_SAMPLE_RATE } from "@/lib/studioClips/types";

export type DecodedAudio = { wav: Blob; pcm: Float32Array; rate: number };

function pcmFromWav(buf: ArrayBuffer): { pcm: Float32Array; rate: number } | null {
  const parsed = parseWav(buf);
  if (!parsed) return null;
  const pcm = new Float32Array(parsed.samples.length);
  for (let i = 0; i < pcm.length; i++) pcm[i] = parsed.samples[i] / 32768;
  return { pcm, rate: parsed.sampleRate };
}

/** null when the file has no audio track or the browser can't decode it. */
export async function decodeToMono16k(blob: Blob): Promise<DecodedAudio | null> {
  try {
    const mb = await import("mediabunny");
    const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(blob) });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track) return null;
      if (await track.canDecode().catch(() => false)) {
        const output = new mb.Output({ format: new mb.WavOutputFormat(), target: new mb.BufferTarget() });
        const conversion = await mb.Conversion.init({ input, output, video: { discard: true }, audio: { numberOfChannels: 1, sampleRate: WAV_SAMPLE_RATE, sampleFormat: "s16" } });
        if (conversion.isValid) {
          await conversion.execute();
          const buf = output.target.buffer;
          const d = buf ? pcmFromWav(buf) : null;
          if (buf && d) return { wav: new Blob([buf], { type: "audio/wav" }), ...d };
        }
      }
    } finally {
      input.dispose();
    }
  } catch {
    /* fall back to Web Audio */
  }
  return decodeWithWebAudio(blob);
}

async function decodeWithWebAudio(blob: Blob): Promise<DecodedAudio | null> {
  if (blob.size > 200 * 1024 * 1024) return null; // decodeAudioData holds the whole file in memory
  const Offline = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Offline) return null;
  try {
    const decoded = await new Offline(1, 1, WAV_SAMPLE_RATE).decodeAudioData(await blob.arrayBuffer());
    const length = Math.max(1, Math.ceil(decoded.duration * WAV_SAMPLE_RATE));
    const ctx = new Offline(1, length, WAV_SAMPLE_RATE);
    const src = ctx.createBufferSource();
    src.buffer = decoded;
    src.connect(ctx.destination);
    src.start(0);
    const pcm = (await ctx.startRendering()).getChannelData(0);
    const out = new ArrayBuffer(44 + pcm.length * 2);
    const v = new DataView(out);
    const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE");
    str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, WAV_SAMPLE_RATE, true); v.setUint32(28, WAV_SAMPLE_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, pcm.length * 2, true);
    const ints = new Int16Array(out, 44);
    for (let i = 0; i < pcm.length; i++) ints[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767)));
    return { wav: new Blob([out], { type: "audio/wav" }), pcm: Float32Array.from(pcm), rate: WAV_SAMPLE_RATE };
  } catch {
    return null;
  }
}
