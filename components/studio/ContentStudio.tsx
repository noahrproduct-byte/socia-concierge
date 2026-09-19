"use client";

// Content Studio. Flow: upload (or choose a draft) → analyze → understand →
// improve → prepare → add to plan / save a draft. The content stays the
// centre of the workspace; SOCIA works beside it. The file never leaves the
// browser for analysis (only sampled frames do); it is uploaded only when the
// user saves a draft.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Upload, FolderOpen, FileVideo, Image as ImageIcon, RefreshCw, Sparkles, AlertTriangle, Check, X } from "lucide-react";
import PageHeader from "../PageHeader";
import StudioPlayer, { type SeekRequest } from "./StudioPlayer";
import { AnalyzePanel, ImprovePanel, CaptionPanel, AudioPanel, PreparePanel, type Working, type ImproveOption } from "./StudioPanels";
import { AskSociaButton } from "../AskSocia";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { extractFrames, imageFrames, analysisSummary, MAX_BYTES, MAX_SECONDS, type StudioAnalysis, type StudioKind, type Frames, type GoalId, type ApplyField } from "@/lib/studio";
import type { AskProposal } from "@/lib/ask";

export type DraftItem = { id: string; caption: string; media_url: string | null; media_type: string; scheduled_at: string; status: string };

type Source = { kind: StudioKind; url: string; name: string; file: File | null; files: File[]; draftId: string | null; images: string[] };
type Phase = "idle" | "loading" | "extracting" | "analyzing" | "done" | "error";
type ErrKind = "unsupported" | "too_large" | "too_short" | "too_long" | "cors" | "failed" | "api";
const ERR_COPY: Record<ErrKind, { title: string; body: string }> = {
  unsupported: { title: "Unsupported format", body: "Use an MP4 or MOV video, or a JPG/PNG image. Some codecs (HEVC from iPhone) don't decode in the browser; export as H.264." },
  too_large: { title: "File is too large", body: `Keep uploads under ${Math.round(MAX_BYTES / 1024 / 1024)} MB. Export a compressed version and try again.` },
  too_short: { title: "Video is too short", body: "SOCIA needs at least one second of video to sample frames." },
  too_long: { title: "Video is too long", body: `Trim to under ${MAX_SECONDS / 60} minutes. Short-form is what this workspace judges.` },
  cors: { title: "Couldn't read this draft's media", body: "The file is stored, but the browser couldn't sample frames from it. Upload the original file instead." },
  failed: { title: "Analysis failed", body: "Something went wrong reading the result. Try again; if it repeats, use a different export of the video." },
  api: { title: "SOCIA AI is unavailable", body: "The analysis service didn't respond. Try again in a moment." },
};
const TABS = [["analyze", "Analyze"], ["improve", "Improve"], ["caption", "Caption"], ["audio", "Audio"], ["prepare", "Prepare"]] as const;
type Tab = (typeof TABS)[number][0];

