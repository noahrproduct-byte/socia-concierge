"use client";

// The voiceover's audio, made ready to play and render in this browser: the
// MP3 the server sent is decoded, brought up to the level a Reel is heard at
// (lib/animated/loudness.ts), and handed back as a WAV blob. If this browser
// can't decode it, the original audio is used as it came.
import { levelSpeech, wavBytes } from "@/lib/animated/loudness";

export async function voiceBlob(mp3: Uint8Array): Promise<Blob> {
  const original = new Blob([mp3 as BlobPart], { type: "audio/mpeg" });
  try {
    const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Ctx) return original;
    // decodeAudioData takes ownership of the buffer it is given, so it gets a copy.
    const audio = await new Ctx(1, 1, 44100).decodeAudioData(mp3.slice().buffer as ArrayBuffer);
    const channels = Array.from({ length: Math.min(2, audio.numberOfChannels) }, (_, c) => audio.getChannelData(c));
    const leveled = levelSpeech(channels, audio.sampleRate);
    return new Blob([wavBytes(leveled.channels, audio.sampleRate) as BlobPart], { type: "audio/wav" });
  } catch {
    return original;
  }
}
