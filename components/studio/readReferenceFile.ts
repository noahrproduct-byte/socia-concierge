// A video to copy, read in this browser the way the Video editor's reference
// is (components/studio/BriefPanel.tsx): its length, its cuts, a few frames
// and its speech with times. Only those facts go to SOCIA; the video itself is
// never stored (its sound is uploaded for transcription and deleted after).
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { probeClip, ingestClip } from "@/lib/studioClips/ingest";
import { REF_MAX_SEC, type ReferenceInput } from "@/lib/studioClips/reference";
import { STUDIO_BUCKET } from "@/lib/studioClips/types";

const VIDEO_RE = /\.(mp4|mov|m4v|webm)$/i;
const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]+,/, ""));
  r.onerror = () => reject(new Error("Couldn't read a frame."));
  r.readAsDataURL(blob);
});

export type ReadReference = { ok: true; reference: ReferenceInput; note: string | null } | { ok: false; message: string };

export async function readReferenceFile(file: File, viewerId: string, onStage: (stage: string) => void): Promise<ReadReference> {
  if (!(file.type.startsWith("video/") || VIDEO_RE.test(file.name))) return { ok: false, message: "Choose a video file (MP4 or MOV)." };
  try {
    onStage("Opening the video");
    const probe = await probeClip(file);
    if (probe.durationSec > REF_MAX_SEC) return { ok: false, message: `That video is ${Math.round(probe.durationSec)} seconds. Use one of up to 3 minutes.` };
    const ingest = await ingestClip(file, probe, (stage) => onStage(stage === "frames" ? "Finding its cuts and frames" : "Reading its sound"));
    const frames = await Promise.all(ingest.frames.slice(0, 10).map(async (f) => ({ t: f.t, jpeg: await toBase64(f.blob) })));
    let words: ReferenceInput["words"] = null;
    const notes: string[] = [];
    if (ingest.wav) {
      onStage("Listening to what's said");
      try {
        const path = `${viewerId}/quick/${crypto.randomUUID()}/audio.wav`;
        await uploadMedia(createClient(), STUDIO_BUCKET, path, new File([ingest.wav], "audio.wav", { type: "audio/wav" }));
        const res = await fetch("/api/studio/transcribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, purpose: "studio" }) });
        const j = (await res.json().catch(() => null)) as { transcript?: { words?: ReferenceInput["words"] } | null } | null;
        words = j?.transcript?.words?.length ? j.transcript.words : null;
        if (!j?.transcript) notes.push("SOCIA couldn't transcribe its speech, so it follows the picture and timing only.");
      } catch {
        notes.push("SOCIA couldn't transcribe its speech, so it follows the picture and timing only.");
      }
    }
    const cuts = ingest.facts.visual?.sceneCuts ?? null;
    if (!cuts) notes.push("This browser couldn't scan its cuts, so the pace comes from the frames.");
    return {
      ok: true,
      reference: { name: file.name, durationSec: Math.round(probe.durationSec * 10) / 10, width: probe.width, height: probe.height, cuts, frames, words, audio: ingest.facts.audio ? { hasAudio: ingest.facts.audio.hasAudio, level: ingest.facts.audio.level, audibleRatio: ingest.facts.audio.audibleRatio } : null },
      note: notes.join(" ") || null,
    };
  } catch (e) {
    const m = (e as Error)?.message;
    return { ok: false, message: m === "unsupported" ? "This browser can't read that file. Export it as an H.264 MP4 and try again." : "SOCIA couldn't read that video. Try an MP4." };
  }
}
