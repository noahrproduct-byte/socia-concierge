"use client";

// Make a video your way (Growth/Pro): write what you want, add a reference
// video to copy, or both. SOCIA cuts these clips to follow it and opens the
// cut in the editor. The reference is read here in the browser (its length,
// every cut, a few frames and its speech with times); only those facts are
// sent, and the reference itself is never uploaded or kept.
import { DIRECTION_OPTIONS, directionFor, directionSummary, withDirection, type DirectionKey, type EditDirection } from "@/lib/studioClips/editDirection";
import type { CreativeStyle } from "@/lib/research/direction";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clapperboard, ExternalLink, Film, Link2, Loader2, PenLine, Play, Undo2, Upload, X } from "lucide-react";
import { cleanHandle, directionChanges, directionFromReference, parseReelLink, readCached, sanitizeSource, writeCached, type ReelSource } from "@/lib/studioClips/referenceSource";
import type { HandoffReference } from "@/lib/studioClips/handoff";
import { useSpeech } from "./useSpeech";
import MicButton from "./MicButton";
import VoiceoverAsk from "./VoiceoverAsk";
import { actionCredits } from "@/lib/credits/config";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { probeClip, ingestClip } from "@/lib/studioClips/ingest";
import { REF_MAX_SEC, PROMPT_MAX } from "@/lib/studioClips/reference";
import { AUTO_IMPROVE_TIMEOUT_MS, shouldAutoImprove } from "@/lib/studioClips/enhancePrompt";
import { STUDIO_BUCKET, type StudioBuild } from "@/lib/studioClips/types";

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

