"use client";
// The reference video's music, measured in this browser from the 16 kHz sound the
// reference read already made for its speech (components/studio/useReference.ts).
// Free: nothing is uploaded and no AI is asked. See lib/music/referenceMusic.ts.
import { parseWav } from "@/lib/studioClips/facts";
import { analyzeAudio, beatOf, frameLevels, MUSIC_LIKELY_AT } from "@/lib/audio/features";
import { readReferenceMusic, type ReferenceMusic } from "./referenceMusic";

export async function measureReferenceMusic(
  wav: Blob,
  known: { words: { startMs: number; endMs: number }[] | null; cuts: number[] | null },
): Promise<ReferenceMusic | null> {
  try {
    const parsed = parseWav(await wav.arrayBuffer());
    if (!parsed || !parsed.samples.length) return null;
    const pcm = new Float32Array(parsed.samples.length);
    for (let i = 0; i < pcm.length; i++) pcm[i] = parsed.samples[i] / 32768;
    const rate = parsed.sampleRate;
    const features = analyzeAudio(pcm, rate);
    return readReferenceMusic({
      rms: frameLevels(pcm, rate).rms,
      durationSec: pcm.length / rate,
      musicScore: features.musicScore,
      musicLikelyAt: MUSIC_LIKELY_AT,
      beat: beatOf(pcm, rate),
      words: known.words,
      cuts: known.cuts,
    });
  } catch {
    return null;
  }
}
