"use client";

// Make a video your way (Growth/Pro): write what you want, add a reference
// video to copy, or both. SOCIA cuts these clips to follow it and opens the
// cut in the editor. The reference is read here in the browser (its length,
// every cut, a few frames and its speech with times); only those facts are
// sent, and the reference itself is never uploaded or kept.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clapperboard, Film, Loader2, PenLine, Undo2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { probeClip, ingestClip } from "@/lib/studioClips/ingest";
import { REF_MAX_SEC, PROMPT_MAX } from "@/lib/studioClips/reference";
import { AUTO_IMPROVE_TIMEOUT_MS, shouldAutoImprove } from "@/lib/studioClips/enhancePrompt";
import { STUDIO_BUCKET, type StudioBuild } from "@/lib/studioClips/types";
import { VOICE_NOTES_MAX } from "@/lib/studioClips/types";

type Reference = {
  name: string; durationSec: number; width: number | null; height: number | null;
  cuts: number[] | null; frames: { t: number; jpeg: string }[];
  words: { text: string; startMs: number; endMs: number }[] | null;
  audio: { hasAudio: boolean; level: string; audibleRatio: number | null } | null;
};
type Past = { id: string; title: string; referenceName: string | null; createdAt: string };

const VIDEO_RE = /\.(mp4|mov|m4v|webm)$/i;

const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]+,/, ""));
  r.onerror = () => reject(new Error("Couldn't read a frame."));
  r.readAsDataURL(blob);
});

