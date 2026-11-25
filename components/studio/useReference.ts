"use client";

// The reference video for a cut: a video the person wants theirs made like.
// It is read here in the browser (its length, every cut, a few frames and
// its speech with times); only those facts go to SOCIA, and the video itself
// is never uploaded or kept. Four ways in, all read the same way:
//   - a file the person drops or chooses,
//   - a Reel link, when SOCIA can reach that Reel through official data
//     (POST /api/studio/reference/link: the person's own Reels and the ones on
//     Discover),
//   - one of the person's own clips (GET /api/studio/clips/[id] gives its file),
//   - a Reel handed over from Discover, the Planner, Ask SOCIA, a video idea or the editor's inspiration row
//     (a link SOCIA signed for this viewer, or found through the official read: readReel).
// Moved from BriefPanel so the Video editor's one screen reads references the same way.
import { useCallback, useEffect, useRef, useState } from "react";
import { readCached, writeCached, type ReelSource } from "@/lib/studioClips/referenceSource";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { probeClip, ingestClip } from "@/lib/studioClips/ingest";
import { REF_MAX_SEC } from "@/lib/studioClips/reference";
import { STUDIO_BUCKET } from "@/lib/studioClips/types";

export type Reference = {
  name: string; durationSec: number; width: number | null; height: number | null;
  cuts: number[] | null; frames: { t: number; jpeg: string }[];
  words: { text: string; startMs: number; endMs: number }[] | null;
  audio: { hasAudio: boolean; level: string; audibleRatio: number | null } | null;
  /** where it came from, for the card */
  from: "file" | "link" | "clip" | "discover";
};

const VIDEO_RE = /\.(mp4|mov|m4v|webm)$/i;

const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]+,/, ""));
  r.onerror = () => reject(new Error("Couldn't read a frame."));
  r.readAsDataURL(blob);
});

