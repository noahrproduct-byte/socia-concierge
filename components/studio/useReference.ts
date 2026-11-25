"use client";

// The reference video for a cut: a video the person wants theirs made like.
// It is read here in the browser (its length, every cut, a few frames and
// its speech with times); only those facts go to SOCIA, and the video itself
// is never uploaded or kept. Four ways in, all read the same way:
//   - a file the person drops or chooses,
//   - a Reel link, found through Instagram's official Business Discovery read
//     (app/api/studio/reference/reel), asking for the account when the link
//     doesn't carry it,
//   - one of the person's own clips (GET /api/studio/clips/[id] gives its file),
//   - a Reel handed over from Discover or the editor's inspiration row.
// A Reel keeps where it came from (lib/studioClips/referenceSource.ts ReelSource:
// its link, creator, cover, caption, numbers) so the card can show it, and the
// paid part of reading it (its speech) is kept per Reel in this browser, so
// going back and forth doesn't pay twice.
import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { probeClip, ingestClip } from "@/lib/studioClips/ingest";
import { REF_MAX_SEC } from "@/lib/studioClips/reference";
import { STUDIO_BUCKET } from "@/lib/studioClips/types";
import { readCached, writeCached, type ReelSource } from "@/lib/studioClips/referenceSource";
import { measureReferenceMusic } from "@/lib/music/referenceAudio";
import type { ReferenceMusic } from "@/lib/music/referenceMusic";

export type Reference = {
  name: string; durationSec: number; width: number | null; height: number | null;
  cuts: number[] | null; frames: { t: number; jpeg: string }[];
  words: { text: string; startMs: number; endMs: number }[] | null;
  audio: { hasAudio: boolean; level: string; audibleRatio: number | null } | null;
  /** its music, measured in this browser (lib/music/referenceMusic.ts); null when it has no sound to read */
  music: ReferenceMusic | null;
  /** where it came from, for the card */
  from: "file" | "link" | "clip" | "discover";
};

/** A Reel that couldn't be studied: what is known about it, and why. */
export type Unstudied = { source: ReelSource; why: string };

const VIDEO_RE = /\.(mp4|mov|m4v|webm)$/i;

const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]+,/, ""));
  r.onerror = () => reject(new Error("Couldn't read a frame."));
  r.readAsDataURL(blob);
});

type ReelAnswer = { media?: string; reel?: ReelSource; error?: string; code?: string };

