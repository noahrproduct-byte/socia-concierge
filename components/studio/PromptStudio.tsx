"use client";

// Prompt mode: drop clips, describe the video, let SOCIA make the brief
// detailed, then cut it. The cut is a Content Studio build (EDL + guide), so
// the same builder plays it, lets the person edit it, renders it with
// Remotion in the browser, and saves the render as a Calendar draft. Steps
// that cost something say so: understanding the clips is one clip build
// credit, a brief rewrite one content generation credit, a render one video
// build. Nothing is published from here.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Upload, AlertTriangle, Loader2, PenLine, Scissors, Undo2, FolderOpen, Clapperboard, Check, CalendarDays } from "lucide-react";
import PageHeader from "../PageHeader";
import PlanNotice, { UsageLine } from "../PlanNotice";
import { isPlanError } from "@/lib/planErrors";
import type { UsageSnapshot } from "@/lib/entitlements";
import type { StudioBuild, StudioProject } from "@/lib/studioClips/types";
import { fmtClock } from "@/lib/studioClips/types";
import type { ProjectSummary } from "@/lib/studioClips/server";
import { PROMPT_MIN, titleFromPrompt } from "@/lib/studioClips/promptBrief";
import { ClipGrid, UnderstandCard, ProjectList, fmtMinutes } from "./ClipsViews";
import { useClipUploads } from "./useClipUploads";

type Meta = { limits: { clipsPerProject: number; footageMinutes: number; uploadMb: number; retentionDays: number }; usage: UsageSnapshot | null; transcription: boolean; autoBuild: boolean };
type Phase = "idle" | "understanding" | "cutting";

const ClipBuilder = dynamic(() => import("./ClipBuilder"), { ssr: false, loading: () => <div className="ov-card st-progress"><ul><li className="on"><i />Opening the video builder</li></ul></div> });
const POLL_MS = 2500;

