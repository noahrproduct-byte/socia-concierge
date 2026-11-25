"use client";
// A sound file in the browser: decode it (the browser's own decoder, ffmpeg.wasm for a video it
// can't open), cut a part of it, encode that part (AAC through ffmpeg.wasm, WAV when that can't
// load) and save it to the person's music library (POST /api/studio/tracks, upload, confirm).
// Moved from components/studio/MusicBox.tsx so the Video editor's Reference music card saves
// songs the same way.
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { loadFfmpeg } from "@/lib/videoCompress";
import { STUDIO_BUCKET } from "@/lib/studioClips/types";
import { MAX_TRACK_SEC } from "./limits";
import type { Track } from "./tracks";

const MAX_SEC = MAX_TRACK_SEC;

/** The chosen part as 16-bit WAV bytes. */
export function wavOf(buf: AudioBuffer, fromSec: number, toSec: number): Uint8Array {
  const rate = buf.sampleRate, chans = Math.min(2, buf.numberOfChannels);
  const from = Math.floor(fromSec * rate), to = Math.min(buf.length, Math.floor(toSec * rate));
  const n = Math.max(0, to - from);
  const data = new DataView(new ArrayBuffer(44 + n * chans * 2));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); data.setUint32(4, 36 + n * chans * 2, true); str(8, "WAVE"); str(12, "fmt "); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, chans, true);
  data.setUint32(24, rate, true); data.setUint32(28, rate * chans * 2, true); data.setUint16(32, chans * 2, true); data.setUint16(34, 16, true); str(36, "data"); data.setUint32(40, n * chans * 2, true);
  const src = Array.from({ length: chans }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < chans; c++) { const v = Math.max(-1, Math.min(1, src[c][from + i])); data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return new Uint8Array(data.buffer);
}

/** The part, encoded: AAC in an .m4a through ffmpeg.wasm, or the WAV itself when that can't load. */
export async function encodePart(buf: AudioBuffer, fromSec: number, toSec: number): Promise<{ file: File; ext: "m4a" | "wav" }> {
  const wav = wavOf(buf, fromSec, toSec);
  const ff = await loadFfmpeg().catch(() => null);
  if (ff) {
    try {
      await ff.writeFile("part.wav", wav);
      const code = await ff.exec(["-i", "part.wav", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "part.m4a"]);
      if (code === 0) {
        const out = (await ff.readFile("part.m4a")) as Uint8Array;
        if (out?.byteLength) return { file: new File([out.slice().buffer as ArrayBuffer], "part.m4a", { type: "audio/mp4" }), ext: "m4a" };
      }
    } catch { /* WAV below */ } finally {
      try { await ff.deleteFile("part.wav"); } catch { /* not written */ }
      try { await ff.deleteFile("part.m4a"); } catch { /* not written */ }
    }
  }
  return { file: new File([wav.slice().buffer as ArrayBuffer], "part.wav", { type: "audio/wav" }), ext: "wav" };
}

/** The file's sound as an AudioBuffer: the browser's decoder first; a video it can't open goes through ffmpeg.wasm. */
export async function decodeFile(file: File, ctx: AudioContext, note: (s: string) => void): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  try {
    return await ctx.decodeAudioData(bytes.slice(0));
  } catch {
    note("Taking the sound out of the video…");
    const ff = await loadFfmpeg().catch(() => null);
    if (!ff) throw new Error("This browser can't read that file. Drop an .mp3, .m4a or .wav instead.");
    const ext = (file.name.split(".").pop() ?? "bin").replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
    const inName = `drop.${ext}`;
    try {
      await ff.writeFile(inName, new Uint8Array(bytes));
      const code = await ff.exec(["-i", inName, "-vn", "-ac", "2", "-ar", "44100", "-t", String(MAX_SEC * 4), "-c:a", "pcm_s16le", "drop.wav"]);
      if (code !== 0) throw new Error("no sound");
      const out = (await ff.readFile("drop.wav")) as Uint8Array;
      return await ctx.decodeAudioData(out.slice().buffer as ArrayBuffer);
    } catch {
      throw new Error("No sound SOCIA could read in that file. Try an .mp3, .m4a or .mp4 with sound.");
    } finally {
      try { await ff.deleteFile(inName); } catch { /* not written */ }
      try { await ff.deleteFile("drop.wav"); } catch { /* not written */ }
    }
  }
}

/** The sound as mono samples, for measuring (lib/audio/features.ts reads any sample rate). */
export function monoOf(buf: AudioBuffer): Float32Array {
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const ch = buf.getChannelData(c); for (let i = 0; i < ch.length; i++) out[i] += ch[i] / buf.numberOfChannels; }
  return out;
}

/** Save one part of a decoded sound to the person's library; the listed track back. Throws with a message to show. */
export async function saveSoundPart(buf: AudioBuffer, fromSec: number, toSec: number, meta: { name: string; sourceName: string }, onProgress?: (note: string, progress: number) => void): Promise<Track> {
  onProgress?.("Cutting the part…", 0);
  const { file, ext } = await encodePart(buf, fromSec, toSec);
  onProgress?.("Saving to your library…", 0);
  const reg = await fetch("/api/studio/tracks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: meta.name.trim() || "Untitled sound", sourceName: meta.sourceName, durationSec: toSec - fromSec, ext }) }).catch(() => null);
  const rj = reg ? ((await reg.json().catch(() => null)) as { id?: string; path?: string; error?: string } | null) : null;
  if (!reg?.ok || !rj?.id || !rj.path) throw new Error(rj?.error ?? "Couldn't save the sound. Try again.");
  await uploadMedia(createClient(), STUDIO_BUCKET, rj.path, file, (sent, total) => onProgress?.("Saving to your library…", total ? sent / total : 0));
  const ok = await fetch(`/api/studio/tracks/${rj.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ uploaded: true }) }).catch(() => null);
  const oj = ok ? ((await ok.json().catch(() => null)) as { track?: Track; error?: string } | null) : null;
  if (!ok?.ok || !oj?.track) throw new Error(oj?.error ?? "The sound was uploaded but couldn't be listed. Reload and look in your library.");
  return oj.track;
}

/** A sound already in the library that is this file's same part: same file name and about the same length. */
export function sameSound(tracks: Track[], sourceName: string, durationSec: number): Track | null {
  const name = sourceName.trim().toLowerCase();
  return tracks.find((t) => (t.sourceName ?? "").trim().toLowerCase() === name && Math.abs(t.durationSec - durationSec) < 1) ?? null;
}