export function useReference(viewerId: string) {
  const [ref, setRef] = useState<Reference | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** The Reel the reference is, when it is one: its creator, cover and link for the card. */
  const [source, setSource] = useState<ReelSource | null>(null);
  /** A pasted link whose account Instagram needs to be told. */
  const [needHandle, setNeedHandle] = useState(false);
  /** The last read asked for: an older one finishing late is dropped. */
  const ticket = useRef(0);

  const readFile = useCallback(async (file: File, from: Reference["from"] = "file", t = ++ticket.current, code: string | null = null) => {
    if (!(file.type.startsWith("video/") || VIDEO_RE.test(file.name))) { setNote("Choose a video file (MP4 or MOV)."); return; }
    setRef(null); setNote(null);
    if (from === "file" || from === "clip") setSource(null);
    try {
      setReading("Opening the video");
      const probe = await probeClip(file);
      if (t !== ticket.current) return;
      if (probe.durationSec > REF_MAX_SEC) { setReading(null); setNote(`That video is ${Math.round(probe.durationSec)} seconds. Use a reference of up to 3 minutes.`); return; }
      const ingest = await ingestClip(file, probe, (stage) => { if (t === ticket.current) setReading(stage === "frames" ? "Finding its cuts and frames" : "Reading its sound"); });
      const frames = await Promise.all(ingest.frames.slice(0, 10).map(async (f) => ({ t: f.t, jpeg: await toBase64(f.blob) })));
      // Its speech, with times, through the same transcription Quick Analyze uses (the audio file is deleted after);
      // a Reel read before in this browser keeps what was heard, so it isn't paid for twice.
      const cached = readCached(code);
      let words: Reference["words"] = cached ? cached.words : null;
      const notes: string[] = [];
      if (!cached && ingest.wav) {
        if (t === ticket.current) setReading("Listening to what's said");
        try {
          const path = `${viewerId}/quick/${crypto.randomUUID()}/audio.wav`;
          await uploadMedia(createClient(), STUDIO_BUCKET, path, new File([ingest.wav], "audio.wav", { type: "audio/wav" }));
          const res = await fetch("/api/studio/transcribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, purpose: "studio" }) });
          const j = (await res.json().catch(() => null)) as { transcript?: { words?: Reference["words"] } | null } | null;
          words = j?.transcript?.words?.length ? j.transcript.words : null;
          if (!j?.transcript) notes.push("SOCIA couldn't transcribe its speech, so it follows the picture and timing only.");
        } catch {
          notes.push("SOCIA couldn't transcribe its speech, so it follows the picture and timing only.");
        }
      }
      if (t !== ticket.current) return;
      const cuts = ingest.facts.visual?.sceneCuts ?? cached?.cuts ?? null;
      if (!cuts) notes.push("This browser couldn't scan its cuts, so the pace comes from the frames.");
      const audio = ingest.facts.audio ? { hasAudio: ingest.facts.audio.hasAudio, level: ingest.facts.audio.level, audibleRatio: ingest.facts.audio.audibleRatio } : cached?.audio ?? null;
      const durationSec = Math.round(probe.durationSec * 10) / 10;
      // Its music: tempo, beat, where the energy lifts, whether its cuts follow the beat (free, in this browser).
      let music = cached?.music ?? null;
      if (!music && ingest.wav) {
        if (t === ticket.current) setReading("Listening to its music");
        music = await measureReferenceMusic(ingest.wav, { words, cuts });
      }
      if (t !== ticket.current) return;
      if (!cached || (music && !cached.music)) writeCached(code, { durationSec, cuts, words, audio, music });
      setRef({ name: file.name, durationSec, width: probe.width, height: probe.height, cuts, frames, words, audio, music, from });
      setNote(notes.join(" ") || null);
    } catch (e) {
      if (t !== ticket.current) return;
      const m = (e as Error)?.message;
      setNote(m === "unsupported" ? "This browser can't read that file. Export it as an H.264 MP4 and try again." : "SOCIA couldn't read that video. Try an MP4.");
    } finally {
      if (t === ticket.current) setReading(null);
    }
  }, [viewerId]);

  /** A video SOCIA serves (a signed Reel, one of the person's clips), fetched and read like a dropped file. */
  const readServed = useCallback(async (url: string, name: string, from: Reference["from"], t = ++ticket.current, code: string | null = null): Promise<boolean> => {
    setRef(null); setNote(null); setReading("Getting the video");
    try {
      const res = await fetch(url);
      if (!res.ok) { const j = (await res.json().catch(() => null)) as { error?: string } | null; throw new Error(j?.error ?? "SOCIA couldn't get that video."); }
      const blob = await res.blob();
      if (t !== ticket.current) return false;
      await readFile(new File([blob], name.replace(/[^\w.@ -]/g, "") || "reference.mp4", { type: blob.type.startsWith("video/") ? blob.type : "video/mp4" }), from, t, code);
      return true;
    } catch (e) {
      if (t === ticket.current) { setReading(null); setNote(`${(e as Error).message} Upload it as a file instead, or make the video from your prompt alone.`); }
      return false;
    }
  }, [readFile]);

  /**
   * A Reel by its link, found through Instagram's official read (the account name when the link doesn't carry it).
   * `known` is what Discover already knew about it, shown while it's found; `served` is a video link Discover was
   * given, tried first. When the video can't be had, the card says it wasn't studied and the cut follows the prompt.
   */
  const readReel = useCallback(async (link: string, opts: { handle?: string | null; known?: ReelSource | null; served?: string | null; from?: Reference["from"] } = {}) => {
    const t = ++ticket.current;
    const from = opts.from ?? "link";
    setRef(null); setNote(null); setNeedHandle(false); setReading("Getting the Reel");
    setSource(opts.known ?? null);
    const code = opts.known?.code ?? null;
    const name = (s: ReelSource | null | undefined) => `${s?.handle ? `@${s.handle}` : s?.account ?? "Instagram"} ${s?.format ?? "Reel"}.mp4`;
    if (opts.served && await readServed(opts.served, name(opts.known), from, t, code)) return;
    if (t !== ticket.current) return;
    const lookup = async (fresh: boolean): Promise<ReelAnswer | null> => {
      const q = new URLSearchParams({ link, ...(opts.handle ? { handle: opts.handle } : {}), ...(fresh ? { fresh: "1" } : {}) });
      const res = await fetch(`/api/studio/reference/reel?${q}`).catch(() => null);
      return res ? ((await res.json().catch(() => null)) as ReelAnswer | null) : null;
    };
    setReading("Finding the Reel on Instagram");
    let found = await lookup(false);
    if (t !== ticket.current) return;
    if (found?.reel) setSource(found.reel);
    if (found?.media && !(await readServed(found.media, name(found.reel ?? opts.known), from, t, found.reel?.code ?? code))) {
      // A saved video link may have expired: read the account again, once.
      if (t !== ticket.current) return;
      found = await lookup(true);
      if (found?.media) await readServed(found.media, name(found.reel ?? opts.known), from, t, found.reel?.code ?? code);
      return;
    }
    if (found?.media) return;
    setReading(null);
    if (found?.code === "need_handle") setNeedHandle(true);
    setNote(found?.error ?? "SOCIA couldn't be reached. Check your connection and try again.");
  }, [readServed]);

  /** One of the person's own clips. */
  const readClip = useCallback(async (clipId: string, name: string) => {
    const t = ++ticket.current;
    setRef(null); setNote(null); setSource(null); setReading("Getting the clip");
    const res = await fetch(`/api/studio/clips/${clipId}`).catch(() => null);
    const j = res ? ((await res.json().catch(() => null)) as { url?: string; error?: string } | null) : null;
    if (t !== ticket.current) return;
    if (!res?.ok || !j?.url) { setReading(null); setNote(j?.error ?? "SOCIA couldn't get that clip."); return; }
    await readServed(j.url, name, "clip", t);
  }, [readServed]);

  const clear = useCallback(() => { ticket.current++; setRef(null); setNote(null); setReading(null); setSource(null); setNeedHandle(false); }, []);

  return { ref, reading, note, source, needHandle, readFile, readServed, readReel, readClip, clear };
}