export default function PromptStudio({ modeTabs }: { modeTabs?: ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const input = useRef<HTMLInputElement>(null);

  const [meta, setMeta] = useState<Meta | null>(null);
  const [migration, setMigration] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<StudioProject | null>(null);
  const [builds, setBuilds] = useState<StudioBuild[]>([]);
  const [prompt, setPrompt] = useState("");
  const [before, setBefore] = useState<string | null>(null);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [improving, setImproving] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [stepNote, setStepNote] = useState<string | null>(null);
  const [open, setOpen] = useState<StudioBuild | null>(null);
  const [drag, setDrag] = useState(false);
  const projectRef = useRef<StudioProject | null>(null);
  projectRef.current = project;
  const wantCut = useRef(false);

  const onChangedRef = useRef<(id: string) => Promise<void>>(async () => {});
  const uploads = useClipUploads({ onChanged: (id) => onChangedRef.current(id) });
  const { syncLocals, setLocals, setPlanError, setNotice } = uploads;

  // ---------------------------------------------------------- loading ----
  const loadMeta = useCallback(async () => {
    const res = await fetch("/api/studio/projects").catch(() => null);
    if (!res) return;
    const j = await res.json().catch(() => null);
    if (res.status === 503 && j?.migration) { setMigration(j.error); return; }
    if (!res.ok) { setNotice(j?.error ?? "Couldn't load your projects."); return; }
    setMeta({ limits: j.limits, usage: j.usage ?? null, transcription: Boolean(j.transcription), autoBuild: Boolean(j.features?.autoBuild) });
    setProjects(j.projects ?? []);
  }, [setNotice]);

  const loadBuilds = useCallback(async (id: string) => {
    const res = await fetch(`/api/studio/projects/${id}/prompt`).catch(() => null);
    const j = await res?.json().catch(() => null);
    if (res?.ok && Array.isArray(j?.builds)) setBuilds(j.builds);
  }, []);

  const openProject = useCallback(async (id: string, quiet = false): Promise<StudioProject | null> => {
    const res = await fetch(`/api/studio/projects/${id}`).catch(() => null);
    if (!res) return null;
    const j = await res.json().catch(() => null);
    if (!res.ok) { if (!quiet) setNotice(j?.error ?? "Couldn't open that project."); return null; }
    const p = j as StudioProject;
    setProject(p);
    syncLocals(p);
    void loadBuilds(id);
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set("mode", "prompt"); sp.set("project", id);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    return p;
  }, [params, pathname, router, syncLocals, setNotice, loadBuilds]);
  onChangedRef.current = async (id) => { await openProject(id, true); void loadMeta(); };

  useEffect(() => { void loadMeta(); }, [loadMeta]);
  useEffect(() => {
    const id = params.get("project");
    if (id && !project) void openProject(id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureProject = useCallback(async (): Promise<StudioProject | null> => {
    if (projectRef.current) return projectRef.current;
    const res = await fetch("/api/studio/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Video from a brief" }) });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      if (isPlanError(j)) setPlanError(j); else if (j?.migration) setMigration(j.error); else setNotice(j?.error ?? "Couldn't start a project.");
      return null;
    }
    return openProject(j.id);
  }, [openProject, setPlanError, setNotice]);

  const onFiles = useCallback(async (list: FileList | File[]) => {
    if (projectRef.current?.status === "understanding") { setNotice("Wait for SOCIA to finish understanding the clips, then add more."); return; }
    const p = await ensureProject();
    if (!p) return;
    setOpen(null);
    await uploads.addFiles(list, p);
  }, [ensureProject, uploads, setNotice]);

  // ------------------------------------------------------------ brief ----
  const improve = useCallback(async () => {
    const p = projectRef.current;
    if (!p || prompt.trim().length < PROMPT_MIN) return;
    setImproving(true); setPlanError(null); setNotice(null);
    const res = await fetch("/api/studio/prompt/improve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: p.id, prompt }) });
    const j = await res.json().catch(() => null);
    setImproving(false);
    if (!res.ok) { if (isPlanError(j)) setPlanError(j); else setNotice(j?.error ?? "Couldn't improve the brief."); return; }
    setBefore(prompt);
    setPrompt(j.prompt);
    setAssumptions(j.assumptions ?? []);
  }, [prompt, setPlanError, setNotice]);

  // -------------------------------------------------------------- cut ----
  const cut = useCallback(async (p: StudioProject): Promise<void> => {
    setPhase("cutting"); setStepNote("Cutting your video from the brief");
    const res = await fetch(`/api/studio/projects/${p.id}/prompt`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }) });
    const j = await res.json().catch(() => null);
    setPhase("idle"); setStepNote(null);
    if (!res.ok) { if (isPlanError(j)) setPlanError(j); else if (j?.migration) setMigration(j.error); else setNotice(j?.error ?? "Couldn't cut the video."); return; }
    const b = j as StudioBuild;
    setBuilds((cur) => [b, ...cur]);
    setOpen(b);
  }, [prompt, setPlanError, setNotice]);

  const create = useCallback(async () => {
    const p = projectRef.current;
    if (!p || prompt.trim().length < PROMPT_MIN) return;
    setPlanError(null); setNotice(null);
    const ready = p.clips.filter((c) => c.status === "uploaded" || c.status === "ready");
    if (!ready.length) { setNotice("Add at least one clip first."); return; }
    // Clips SOCIA hasn't understood yet go through Understand first (one clip
    // build credit); the cut starts by itself when it finishes.
    if (ready.some((c) => !c.card)) {
      setPhase("understanding"); setStepNote("Understanding your clips first");
      const res = await fetch(`/api/studio/projects/${p.id}/understand`, { method: "POST" });
      const j = await res.json().catch(() => null);
      if (!res.ok && !(res.status === 409 && j?.running)) {
        setPhase("idle"); setStepNote(null);
        if (isPlanError(j)) setPlanError(j); else setNotice(j?.error ?? "Couldn't start.");
        return;
      }
      if (j?.usage) setMeta((m) => (m ? { ...m, usage: j.usage } : m));
      wantCut.current = true;
      setProject({ ...p, status: "understanding", error: null, progress: null });
      return;
    }
    await cut(p);
  }, [prompt, cut, setPlanError, setNotice]);

  // Poll while understanding; then cut if that is what the person asked for.
  useEffect(() => {
    if (project?.status !== "understanding") return;
    const t = setInterval(async () => {
      const p = await openProject(project.id, true);
      if (!p || p.status === "understanding") return;
      clearInterval(t);
      void loadMeta();
      if (wantCut.current) {
        wantCut.current = false;
        if (p.status === "failed") { setPhase("idle"); setStepNote(null); setNotice(p.error ?? "Understanding didn't finish. Nothing was counted against your plan."); }
        else void cut(p);
      } else setPhase("idle");
    }, POLL_MS);
    return () => clearInterval(t);
  }, [project?.status, project?.id, openProject, loadMeta, cut, setNotice]);

  // ------------------------------------------------------------ derive ----
  const { locals, uploading, readyClips, footageSec, bytes, planError, notice } = uploads;
  const understanding = project?.status === "understanding";
  const busy = phase !== "idle" || understanding;
  const canCreate = Boolean(project) && readyClips.length > 0 && prompt.trim().length >= PROMPT_MIN && !uploading && !busy;
  const understood = readyClips.filter((l) => l.clip?.card).length;
  const limits = meta?.limits;

  const dropZone = (compact: boolean) => (
    <div className={`st-drop cb-drop${compact ? " compact" : ""}${drag ? " drag" : ""}`} role="button" tabIndex={0} aria-disabled={busy || undefined} onClick={() => !busy && input.current?.click()} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); input.current?.click(); } }}>
      <span className="st-drop-ico"><Upload size={compact ? 16 : 22} /></span>
      <b>{drag ? "Drop them" : compact ? "Drop more clips, or click to browse" : "Drop the clips for this video, or click to browse"}</b>
      {!compact && <p>MP4 or MOV. Each clip is measured on this device and stored privately{limits ? ` for ${limits.retentionDays} days` : ""}.</p>}
    </div>
  );

  return (
    <div className="st cb pv" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length && !busy) void onFiles(e.dataTransfer.files); }}>
      <PageHeader
        title="Content Studio"
        sub="Drop clips, describe the video, and SOCIA cuts it. You review the cut, then render it."
        status={meta ? <span className="ov-status"><i className={meta.transcription ? "live" : ""} />{meta.transcription ? "Speech is transcribed with timestamps" : "No transcription service configured. Clips are understood from frames and measured sound"}</span> : null}
        actions={
          <>
            {project && !open && <button type="button" className="ov-btn ghost" onClick={() => { setProject(null); setLocals([]); setBuilds([]); setOpen(null); router.replace(`${pathname}?mode=prompt`, { scroll: false }); void loadMeta(); }}><FolderOpen size={14} /> Projects</button>}
            {open && <button type="button" className="ov-btn ghost" onClick={() => setOpen(null)}><PenLine size={14} /> Back to the brief</button>}
            <button type="button" className="ov-btn primary" disabled={busy || Boolean(open)} onClick={() => input.current?.click()}><Upload size={14} /> Add clips</button>
            <input ref={input} type="file" hidden accept="video/mp4,video/quicktime,video/webm,video/*" multiple onChange={(e) => { if (e.target.files) void onFiles(e.target.files); e.target.value = ""; }} />
          </>
        }
      />
      {modeTabs}

      {migration && <div className="ov-card st-error cb-notice"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><b>This isn&apos;t set up in the database yet</b><p>{migration}</p></div></div>}
      {planError && <div className="ov-card st-error cb-notice"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><PlanNotice error={planError} compact onCta={() => setPlanError(null)} /></div></div>}
      {notice && <div className="cal2-toast cb-toast" role="status">{notice}<button type="button" className="ov-x" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button></div>}

      {open ? (
        <ClipBuilder buildId={open.id} title={open.prompt ? titleFromPrompt(open.prompt) : "Your video"} onBack={() => { setOpen(null); if (project) void loadBuilds(project.id); }} />
      ) : (
        <div className="st-grid pv-grid">
          <div className="st-preview pv-left">
            {project && locals.length > 0 ? (
              <>
                <div className="ov-card cb-bar">
                  <div className="cb-bar-facts">
                    <b><Clapperboard size={14} /> {readyClips.length} clip{readyClips.length === 1 ? "" : "s"}{uploading ? ` · ${locals.filter((l) => l.phase !== "done" && l.phase !== "error" && l.phase !== "duplicate").length} adding` : ""}</b>
                    <span>{fmtMinutes(footageSec)} of footage · {(bytes / 1024 / 1024).toFixed(0)} MB{readyClips.length ? ` · ${understood} of ${readyClips.length} understood` : ""}</span>
                  </div>
                  <div className="cb-bar-actions">{meta?.usage && <UsageLine meter="content_build" used={meta.usage.used} limit={meta.usage.limit} resetsOn={meta.usage.resetsOn} always />}</div>
                </div>
                {understanding ? <UnderstandCard progress={project.progress} clipCount={readyClips.length} /> : dropZone(true)}
                <ClipGrid clips={locals} onRemove={(c) => void uploads.removeClip(c)} busy={uploading || busy} />
              </>
            ) : dropZone(false)}
            {!project && !migration && <ProjectList projects={projects} onOpen={(id) => void openProject(id)} onDelete={() => undefined} busy={uploading} />}
          </div>

          <div className="st-work pv-right">
            <div className="ov-card pv-brief">
              <h2>Describe the video</h2>
              <p className="pv-hint">What it is about, how long, the feeling, the opening, what the viewer should do at the end. Rough is fine; SOCIA can make it detailed.</p>
              <textarea className="pv-textarea" value={prompt} maxLength={2000} rows={7} disabled={busy} placeholder="A 20 second reel of the morning pour. Open on the steam, upbeat but calm, end by asking people to come try the new beans." onChange={(e) => { setPrompt(e.target.value); if (before != null && e.target.value !== prompt) { setBefore(null); setAssumptions([]); } }} />
              <div className="pv-brief-actions">
                <span className="pv-count">{prompt.trim().length < PROMPT_MIN ? `${PROMPT_MIN - prompt.trim().length} more characters` : `${prompt.length} / 2000`}</span>
                {before != null && <button type="button" className="ov-btn ghost small" onClick={() => { setPrompt(before); setBefore(null); setAssumptions([]); }}><Undo2 size={12} /> Back to my version</button>}
                <button type="button" className="ov-btn ghost small" disabled={!project || improving || busy || prompt.trim().length < PROMPT_MIN} onClick={() => void improve()}>
                  {improving ? <Loader2 size={12} className="spin" /> : <PenLine size={12} />} {improving ? "Rewriting" : "Make it more detailed"}
                </button>
              </div>
              {assumptions.length > 0 && (
                <div className="pv-assume">
                  <b>What the rewrite decided for you</b>
                  <ul>{assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
                  <small>Change anything in the text above before cutting.</small>
                </div>
              )}
              {!project && <p className="ov-source">Drop clips first; the brief is cut from them.</p>}
            </div>

            <div className="ov-card pv-make">
              <div>
                <b>Create the video</b>
                <p>{readyClips.length === 0 ? "Needs at least one clip." : understood < readyClips.length ? `SOCIA will understand ${readyClips.length - understood} clip${readyClips.length - understood === 1 ? "" : "s"} first (one clip build credit), then cut.` : "The clips are understood; this cuts straight away."} You review the cut in the builder and render it there{meta && !meta.autoBuild ? " (rendering is on Growth and Pro)" : ""}.</p>
              </div>
              <button type="button" className="ov-btn primary" disabled={!canCreate} onClick={() => void create()}>
                {busy ? <Loader2 size={14} className="spin" /> : <Scissors size={14} />} {busy ? stepNote ?? "Working" : "Create the video"}
              </button>
            </div>

            {builds.length > 0 && (
              <div className="ov-card pv-videos">
                <h2>Your videos from this project</h2>
                <ul>
                  {builds.map((b) => (
                    <li key={b.id}>
                      <button type="button" className="pv-video" onClick={() => setOpen(b)}>
                        <span className="pv-video-title">{b.prompt ? titleFromPrompt(b.prompt) : "Video"}</span>
                        <span className="pv-video-meta">{fmtClock(b.durationSec)} · {b.edl.segments.length} cut{b.edl.segments.length === 1 ? "" : "s"}{b.renderPath ? <> · <Check size={11} /> rendered</> : ""}{b.postId ? <> · <CalendarDays size={11} /> in your Calendar</> : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="st-privacy"><Clapperboard size={11} /> Clips are measured on your device and stored privately. Every cut is yours to change before it is rendered; nothing is posted from here.</div>
    </div>
  );
}