export default function BriefPanel({ projectId, viewerId, canMake, onOpen, beforeMake, heading = "Make a video your way", noClipsNote, initialPrompt, initialReference, initialStyle, autoMake, onAutoMade }: {
  /** true once handed-over clips are all in: make the video without a click (Ask SOCIA's hand-off) */
  autoMake?: boolean;
  /** called when the automatic make has started, so it runs once */
  onAutoMade?: () => void;
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
  /** a Reel to read as the reference (from Discover): a link SOCIA serves for its file when known, and the Reel itself */
  initialReference?: HandoffReference | null;
  /** the creative style chosen in Ask SOCIA: the direction starts from its defaults */
  initialStyle?: CreativeStyle | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState(initialPrompt ?? "");
  // Speaking the brief: what was typed before the microphone was pressed stays; the words said follow it.
  const spokenFrom = useRef("");
  const speech = useSpeech((words) => setPrompt((spokenFrom.current ? `${spokenFrom.current} ${words}` : words).slice(0, PROMPT_MAX)));
  const toggleMic = () => { if (!speech.listening) spokenFrom.current = prompt.trim(); speech.toggle(); };
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
  // The voice picked, and an Auto improved script the person approved (components/studio/VoiceoverAsk.tsx).
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [voiceApproved, setVoiceApproved] = useState(false);
  const [voicePending, setVoicePending] = useState(false);
  // The creative direction before the first cut (lib/studioClips/editDirection.ts): sensible defaults, changed only if the person wants.
  const [direction, setDirection] = useState<EditDirection>(() => directionFor(initialStyle));
  const [directionOpen, setDirectionOpen] = useState(false);
  useEffect(() => { if (initialStyle) setDirection(directionFor(initialStyle)); }, [initialStyle]);
  // Once the person picks a direction themselves, a reference doesn't change it again.
  const directionTouched = useRef(false);
  const [directionNote, setDirectionNote] = useState<string | null>(null);
  // Where the reference came from when it's a Reel (Discover or a pasted link), and whether its video was studied.
  const [source, setSource] = useState<ReelSource | null>(null);
  const [sourceState, setSourceState] = useState<"getting" | "studied" | "unavailable" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [pasted, setPasted] = useState("");
  const [pastedHandle, setPastedHandle] = useState("");
  const [needHandle, setNeedHandle] = useState(false);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const loadPast = useCallback(async () => {
    if (!projectId) { setPast([]); return; }
    const res = await fetch(`/api/studio/projects/${projectId}/brief`).catch(() => null);
    const j = res?.ok ? ((await res.json().catch(() => null)) as { builds?: Past[] } | null) : null;
    setPast(j?.builds ?? []);
  }, [projectId]);
  useEffect(() => { void loadPast(); }, [loadPast]);

  const readReference = useCallback(async (file: File, opts: { code?: string | null } = {}): Promise<boolean> => {
    if (!(file.type.startsWith("video/") || VIDEO_RE.test(file.name))) { setRefNote("Choose a video file (MP4 or MOV)."); return false; }
    setRef(null); setRefNote(null); setError(null);
    // What an earlier read of this Reel found: its speech isn't paid for twice (lib/studioClips/referenceSource.ts).
    const cached = readCached(opts.code ?? null);
    try {
      setReading("Opening the video");
      const probe = await probeClip(file);
      if (probe.durationSec > REF_MAX_SEC) { setReading(null); setRefNote(`That video is ${Math.round(probe.durationSec)} seconds. Use a reference of up to 3 minutes.`); return false; }
      const ingest = await ingestClip(file, probe, (stage) => setReading(stage === "frames" ? "Finding its cuts and frames" : "Reading its sound"));
      const frames = await Promise.all(ingest.frames.slice(0, 10).map(async (f) => ({ t: f.t, jpeg: await toBase64(f.blob) })));
      // Its speech, with times, through the same transcription Quick Analyze uses; the audio file is deleted after.
      let words: Reference["words"] = cached?.words ?? null;
      const notes: string[] = [];
      if (ingest.wav && !cached) {
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
      const cuts = ingest.facts.visual?.sceneCuts ?? cached?.cuts ?? null;
      if (!cuts) notes.push("This browser couldn't scan its cuts, so the pace comes from the frames.");
      const audio = ingest.facts.audio ? { hasAudio: ingest.facts.audio.hasAudio, level: ingest.facts.audio.level, audibleRatio: ingest.facts.audio.audibleRatio } : null;
      const durationSec = Math.round(probe.durationSec * 10) / 10;
      setRef({ name: file.name, durationSec, width: probe.width, height: probe.height, cuts, frames, words, audio });
      if (!cached) writeCached(opts.code ?? null, { durationSec, cuts, words, audio });
      setPreview(URL.createObjectURL(file));
      // The creative direction follows what the reference showed, unless the person already chose.
      if (!directionTouched.current) {
        const set = directionFromReference({ durationSec, cuts, words, audio });
        if (Object.keys(set).length) {
          setDirection((d) => ({ ...d, ...set }) as EditDirection);
          setDirectionNote(`Set from the reference: ${directionChanges(set).join(", ")}. Change any of it.`);
        }
      }
      setRefNote(notes.join(" ") || null);
      return true;
    } catch (e) {
      const m = (e as Error)?.message;
      setRefNote(m === "unsupported" ? "This browser can't read that file. Export it as an H.264 MP4 and try again." : "SOCIA couldn't read that video. Try an MP4.");
      return false;
    } finally {
      setReading(null);
    }
  }, [viewerId]);
  // A Reel as the reference (from Discover, or a pasted link): its video is fetched through SOCIA's authorized
  // Instagram read and read like a dropped file. When it can't be fetched, the Reel stays (link, cover, caption)
  // and the panel says the video wasn't studied; the brief still carries what is known.
  const getReel = useCallback(async (reel: ReelSource, firstUrl: string | null): Promise<void> => {
    setSource(reel); setSourceState("getting"); setRef(null); setRefNote(null); setShowPreview(false);
    const tryUrl = async (url: string) => {
      setReading("Getting the Reel");
      const res = await fetch(url);
      if (!res.ok) return false;
      const blob = await res.blob();
      return readReference(new File([blob], `${reel.handle ? `@${reel.handle}` : "reel"} ${reel.code ?? ""}.mp4`.trim(), { type: blob.type.startsWith("video/") ? blob.type : "video/mp4" }), { code: reel.code });
    };
    const lookup = async (fresh: boolean): Promise<{ media?: string; reel?: ReelSource; error?: string; code?: string } | null> => {
      const q = new URLSearchParams({ link: reel.link, ...(reel.handle ? { handle: reel.handle } : {}), ...(fresh ? { fresh: "1" } : {}) });
      const res = await fetch(`/api/studio/reference/reel?${q}`).catch(() => null);
      return res ? ((await res.json().catch(() => null)) as { media?: string; reel?: ReelSource; error?: string; code?: string } | null) : null;
    };
    try {
      if (firstUrl && (await tryUrl(firstUrl))) { setSourceState("studied"); return; }
      let found = await lookup(false);
      if (found?.reel) setSource((s) => ({ ...(sanitizeSource(found!.reel) ?? reel), structure: s?.structure ?? reel.structure ?? null, thumb: s?.thumb ?? found!.reel!.thumb ?? null }));
      if (found?.media && (await tryUrl(found.media))) { setSourceState("studied"); return; }
      // The saved link to its video can expire: read the account again once.
      if (found?.media || !found?.code) found = await lookup(true);
      if (found?.media && (await tryUrl(found.media))) { setSourceState("studied"); return; }
      if (found?.code === "need_handle") setNeedHandle(true);
      setSourceState("unavailable");
      setRefNote(`${found?.error ?? "SOCIA couldn't get this Reel's video."} SOCIA hasn't studied its footage, so the cut follows your brief${reel.caption ? " and what the Reel's caption says" : ""}.`);
    } catch {
      setSourceState("unavailable");
      setRefNote("SOCIA couldn't get this Reel's video, so it hasn't studied its footage. Upload the Reel as a file, or make it from the brief alone.");
    } finally {
      setReading(null);
    }
  }, [readReference]);

  const fetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialReference) return;
    const reel = initialReference.reel ? sanitizeSource(initialReference.reel) : null;
    const key = reel?.link ?? initialReference.url ?? "";
    if (!key || fetchedRef.current === key) return;
    fetchedRef.current = key;
    if (reel) { void getReel(reel, initialReference.url); return; }
    if (initialReference.url) void getReel({ link: initialReference.url, code: null, handle: null, account: initialReference.name, thumb: null, caption: null, format: "Reel", views: null, multiplier: null }, initialReference.url);
  }, [initialReference, getReel]);

  /** Paste a Reel link: the same authorized read, by the link (and the account when the link doesn't carry it). */
  const takePasted = () => {
    const parsed = parseReelLink(pasted);
    if (!parsed) { setRefNote("Paste an Instagram Reel link, like instagram.com/reel/ABC123/."); return; }
    const handle = parsed.handle ?? cleanHandle(pastedHandle);
    setNeedHandle(false);
    void getReel({ link: parsed.link, code: parsed.code, handle, account: handle ? `@${handle}` : null, thumb: null, caption: null, format: "Reel", views: null, multiplier: null }, null);
  };

  const clearReference = () => { setRef(null); setRefNote(null); setSource(null); setSourceState(null); setShowPreview(false); setPreview(null); setDirectionNote(null); };

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
      const res = await fetch(`/api/studio/projects/${projectId}/brief`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: withDirection(brief, direction).trim() || null, reference: ref, ...(voiceOn ? { voiceover: { on: true, notes: voiceNotes.trim() || null, ...(voiceId ? { voiceId } : {}), ...(voiceApproved && voiceNotes.trim() ? { approved: true } : {}) } } : {}) }) });
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

  const ready = Boolean(projectId) && (prompt.trim().length >= 3 || ref) && !reading && !busy && !improving && !(voiceOn && voicePending);
  // Sent from Ask SOCIA with clips and a script: start as soon as everything is in. Only on a plan that
  // includes it (canMake true); otherwise the plan note shows and nothing starts.
  useEffect(() => {
    if (!autoMake || canMake !== true || !ready) return;
    onAutoMade?.();
    void make();
    // make reads the current prompt and reference; it runs once per hand-off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoMake, canMake, ready]);
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
          <label className="cba-cap cbr-prompt">
            <span>What you want (optional with a reference)</span>
            <span className="cbr-prompt-mic"><MicButton supported={speech.supported} listening={speech.listening} disabled={busy || improving} onToggle={toggleMic} size="large" labelIdle="Say what you want" /></span>
            <textarea value={prompt} rows={Math.min(10, Math.max(3, Math.ceil(prompt.length / 90) + 1))} maxLength={PROMPT_MAX} disabled={busy || improving} placeholder={speech.listening ? "Listening. Press the microphone again when you\u2019re done." : "For example: 20 seconds, open on the cheese pull, three quick cuts of the oven, end on the menu board with 'Open till 10'."} onChange={(e) => { setPrompt(e.target.value); setOwnWords(null); }} />
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

          <div className="cbr-dir">
            <div className="cbr-dir-head">
              <span className="cbr-ref-label">Creative direction</span>
              <button type="button" className="ov-btn ghost small" aria-expanded={directionOpen} onClick={() => setDirectionOpen((o) => !o)}>{directionOpen ? "Done" : "Change"}</button>
            </div>
            {!directionOpen && <p className="cbp-muted">{directionSummary(direction)}</p>}
            {directionNote && <p className="cbp-muted">{directionNote}</p>}
            {directionOpen && (
              <div className="cbr-dir-grid">
                {(Object.keys(DIRECTION_OPTIONS) as DirectionKey[]).map((k) => (
                  <div key={k} className="cbr-dir-row" role="radiogroup" aria-label={DIRECTION_OPTIONS[k].label}>
                    <span>{DIRECTION_OPTIONS[k].label}</span>
                    <div>
                      {(DIRECTION_OPTIONS[k].options as readonly (readonly [string, string])[]).map(([id, label]) => (
                        <button key={id} type="button" role="radio" aria-checked={direction[k] === id} className={`cbr-dir-chip${direction[k] === id ? " on" : ""}`} disabled={busy}
                          onClick={() => { directionTouched.current = true; setDirectionNote(null); setDirection((d) => ({ ...d, [k]: id }) as EditDirection); }}>{label}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="cbp-muted">These go into the brief the cut is made from{initialStyle ? ", starting from the style you chose in Ask SOCIA" : ""}. Change anything after in the editor.</p>
              </div>
            )}
          </div>

          <div className="cbr-voice">
            <label className="cbb-check"><input type="checkbox" checked={voiceOn} disabled={busy} onChange={(e) => setVoiceOn(e.target.checked)} /> Add a voiceover</label>
            {voiceOn && (
              <VoiceoverAsk notes={voiceNotes} onNotes={setVoiceNotes} voiceId={voiceId} onVoice={setVoiceId} approved={voiceApproved} onApproved={setVoiceApproved} onPending={setVoicePending} prompt={prompt} disabled={busy} />
            )}
            {voiceOn && <p className="cbp-muted">{voiceApproved ? "The voice reads your approved script when the video is made." : "Without a script, SOCIA writes one from what it should be about and your clips when the video is made, adding nothing you didn't say."} The audio is made only then, and uses {actionCredits("voiceovers")} credits.</p>}
          </div>

          <div className="cbr-ref">
            <span className="cbr-ref-label">Reference video (optional)</span>
            {source ? (
              <div className="cbr-src">
                {source.thumb
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={source.thumb} alt="" referrerPolicy="no-referrer" className="cbr-src-thumb" />
                  : <span className="cbr-src-thumb" aria-hidden><Film size={16} /></span>}
                <span className="cbr-src-text">
                  <b>{source.handle ? `@${source.handle}` : source.account ?? "Instagram Reel"}</b>
                  {source.caption && <span>{source.caption}</span>}
                  <small role="status">
                    {sourceState === "getting" ? <><Loader2 size={11} className="spin" aria-hidden /> {reading ?? "Getting the Reel"}…</>
                      : sourceState === "studied" && ref ? `Video studied: ${ref.durationSec}s${shots ? `, ${shots} shot${shots === 1 ? "" : "s"}` : ""}${ref.words ? ", speech heard" : ""}`
                      : "Video not studied"}
                  </small>
                  <span className="cbr-src-actions">
                    <a href={source.link} target="_blank" rel="noopener noreferrer" className="ov-btn ghost small"><ExternalLink size={12} aria-hidden /> Original</a>
                    {preview && <button type="button" className="ov-btn ghost small" aria-expanded={showPreview} onClick={() => setShowPreview((v) => !v)}><Play size={12} aria-hidden /> {showPreview ? "Hide" : "Preview"}</button>}
                    <button type="button" className="ov-btn ghost small" disabled={busy || Boolean(reading)} onClick={() => input.current?.click()}><Upload size={12} aria-hidden /> Replace</button>
                    <button type="button" className="ov-btn ghost small" disabled={busy} onClick={clearReference}><X size={12} aria-hidden /> Remove</button>
                  </span>
                </span>
              </div>
            ) : ref ? (
              <div className="cbr-ref-card">
                <Film size={14} aria-hidden />
                <span><b>{ref.name}</b><small>{ref.durationSec}s{shots ? ` · ${shots} shot${shots === 1 ? "" : "s"}` : ""}{ref.words ? " · speech heard" : ""}</small></span>
                {preview && <button type="button" className="ov-btn ghost small" aria-expanded={showPreview} onClick={() => setShowPreview((v) => !v)}><Play size={12} aria-hidden /> {showPreview ? "Hide" : "Preview"}</button>}
                <button type="button" className="ov-x" aria-label="Remove the reference" disabled={busy} onClick={clearReference}><X size={14} /></button>
              </div>
            ) : (
              <>
                <div
                  className={`cbr-drop${drag ? " drag" : ""}`} role="button" tabIndex={0}
                  onClick={() => !reading && input.current?.click()}
                  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !reading) { e.preventDefault(); input.current?.click(); } }}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f && !reading) { setSource(null); setSourceState(null); void readReference(f); } }}
                >
                  {reading ? <><Loader2 size={14} className="spin" /> {reading}…</> : <><Upload size={14} /> Drop a video to copy, or click to choose (up to 3 minutes)</>}
                </div>
                <form className="cbr-paste" onSubmit={(e) => { e.preventDefault(); takePasted(); }}>
                  <label className="sr-only" htmlFor="cbr-paste-link">Instagram Reel link</label>
                  <span className="cbr-paste-row">
                    <Link2 size={14} aria-hidden />
                    <input id="cbr-paste-link" type="url" inputMode="url" placeholder="Or paste an Instagram Reel link" value={pasted} disabled={busy || Boolean(reading)} onChange={(e) => setPasted(e.target.value)} />
                    {needHandle && <input aria-label="Whose Reel is it" placeholder="@account" value={pastedHandle} disabled={busy || Boolean(reading)} onChange={(e) => setPastedHandle(e.target.value)} className="cbr-paste-handle" />}
                    <button type="submit" className="ov-btn ghost small" disabled={busy || Boolean(reading) || !pasted.trim()}>Use this Reel</button>
                  </span>
                </form>
              </>
            )}
            {showPreview && preview && <video className="cbr-preview" src={preview} controls playsInline preload="metadata" />}
            <input ref={input} type="file" hidden accept="video/mp4,video/quicktime,video/webm,video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSource(null); setSourceState(null); void readReference(f); } e.target.value = ""; }} />
            {refNote && <small className="cbr-note">{refNote}</small>}
          </div>

          {error && <p className="cbb-err" role="alert"><AlertTriangle size={12} /> {error}</p>}
          <div className="cbp-foot">
            <button type="button" className="ov-btn primary" disabled={!ready} onClick={() => void make()}>
              {busy ? <Loader2 size={14} className="spin" /> : <Clapperboard size={14} />} {busy ? step ?? (ref ? "Studying the reference and cutting…" : "Cutting…") : "Make the video"}
            </button>
            {!projectId && noClipsNote && <p className="cbp-muted">{noClipsNote}</p>}
            {projectId && !busy && !ref && prompt.trim().length < 3 && <p className="cbp-muted">Write what you want above, or add a reference video, to make it.</p>}
            {voiceOn && voicePending && <p className="cbp-muted">Read the improved voiceover script above and approve it to make the video.</p>}
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