export default function BriefPanel({ projectId, viewerId, canMake, onOpen, beforeMake, heading = "Make a video your way", noClipsNote, initialPrompt }: {
  /** null: no clips yet (the Video editor shows this panel before any are added) */
  projectId: string | null; viewerId: string;
  /** null = plan unknown yet; false = not on this plan */ canMake: boolean | null;
  onOpen: (buildId: string, title: string) => void;
  /** run first (the Video editor understands new clips here); returns an error to show, or null to go on */
  beforeMake?: (say: (step: string) => void) => Promise<string | null>;
  heading?: string;
  /** what to say while there are no clips */
  noClipsNote?: string;
  /** a prompt to start from (a video idea from the Dashboard) */
  initialPrompt?: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  useEffect(() => { if (initialPrompt) setPrompt(initialPrompt); }, [initialPrompt]);
  const [ref, setRef] = useState<Reference | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [refNote, setRefNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [past, setPast] = useState<Past[]>([]);
  const [drag, setDrag] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  // Improve the prompt: what it replaced (for Undo) and what it added.
  const [improving, setImproving] = useState(false);
  const [improved, setImproved] = useState<{ before: string; after: string; added: string[]; auto?: boolean } | null>(null);
  // "Use my words": the text the person chose to keep as written, so Make the video doesn't improve it again.
  const [ownWords, setOwnWords] = useState<string | null>(null);
  // "Add a voiceover" and what it should say (Noah, 2026-11-12): a voice only when the person asks.
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceNotes, setVoiceNotes] = useState("");

  const loadPast = useCallback(async () => {
    if (!projectId) { setPast([]); return; }
    const res = await fetch(`/api/studio/projects/${projectId}/brief`).catch(() => null);
    const j = res?.ok ? ((await res.json().catch(() => null)) as { builds?: Past[] } | null) : null;
    setPast(j?.builds ?? []);
  }, [projectId]);
  useEffect(() => { void loadPast(); }, [loadPast]);

  const readReference = useCallback(async (file: File) => {
    if (!(file.type.startsWith("video/") || VIDEO_RE.test(file.name))) { setRefNote("Choose a video file (MP4 or MOV)."); return; }
    setRef(null); setRefNote(null); setError(null);
    try {
      setReading("Opening the video");
      const probe = await probeClip(file);
      if (probe.durationSec > REF_MAX_SEC) { setReading(null); setRefNote(`That video is ${Math.round(probe.durationSec)} seconds. Use a reference of up to 3 minutes.`); return; }
      const ingest = await ingestClip(file, probe, (stage) => setReading(stage === "frames" ? "Finding its cuts and frames" : "Reading its sound"));
      const frames = await Promise.all(ingest.frames.slice(0, 10).map(async (f) => ({ t: f.t, jpeg: await toBase64(f.blob) })));
      // Its speech, with times, through the same transcription Quick Analyze uses; the audio file is deleted after.
      let words: Reference["words"] = null;
      const notes: string[] = [];
      if (ingest.wav) {
        setReading("Listening to what's said");
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
      const cuts = ingest.facts.visual?.sceneCuts ?? null;
      if (!cuts) notes.push("This browser couldn't scan its cuts, so the pace comes from the frames.");
      setRef({ name: file.name, durationSec: Math.round(probe.durationSec * 10) / 10, width: probe.width, height: probe.height, cuts, frames, words, audio: ingest.facts.audio ? { hasAudio: ingest.facts.audio.hasAudio, level: ingest.facts.audio.level, audibleRatio: ingest.facts.audio.audibleRatio } : null });
      setRefNote(notes.join(" ") || null);
    } catch (e) {
      const m = (e as Error)?.message;
      setRefNote(m === "unsupported" ? "This browser can't read that file. Export it as an H.264 MP4 and try again." : "SOCIA couldn't read that video. Try an MP4.");
    } finally {
      setReading(null);
    }
  }, [viewerId]);

  // One call to the improver, with an optional time limit; null when it can't be reached or is too slow.
  const fetchImproved = async (text: string, timeoutMs?: number): Promise<{ prompt?: string; added?: string[]; error?: string; ok: boolean } | null> => {
    if (!projectId) return null;
    const ctl = new AbortController();
    const timer = timeoutMs ? setTimeout(() => ctl.abort(), timeoutMs) : null;
    try {
      const res = await fetch(`/api/studio/projects/${projectId}/brief/enhance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: text.trim(), hasReference: Boolean(ref) }), signal: ctl.signal });
      const j = (await res.json().catch(() => null)) as { prompt?: string; added?: string[]; error?: string } | null;
      return { ...(j ?? {}), ok: res.ok && Boolean(j?.prompt) };
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  // Rewrites the prompt from what SOCIA saw in the clips. New clips are understood
  // first, as Make the video does, so the brief can name real shots.
  const improve = async () => {
    if (!projectId) return;
    setImproving(true); setError(null);
    try {
      if (beforeMake) {
        const err = await beforeMake(setStep);
        setStep(null);
        if (err) { setError(err); return; }
      }
      const before = prompt;
      const j = await fetchImproved(before);
      if (!j) { setError("Couldn't reach SOCIA. Try again."); return; }
      if (!j.ok || !j.prompt) { setError(j.error ?? "SOCIA couldn't improve that prompt. Try again."); return; }
      setPrompt(j.prompt);
      setOwnWords(null);
      setImproved({ before, after: j.prompt, added: j.added ?? [] });
    } finally {
      setImproving(false);
    }
  };

  const make = async () => {
    if (!projectId) return;
    setBusy(true); setError(null);
    try {
      if (beforeMake) {
        const err = await beforeMake(setStep);
        setStep(null);
        if (err) { setError(err); return; }
      }
      // Every prompt is improved first, from what is in the clips (the length, the first
      // shot, the order, the ending). If the improver fails or is slow, the cut is made
      // from the person's own words and nothing more is said.
      let brief = prompt;
      if (shouldAutoImprove({ prompt, improvedText: improved?.after, ownWords })) {
        setStep("Improving the prompt");
        const better = await fetchImproved(prompt, AUTO_IMPROVE_TIMEOUT_MS);
        if (better?.ok && better.prompt) {
          setImproved({ before: prompt, after: better.prompt, added: better.added ?? [], auto: true });
          setPrompt(better.prompt);
          brief = better.prompt;
        }
        setStep(null);
      }
      const res = await fetch(`/api/studio/projects/${projectId}/brief`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: brief.trim() || null, reference: ref, ...(voiceOn ? { voiceover: { on: true, notes: voiceNotes.trim() || null } } : {}) }) });
      const j = (await res.json().catch(() => null)) as { build?: StudioBuild; error?: string } | null;
      if (!res.ok || !j?.build) { setError(j?.error ?? "SOCIA couldn't make that cut. Try again."); return; }
      void loadPast();
      onOpen(j.build.id, prompt.trim().split(/\n/)[0]?.slice(0, 70) || (ref ? `Like “${ref.name}”` : "Your video"));
    } catch {
      setError("Couldn't reach SOCIA. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const ready = Boolean(projectId) && (prompt.trim().length >= 3 || ref) && !reading && !busy && !improving;
  const canImprove = Boolean(projectId) && prompt.trim().length >= 3 && !busy && !improving && !reading;
  const shots = ref?.cuts ? ref.cuts.length + 1 : null;

  return (
    <section className="ov-card cbp cbr" aria-labelledby="cbr-h">
      <div className="cbp-head">
        <h3 id="cbr-h"><Clapperboard size={15} /> {heading}</h3>
        <span className="cbp-muted">From these clips</span>
      </div>
      <p className="cbp-muted">Write what you want, add a video for SOCIA to copy, or both. SOCIA copies the reference&apos;s length, pace, order of shots and on-screen text style using your clips, never its footage, then opens the cut in the editor.</p>

      {canMake === false ? (
        <p className="cb-locked"><Clapperboard size={13} /> Making a video from a prompt or a reference is included from Starter. <Link href="/pricing">See plans</Link></p>
      ) : (
        <>
          <label className="cba-cap">
            <span>What you want (optional with a reference)</span>
            <textarea value={prompt} rows={Math.min(10, Math.max(3, Math.ceil(prompt.length / 90) + 1))} maxLength={PROMPT_MAX} disabled={busy || improving} placeholder="For example: 20 seconds, open on the cheese pull, three quick cuts of the oven, end on the menu board with 'Open till 10'." onChange={(e) => { setPrompt(e.target.value); setOwnWords(null); }} />
          </label>
          <div className="cbr-improve">
            <button type="button" className="ov-btn ghost small" disabled={!canImprove} onClick={() => void improve()}>
              {improving ? <Loader2 size={13} className="spin" /> : <PenLine size={13} />} {improving ? step ?? "Improving the prompt…" : "Improve the prompt"}
            </button>
            {improved && improved.after === prompt ? (
              <>
                <button type="button" className="ov-btn ghost small" onClick={() => { setPrompt(improved.before); setOwnWords(improved.before); setImproved(null); }}><Undo2 size={13} /> Use my words</button>
                <small>{improved.auto ? "Improved by SOCIA. " : ""}{improved.added.length ? `Added ${improved.added.join(", ")}. ` : ""}{improved.auto ? "Use my words brings yours back for the next cut." : "Change anything before you make it."}</small>
              </>
            ) : (
              <small>{!projectId ? "Add clips first, so SOCIA can use what's in them." : ownWords != null && ownWords === prompt ? "SOCIA will use your words as written." : "SOCIA improves every prompt when you make the video, from what's in your clips: the length, the first shot, the order and the ending. It doesn't count as a video."}</small>
            )}
          </div>

          <div className="cbr-voice">
            <label className="cbb-check"><input type="checkbox" checked={voiceOn} disabled={busy} onChange={(e) => setVoiceOn(e.target.checked)} /> Add a voiceover</label>
            {voiceOn && (
              <label className="cba-cap">
                <span>What should the voiceover say? (optional)</span>
                <textarea value={voiceNotes} rows={3} maxLength={VOICE_NOTES_MAX} disabled={busy} placeholder="Details about your business, the offer, the story or the tone. For example: family run since 1998, dough stretched by hand every morning, open till 10 on Fridays." onChange={(e) => setVoiceNotes(e.target.value)} />
              </label>
            )}
            {voiceOn && <p className="cbp-muted">SOCIA writes the voiceover from these notes and what&apos;s in your clips, and adds nothing you didn&apos;t say. Counts one voiceover on your plan.</p>}
          </div>

          <div className="cbr-ref">
            <span className="cbr-ref-label">Reference video (optional)</span>
            {ref ? (
              <div className="cbr-ref-card">
                <Film size={14} aria-hidden />
                <span><b>{ref.name}</b><small>{ref.durationSec}s{shots ? ` · ${shots} shots` : ""}{ref.words ? " · speech heard" : ""}</small></span>
                <button type="button" className="ov-x" aria-label="Remove the reference" disabled={busy} onClick={() => { setRef(null); setRefNote(null); }}><X size={14} /></button>
              </div>
            ) : (
              <div
                className={`cbr-drop${drag ? " drag" : ""}`} role="button" tabIndex={0}
                onClick={() => !reading && input.current?.click()}
                onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !reading) { e.preventDefault(); input.current?.click(); } }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f && !reading) void readReference(f); }}
              >
                {reading ? <><Loader2 size={14} className="spin" /> {reading}…</> : <><Upload size={14} /> Drop a video to copy, or click to choose (up to 3 minutes)</>}
              </div>
            )}
            <input ref={input} type="file" hidden accept="video/mp4,video/quicktime,video/webm,video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) void readReference(f); e.target.value = ""; }} />
            {refNote && <small className="cbr-note">{refNote}</small>}
          </div>

          {error && <p className="cbb-err" role="alert"><AlertTriangle size={12} /> {error}</p>}
          <div className="cbp-foot">
            <button type="button" className="ov-btn primary" disabled={!ready} onClick={() => void make()}>
              {busy ? <Loader2 size={14} className="spin" /> : <Clapperboard size={14} />} {busy ? step ?? (ref ? "Studying the reference and cutting…" : "Cutting…") : "Make the video"}
            </button>
            {!projectId && noClipsNote && <p className="cbp-muted">{noClipsNote}</p>}
            {projectId && !busy && !ref && prompt.trim().length < 3 && <p className="cbp-muted">Write what you want above, or add a reference video, to make it.</p>}
            <p className="cbp-muted">Opens in the editor to change anything. Making it counts one AI-made video on your plan, as with any of SOCIA&apos;s cuts; editing and exporting it after that don&apos;t count again.</p>
          </div>
        </>
      )}

      {past.length > 0 && (
        <ul className="cbr-past" aria-label="Videos made from a brief">
          {past.map((p) => (
            <li key={p.id}>
              <span><b>{p.title}</b><small>{new Date(p.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}{p.referenceName ? ` · copies ${p.referenceName}` : ""}</small></span>
              <button type="button" className="ov-btn ghost small" onClick={() => onOpen(p.id, p.title)}>Open</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