export function useReference(viewerId: string) {
  const [ref, setRef] = useState<Reference | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** The last read asked for: an older one finishing late is dropped. */
  const ticket = useRef(0);
  /** The video read last, for Preview (a link to the file in this tab only). */
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const readFile = useCallback(async (file: File, from: Reference["from"] = "file", t = ++ticket.current, code: string | null = null): Promise<boolean> => {
    if (!(file.type.startsWith("video/") || VIDEO_RE.test(file.name))) { setNote("Choose a video file (MP4 or MOV)."); return false; }
    setRef(null); setNote(null);
    // What an earlier read of this Reel found (lib/studioClips/referenceSource.ts): its speech isn't paid for twice.
    const cached = readCached(code);
    try {
      setReading("Opening the video");
      const probe = await probeClip(file);
      if (t !== ticket.current) return false;
      if (probe.durationSec > REF_MAX_SEC) { setReading(null); setNote(`That video is ${Math.round(probe.durationSec)} seconds. Use a reference of up to 3 minutes.`); return false; }
      const ingest = await ingestClip(file, probe, (stage) => { if (t === ticket.current) setReading(stage === "frames" ? "Finding its cuts and frames" : "Reading its sound"); });
      const frames = await Promise.all(ingest.frames.slice(0, 10).map(async (f) => ({ t: f.t, jpeg: await toBase64(f.blob) })));
      // Its speech, with times, through the same transcription Quick Analyze uses; the audio file is deleted after.
      let words: Reference["words"] = cached?.words ?? null;
      const notes: string[] = [];
      if (ingest.wav && !cached) {
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
      if (t !== ticket.current) return false;
      const cuts = ingest.facts.visual?.sceneCuts ?? cached?.cuts ?? null;
      if (!cuts) notes.push("This browser couldn't scan its cuts, so the pace comes from the frames.");
      const durationSec = Math.round(probe.durationSec * 10) / 10;
      const audio = ingest.facts.audio ? { hasAudio: ingest.facts.audio.hasAudio, level: ingest.facts.audio.level, audibleRatio: ingest.facts.audio.audibleRatio } : null;
      setRef({ name: file.name, durationSec, width: probe.width, height: probe.height, cuts, frames, words, audio, from });
      if (!cached) writeCached(code, { durationSec, cuts, words, audio });
      setPreview(URL.createObjectURL(file));
      setNote(notes.join(" ") || null);
      return true;
    } catch (e) {
      if (t !== ticket.current) return false;
      const m = (e as Error)?.message;
      setNote(m === "unsupported" ? "This browser can't read that file. Export it as an H.264 MP4 and try again." : "SOCIA couldn't read that video. Try an MP4.");
      return false;
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
      return await readFile(new File([blob], name.replace(/[^\w.@ -]/g, "") || "reference.mp4", { type: blob.type.startsWith("video/") ? blob.type : "video/mp4" }), from, t, code);
    } catch (e) {
      if (t === ticket.current) { setReading(null); setNote(`${(e as Error).message} Upload it as a file instead, or make the video from your prompt alone.`); }
      return false;
    }
  }, [readFile]);

  /**
   * A Reel handed over (Discover, the Planner, Ask SOCIA, a video idea): its video is fetched through SOCIA's
   * official Instagram read (the link handed over, then GET /api/studio/reference/reel, then once more with a
   * fresh read) and read like a dropped file. When it can't be fetched, nothing is read and the note says so:
   * SOCIA never claims to have studied a video it couldn't get.
   */
  const readReel = useCallback(async (reel: ReelSource, served: string | null): Promise<boolean> => {
    const t = ++ticket.current;
    const name = `${reel.handle ? `@${reel.handle}` : "reel"} ${reel.code ?? ""}.mp4`.trim();
    if (served && (await readServed(served, name, "discover", t, reel.code))) return true;
    if (t !== ticket.current) return false;
    let lastError: string | null = null;
    for (const fresh of [false, true]) {
      setRef(null); setReading("Getting the Reel");
      const q = new URLSearchParams({ link: reel.link, ...(reel.handle ? { handle: reel.handle } : {}), ...(fresh ? { fresh: "1" } : {}) });
      const res = await fetch(`/api/studio/reference/reel?${q}`).catch(() => null);
      const j = res ? ((await res.json().catch(() => null)) as { media?: string; error?: string; code?: string } | null) : null;
      if (t !== ticket.current) return false;
      if (j?.media && (await readServed(j.media, name, "discover", t, reel.code))) return true;
      if (t !== ticket.current) return false;
      lastError = j?.error ?? lastError;
      // Only an expired video link is worth a fresh read; any other answer won't change.
      if (j?.code && j.code !== "no_video") break;
    }
    setReading(null);
    // The lookup's own answer already says to upload the file when that's the way; it isn't said twice.
    setNote(`${lastError ?? "SOCIA couldn't get this Reel's video. Upload it as a file to use it as the reference."} SOCIA hasn't studied its footage, so the video follows your prompt.`);
    return false;
  }, [readServed]);

  /** A pasted Reel link: SOCIA finds it among the Reels it can reach through official data. */
  const readLink = useCallback(async (link: string) => {
    const t = ++ticket.current;
    setRef(null); setNote(null); setReading("Finding that Reel");
    const res = await fetch("/api/studio/reference/link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: link.trim() }) }).catch(() => null);
    const j = res ? ((await res.json().catch(() => null)) as { url?: string; name?: string; error?: string } | null) : null;
    if (t !== ticket.current) return;
    if (!res?.ok || !j?.url) { setReading(null); setNote(j?.error ?? "SOCIA couldn't be reached. Check your connection and try again."); return; }
    await readServed(j.url, j.name ?? "reference.mp4", "link", t);
  }, [readServed]);

  /** One of the person's own clips. */
  const readClip = useCallback(async (clipId: string, name: string) => {
    const t = ++ticket.current;
    setRef(null); setNote(null); setReading("Getting the clip");
    const res = await fetch(`/api/studio/clips/${clipId}`).catch(() => null);
    const j = res ? ((await res.json().catch(() => null)) as { url?: string; error?: string } | null) : null;
    if (t !== ticket.current) return;
    if (!res?.ok || !j?.url) { setReading(null); setNote(j?.error ?? "SOCIA couldn't get that clip."); return; }
    await readServed(j.url, name, "clip", t);
  }, [readServed]);

  const clear = useCallback(() => { ticket.current++; setRef(null); setNote(null); setReading(null); setPreview(null); }, []);

  return { ref, reading, note, preview, readFile, readServed, readReel, readLink, readClip, clear };
}
