// What Generate Caption sees and hears in the post's media, in the browser:
// a handful of frames from the video (or the images themselves), the sound
// measured from its samples, and an automatic transcript of what is said
// (the WAV goes to private storage, is transcribed, then deleted). Cached per
// media set, so regenerating or refining never repeats the work. Client only.
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { extractFrames, imageFrames } from "@/lib/studio";
import { decodeToMono16k } from "@/lib/audio/decode";
import { describeQuickAudio, quickAudioFrom } from "@/lib/audio/quick";
import type { MediaItem } from "./types";

export type Seen = {
  kind: "video" | "image" | "carousel" | "none";
  count: number;
  durationSec: number | null;
  frames: string[];
  frameTimes: number[];
  /** public media URLs, sent only when the browser couldn't read the images */
  imageUrls: string[];
  transcript: string | null;
  audio: string | null;
  /** what SOCIA could and couldn't take in, said plainly under its read */
  notes: string[];
};

export type SeePhase = "seeing" | "listening" | "transcribing";

const cache = new Map<string, Seen>();
const MAX_FRAMES = 8;

export const mediaKey = (media: MediaItem[]): string => media.map((m) => `${m.id}:${m.url ?? m.path ?? ""}`).join("|");

/** Evenly spaced picks, first and last included. */
function pick<T>(xs: T[], n: number): number[] {
  if (xs.length <= n) return xs.map((_, i) => i);
  return Array.from({ length: n }, (_, i) => Math.round((i * (xs.length - 1)) / (n - 1)));
}

export async function seeMedia(
  media: MediaItem[],
  opts: {
    userId: string;
    fileFor: (id: string) => File | null;
    onPhase?: (p: SeePhase) => void;
    /** already heard in Content Studio for this draft: no second transcription */
    known?: { transcript: string | null; audio: string | null } | null;
  },
): Promise<Seen> {
  const key = mediaKey(media);
  const hit = cache.get(key);
  if (hit) return hit;

  const video = media.find((m) => m.kind === "video") ?? null;
  const images = media.filter((m) => m.kind === "image");
  const seen: Seen = {
    kind: video ? "video" : images.length >= 2 ? "carousel" : images.length ? "image" : "none",
    count: media.length, durationSec: video?.duration ?? null,
    frames: [], frameTimes: [], imageUrls: [], transcript: null, audio: null, notes: [],
  };
  if (seen.kind === "none") return seen;

  opts.onPhase?.("seeing");
  if (video) {
    const src = opts.fileFor(video.id) ?? video.url;
    if (!src) {
      seen.notes.push("The video is still uploading, so SOCIA wrote without seeing it.");
      return seen;
    }
    try {
      const fr = await extractFrames(src, () => {});
      for (const i of pick(fr.frames, MAX_FRAMES)) { seen.frames.push(fr.frames[i]); seen.frameTimes.push(fr.times[i] ?? 0); }
      if (!seen.durationSec && fr.duration) seen.durationSec = fr.duration;
    } catch {
      seen.notes.push("This browser couldn't sample the video's frames, so SOCIA wrote from its sound and your details.");
    }

    if (opts.known?.transcript || opts.known?.audio) {
      seen.transcript = opts.known.transcript?.slice(0, 4000) ?? null;
      seen.audio = opts.known.audio ?? null;
      if (!seen.transcript) seen.notes.push("Content Studio has no transcript of this video, so SOCIA wrote from what it saw.");
      cache.set(key, seen);
      return seen;
    }

    opts.onPhase?.("listening");
    const blob = typeof src === "string" ? await fetch(src).then((r) => (r.ok ? r.blob() : null)).catch(() => null) : src;
    const dec = blob ? await decodeToMono16k(blob).catch(() => null) : null;
    const qa = dec ? quickAudioFrom(dec.pcm, dec.rate) : null;
    if (!dec || !qa) {
      seen.notes.push("This browser couldn't read the video's sound.");
    } else if (!qa.hasAudio) {
      seen.audio = describeQuickAudio(qa);
      seen.notes.push("The video has no audible sound.");
    } else {
      seen.audio = describeQuickAudio(qa);
      opts.onPhase?.("transcribing");
      try {
        const path = `${opts.userId}/quick/${crypto.randomUUID()}/audio.wav`;
        await uploadMedia(createClient(), "studio-sources", path, new File([dec.wav], "audio.wav", { type: "audio/wav" }));
        const res = await fetch("/api/studio/transcribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) });
        const j = (await res.json().catch(() => null)) as { transcript?: { text: string; words: unknown[] } | null; reason?: string } | null;
        if (j?.transcript?.text?.trim()) seen.transcript = j.transcript.text.trim().slice(0, 4000);
        else seen.notes.push(j?.transcript ? "No speech was found in the video." : j?.reason === "not_configured" ? "Speech transcription isn't set up, so SOCIA didn't hear what's said." : "Transcription didn't finish, so SOCIA didn't hear what's said.");
      } catch {
        seen.notes.push("Transcription didn't finish, so SOCIA didn't hear what's said.");
      }
    }
  } else {
    const sources = images.map((m) => opts.fileFor(m.id) ?? m.url).filter((s): s is File | string => Boolean(s));
    if (sources.length < images.length) seen.notes.push("Some images are still uploading, so SOCIA saw only the ready ones.");
    try {
      const fr = await imageFrames(sources);
      seen.frames = fr.frames.slice(0, MAX_FRAMES);
      seen.frameTimes = seen.frames.map((_, i) => i);
    } catch {
      // The server can hand the model the public links instead.
      seen.imageUrls = images.map((m) => m.url).filter((u): u is string => Boolean(u)).slice(0, 10);
      if (!seen.imageUrls.length) seen.notes.push("This browser couldn't read the images, so SOCIA wrote without seeing them.");
    }
  }

  // Only a complete look is worth keeping: a still-uploading file gets a second try.
  if (!seen.notes.some((n) => /uploading/.test(n))) cache.set(key, seen);
  return seen;
}