export default function ContentStudio({ userId, niche, location, goalDefault, drafts, connected, postsSynced }: { userId: string; niche: string | null; location: string | null; goalDefault: GoalId | null; drafts: DraftItem[]; connected: boolean; postsSynced: number }) {
  const [source, setSource] = useState<Source | null>(null);
  const [frames, setFrames] = useState<Frames | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState({ done: 0, total: 10 });
  const [err, setErr] = useState<{ kind: ErrKind; detail?: string } | null>(null);
  const [analysis, setAnalysis] = useState<StudioAnalysis | null>(null);
  const [versions, setVersions] = useState<{ analysis: StudioAnalysis; at: string }[]>([]);
  const [transcript, setTranscript] = useState("");
  const [tab, setTab] = useState<Tab>("analyze");
  const [w, setW] = useState<Working>({ hook: "", cta: "", caption: "", onscreen: [], platform: "Instagram Reels", goal: goalDefault, cover: null, audioChosen: false });
  const [seek, setSeek] = useState<SeekRequest>(null);
  const [activeMarker, setActiveMarker] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const [pickDraft, setPickDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const seekN = useRef(0);
  const playerVideo = useRef<HTMLVideoElement | null>(null);

  const doSeek = useCallback((t: number) => { seekN.current += 1; setSeek({ t, n: seekN.current }); }, []);
  const notify = (s: string) => { setToast(s); setTimeout(() => setToast(null), 1800); };
  useEffect(() => () => { if (source?.file) URL.revokeObjectURL(source.url); source?.images.forEach((u) => u.startsWith("blob:") && URL.revokeObjectURL(u)); }, [source]);

  const apply = useCallback((field: ApplyField, value: string) => {
    setW((cur) => field === "onscreen" ? { ...cur, onscreen: cur.onscreen.includes(value) ? cur.onscreen : [...cur.onscreen, value] } : { ...cur, [field]: value });
    notify(field === "hook" ? "Hook in use" : field === "cta" ? "CTA in use" : field === "caption" ? "Caption updated" : "Added to on-screen text");
  }, []);

  // ---- analysis ---------------------------------------------------------
  const analyze = useCallback(async (src: Source, fr: Frames, opts?: { transcript?: string; caption?: string; goal?: GoalId | null; platform?: string | null }) => {
    setPhase("analyzing"); setErr(null);
    try {
      const res = await fetch("/api/studio/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: src.kind, frames: fr.frames, frameTimes: fr.times, durationSec: fr.duration, transcript: opts?.transcript ?? transcript, caption: opts?.caption ?? w.caption, goal: opts?.goal ?? w.goal, platform: opts?.platform ?? w.platform }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setErr({ kind: res.status === 503 || res.status === 502 || res.status === 429 ? "api" : "failed", detail: json.error }); setPhase("error"); return; }
      const a = json.analysis as StudioAnalysis;
      setVersions((v) => { const next = [...v, { analysis: a, at: new Date().toISOString() }]; a.meta.version = next.length; return next; });
      setAnalysis(a);
      setW((cur) => ({ ...cur, hook: cur.hook || a.hooks.current || "", cta: cur.cta || a.cta.current || "" }));
      setPhase("done"); setTab("analyze");
    } catch {
      setErr({ kind: "api" }); setPhase("error");
    }
  }, [transcript, w.caption, w.goal, w.platform]);

  const load = useCallback(async (src: Source) => {
    setSource(src); setAnalysis(null); setVersions([]); setFrames(null); setErr(null); setSavedId(null); setActiveMarker(null);
    setW((cur) => ({ ...cur, hook: "", cta: "", onscreen: [], cover: null }));
    setPhase("extracting"); setProgress({ done: 0, total: 10 });
    try {
      // Sample from the player once React has mounted it for this source.
      let el: HTMLVideoElement | null = null;
      for (let i = 0; i < 40 && src.kind === "video"; i++) {
        el = playerVideo.current;
        if (el && el.src === src.url) break;
        el = null;
        await new Promise((r) => setTimeout(r, 50));
      }
      const fr = src.kind === "video" ? await extractFrames(src.file ?? src.url, (d, t) => setProgress({ done: d, total: t }), el) : await imageFrames(src.files.length ? src.files : src.images);
      setFrames(fr);
      await analyze(src, fr);
    } catch (e) {
      const m = e instanceof Error ? e.message : "unsupported";
      setErr({ kind: (["unsupported", "too_short", "too_long", "cors"].includes(m) ? m : "unsupported") as ErrKind }); setPhase("error");
    }
  }, [analyze]);

  const onFiles = useCallback((list: FileList | File[]) => {
    const files = Array.from(list);
    if (!files.length) return;
    const f = files[0];
    if (files.some((x) => x.size > MAX_BYTES)) { setErr({ kind: "too_large" }); setPhase("error"); return; }
    const isVideo = f.type.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(f.name);
    const isImage = f.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(f.name);
    if (!isVideo && !isImage) { setErr({ kind: "unsupported" }); setPhase("error"); return; }
    if (isVideo) { load({ kind: "video", url: URL.createObjectURL(f), name: f.name, file: f, files: [], draftId: null, images: [] }); return; }
    const imgs = files.filter((x) => x.type.startsWith("image/")).slice(0, 10);
    load({ kind: imgs.length > 1 ? "carousel" : "image", url: URL.createObjectURL(imgs[0]), name: imgs.length > 1 ? `${imgs.length} images` : f.name, file: imgs[0], files: imgs, draftId: null, images: imgs.map((x) => URL.createObjectURL(x)) });
  }, [load]);

  const openDraft = useCallback((d: DraftItem) => {
    if (!d.media_url) return;
    setPickDraft(false);
    setW((cur) => ({ ...cur, caption: d.caption || cur.caption }));
    const video = d.media_type !== "IMAGE";
    load({ kind: video ? "video" : "image", url: d.media_url, name: d.caption?.slice(0, 40) || "Draft", file: null, files: [], draftId: d.id, images: video ? [] : [d.media_url] });
  }, [load]);

  const improve = useCallback(async (task: "hooks" | "caption" | "cta" | "onscreen" | "variations", params?: { mode?: string; exclude?: string[] }): Promise<ImproveOption[]> => {
    const res = await fetch("/api/studio/improve", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, summary: analysis ? analysisSummary(analysis) : "", transcript, caption: w.caption, hook: w.hook, goal: w.goal, durationSec: frames?.duration ?? null, kind: source?.kind, ...params }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "SOCIA couldn't generate options.");
    return json.options as ImproveOption[];
  }, [analysis, transcript, w.caption, w.hook, w.goal, frames, source]);

  const onProposal = useCallback((p: AskProposal, choice?: string) => {
    if (p.kind !== "text" || !choice) return false;
    apply(p.field, choice);
    return true;
  }, [apply]);

  // ---- save as a calendar draft ------------------------------------------
  const saveDraft = useCallback(async () => {
    if (!source) return;
    setSaving(true);
    try {
      const api = async <T,>(method: string, body: unknown): Promise<T> => {
        const res = await fetch("/api/schedule", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? "Couldn't save.");
        return j as T;
      };
      const caption = [w.caption.trim(), w.cta && !w.caption.includes(w.cta) ? w.cta : ""].filter(Boolean).join("\n\n");
      if (source.draftId) {
        await api("PATCH", { id: source.draftId, caption });
        setSavedId(source.draftId);
      } else if (source.file) {
        const when = new Date(); when.setDate(when.getDate() + 1); when.setHours(12, 0, 0, 0);
        const { posts } = await api<{ posts: { id: string }[] }>("POST", { scheduled_at: when.toISOString(), caption, media_type: source.kind === "video" ? "REELS" : "IMAGE", keep_draft: true });
        const id = posts[0].id;
        const supabase = createClient();
        const safe = source.file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
        const path = `${userId}/${id}/${Date.now()}_${safe}`;
        await uploadMedia(supabase, "scheduled-media", path, source.file);
        const { data: pub } = supabase.storage.from("scheduled-media").getPublicUrl(path);
        await api("PATCH", { id, media_path: path, media_url: pub.publicUrl, keep_draft: true });
        setSavedId(id);
      }
      notify("Draft saved to the Calendar");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Couldn't save the draft");
    } finally { setSaving(false); }
  }, [source, w.caption, w.cta, userId]);

  const planNote = useMemo(() => {
    if (!analysis) return "Idea from Content Studio.";
    const f = analysis.topFixes[0];
    return `From Content Studio: ${source?.name ?? "draft"} scored ${analysis.score.overall}/100. ${f ? `Top fix: ${f.title} (${f.suggestion}).` : ""}${w.hook ? ` Hook: "${w.hook}".` : ""}`.slice(0, 380);
  }, [analysis, source, w.hook]);
  const summaryForAsk = analysis ? analysisSummary(analysis) : null;
  const busy = phase === "extracting" || phase === "analyzing" || phase === "loading";

  return (
    <div className="st" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length && !busy) onFiles(e.dataTransfer.files); }}>
      <PageHeader
        title="Content Studio"
        sub="Make every post stronger before it goes live."
        status={<span className="ov-status"><i className={connected ? "live" : ""} />{connected ? `Judged against your own ${postsSynced} synced posts` : <>Not connected · <Link href="/settings#accounts">connect Instagram</Link> to compare with your winners</>}{niche ? ` · ${niche}` : ""}{location ? ` · ${location}` : ""}</span>}
        actions={
          <>
            <button type="button" className="ov-btn ghost" disabled={busy || !drafts.length} title={drafts.length ? "Analyse a draft from your Calendar" : "No drafts with media in your Calendar yet"} onClick={() => setPickDraft((v) => !v)}><FolderOpen size={14} /> Choose draft</button>
            <button type="button" className="ov-btn primary" disabled={busy} onClick={() => input.current?.click()}><Upload size={14} /> Upload content</button>
            <input ref={input} type="file" hidden accept="video/mp4,video/quicktime,video/webm,video/*,image/jpeg,image/png,image/webp" multiple onChange={(e) => { if (e.target.files) onFiles(e.target.files); e.target.value = ""; }} />
          </>
        }
      />

      {pickDraft && (
        <div className="st-drafts ov-card">
          <div className="ov-card-head"><h2>Drafts with media</h2><button type="button" className="ov-x" aria-label="Close" onClick={() => setPickDraft(false)}><X size={14} /></button></div>
          <ul>
            {drafts.map((d) => (
              <li key={d.id}><button type="button" onClick={() => openDraft(d)}>{d.media_type === "IMAGE" ? <ImageIcon size={14} /> : <FileVideo size={14} />}<span><b>{d.caption?.split("\n")[0]?.slice(0, 60) || "(no caption)"}</b><small>{new Date(d.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {d.status}</small></span></button></li>
            ))}
          </ul>
        </div>
      )}

      <div className={`st-grid${source ? "" : " empty"}`}>
        <div className="st-preview">
          {!source ? (
            <div className={`st-drop${drag ? " drag" : ""}`} role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}>
              <span className="st-drop-ico"><Upload size={22} /></span>
              <b>{drag ? "Drop it" : "Drop a video or image here, or click to browse"}</b>
              <p>MP4 or MOV up to {MAX_SECONDS / 60} minutes · JPG or PNG · several images for a carousel. Frames are read on your device; the file is uploaded only if you save a draft.</p>
            </div>
          ) : (
            <div className="ov-card st-player-card">
              <div className="st-player-head">
                <span className="st-file">{source.kind === "video" ? <FileVideo size={14} /> : <ImageIcon size={14} />} {source.name}{frames?.duration ? ` · ${Math.round(frames.duration)}s` : ""}</span>
                <button type="button" className="ov-btn ghost small" disabled={busy} onClick={() => input.current?.click()}>Replace</button>
              </div>
              <StudioPlayer url={source.url} kind={source.kind} images={source.images} thumbs={frames?.thumbs ?? []} markers={analysis?.markers ?? []} segments={analysis?.segments ?? []} seek={seek} onTime={() => null} onDuration={() => null} cover={w.cover} onCover={(i) => setW((c) => ({ ...c, cover: i }))} activeMarker={activeMarker} videoRef={playerVideo} />
            </div>
          )}
          <div className="ov-card st-context">
            <label><span>Voiceover or on-screen text <small>(optional, improves accuracy a lot)</small></span>
              <textarea rows={3} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste what's said or shown on screen…" disabled={busy} /></label>
            {source && frames && phase !== "extracting" && (
              <button type="button" className="ov-btn ghost small" disabled={busy} onClick={() => analyze(source, frames)}><RefreshCw size={12} className={phase === "analyzing" ? "spin" : undefined} /> {analysis ? "Re-analyze as a new version" : "Analyze"}</button>
            )}
          </div>
        </div>

        <div className="st-work">
          {!source && (
            <div className="ov-card st-intro">
              <h2>What you get back</h2>
              <ul>
                <li><b>A SOCIA score you can read</b><span>Hook, pacing, clarity, visual interest, CTA and audio fit, each with its evidence and a fix. Nothing unmeasurable is scored.</span></li>
                <li><b>Top 3 fixes and a timeline</b><span>Timestamped moments to change; click one and the video jumps there.</span></li>
                <li><b>Hook Lab, captions, CTAs, cuts</b><span>Ready-to-use lines in your voice; you choose, nothing is overwritten.</span></li>
                <li><b>Compared with your winners</b><span>{connected ? `Against the cover frames and captions of your top posts (${postsSynced} synced).` : "Connect Instagram to compare against your own top posts."}</span></li>
              </ul>
              <p className="ov-source">No virality odds, no view predictions, no invented trending audio.</p>
            </div>
          )}
          {source && (phase === "extracting" || phase === "analyzing") && (
            <div className="ov-card st-progress" aria-live="polite">
              <b>{phase === "extracting" ? "Reading the file" : "Analyzing"}</b>
              <ul>
                <li className={phase === "extracting" ? "on" : "done"}><i />{phase === "extracting" ? `Extracting frames ${progress.done}/${progress.total}` : `Extracted ${frames?.frames.length ?? progress.total} frames`}</li>
                <li className={phase === "analyzing" ? "on" : ""}><i />Analyzing hook, pacing, clarity and CTA</li>
                <li className={phase === "analyzing" ? "on" : ""}><i />Comparing with your top posts{connected ? "" : " (not connected)"}</li>
              </ul>
              <p className="ov-source">One request to SOCIA; usually 20 to 40 seconds. Results appear together when it finishes.</p>
            </div>
          )}
          {phase === "error" && err && (
            <div className="ov-card st-error">
              <span className="st-error-ico"><AlertTriangle size={16} /></span>
              <div><b>{ERR_COPY[err.kind].title}</b><p>{err.detail ?? ERR_COPY[err.kind].body}</p>
                <div className="st-row-actions">
                  {source && frames && err.kind === "api" && <button type="button" className="ov-btn primary small" onClick={() => analyze(source, frames)}>Try again</button>}
                  <button type="button" className="ov-btn ghost small" onClick={() => input.current?.click()}>Upload a different file</button>
                </div>
              </div>
            </div>
          )}
          {source && analysis && phase === "done" && (
            <>
              <div className="st-tabs" role="tablist" aria-label="Workspace">
                {TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>{label}</button>)}
                <span className="st-tabs-ask"><AskSociaButton className="ov-btn ghost small" label="Ask SOCIA about this content" context={{ page: "studio", studio: { kind: source.kind, durationSec: frames?.duration ?? null, goal: w.goal, transcript: transcript || null, caption: w.caption || null, summary: summaryForAsk } }} contextLabel={source.name} onProposal={onProposal} /></span>
              </div>
              {tab === "analyze" && <AnalyzePanel a={analysis} w={w} apply={apply} seek={doSeek} setActive={setActiveMarker} onCompare={() => window.open("/analytics#content", "_self")} />}
              {tab === "improve" && <ImprovePanel a={analysis} w={w} apply={apply} seek={doSeek} improve={improve} firstFrame={frames?.thumbs[0]?.src ?? null} />}
              {tab === "caption" && <CaptionPanel a={analysis} w={w} setCaption={(s) => setW((c) => ({ ...c, caption: s }))} improve={improve} />}
              {tab === "audio" && <AudioPanel a={analysis} w={w} setAudio={(b) => setW((c) => ({ ...c, audioChosen: b }))} />}
              {tab === "prepare" && <PreparePanel a={analysis} w={w} versions={versions} setGoal={(g) => setW((c) => ({ ...c, goal: g }))} setPlatform={(p) => setW((c) => ({ ...c, platform: p }))} improve={improve} onSaveDraft={saveDraft} saving={saving} savedId={savedId} planNote={planNote} />}
            </>
          )}
          {source && !analysis && phase === "done" && <div className="ov-empty">No analysis yet.</div>}
        </div>
      </div>
      {(w.hook || w.cta || w.onscreen.length > 0) && source && (
        <div className="st-inuse ov-card">
          <small>In use for this piece</small>
          {w.hook && <span><b>Hook</b> “{w.hook}”</span>}
          {w.cta && <span><b>CTA</b> “{w.cta}”</span>}
          {w.onscreen.map((o) => <span key={o}><b>Text</b> “{o}”</span>)}
        </div>
      )}
      {toast && <div className="cal2-toast" role="status"><Check size={13} /> {toast}</div>}
      <div className="st-privacy"><Sparkles size={11} /> Frames are read on your device. SOCIA scores what it can see and never predicts views.</div>
    </div>
  );
}
