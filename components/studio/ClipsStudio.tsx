"use client";

// Build from Clips. Flow: upload raw clips → SOCIA understands them →
// Content Yield (which posts the footage really supports, with evidence) →
// open a post → the edit guide. Everything heavy about a clip is measured on
// this device (components/studio/useClipUploads.ts, shared with Footage); the
// server runs the analysis and keeps the project so it survives a refresh.
// Plan limits are enforced by the API; this only shows them.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Upload, Sparkles, AlertTriangle, Loader2, RefreshCw, Layers, FolderOpen } from "lucide-react";
import PageHeader from "../PageHeader";
import PlanNotice, { UsageLine } from "../PlanNotice";
import { isPlanError } from "@/lib/planErrors";
import type { UsageSnapshot } from "@/lib/entitlements";
import type { Opportunity, StudioBuild, StudioProject } from "@/lib/studioClips/types";
import type { ProjectSummary } from "@/lib/studioClips/server";
import { ClipGrid, UnderstandCard, YieldView, OpportunityView, ProjectList, fmtMinutes } from "./ClipsViews";
import PlanPanel from "./PlanPanel";
import LearnCard, { useStudioLearn } from "./LearnCard";
import { useClipUploads } from "./useClipUploads";

type Meta = { limits: { clipsPerProject: number; footageMinutes: number; uploadMb: number; retentionDays: number }; usage: UsageSnapshot | null; transcription: boolean; autoBuild: boolean };

// The video builder pulls in Remotion; load it only when a post is opened for building.
const ClipBuilder = dynamic(() => import("./ClipBuilder"), { ssr: false, loading: () => <div className="ov-card st-progress"><ul><li className="on"><i />Opening the video builder</li></ul></div> });

const POLL_MS = 2500;

export default function ClipsStudio({ modeTabs }: { viewerId: string; modeTabs?: ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const input = useRef<HTMLInputElement>(null);

  const [meta, setMeta] = useState<Meta | null>(null);
  const [migration, setMigration] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<StudioProject | null>(null);
  // Learn: results of posts made from this project's ideas, for the chips on each idea.
  const learn = useStudioLearn(project?.yield ? project.id : null);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState(false);
  const [starting, setStarting] = useState(false);
  const [openOpp, setOpenOpp] = useState<Opportunity | null>(null);
  const [build, setBuild] = useState<StudioBuild | null>(null);
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const projectRef = useRef<StudioProject | null>(null);
  projectRef.current = project;

  // Clip uploads (shared with Footage). After a batch lands or a clip is
  // removed, the project is re-read; the callback is wired once both exist.
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

  const openProject = useCallback(async (id: string, quiet = false): Promise<StudioProject | null> => {
    const res = await fetch(`/api/studio/projects/${id}`).catch(() => null);
    if (!res) return null;
    const j = await res.json().catch(() => null);
    if (!res.ok) { if (!quiet) setNotice(j?.error ?? "Couldn't open that project."); return null; }
    const p = j as StudioProject;
    setProject(p);
    syncLocals(p);
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set("mode", "clips"); sp.set("project", id);
    router.replace(`/studio?${sp.toString()}`, { scroll: false });
    return p;
  }, [params, router, syncLocals, setNotice]);

  onChangedRef.current = async (id) => { await openProject(id, true); void loadMeta(); };

  useEffect(() => { void loadMeta(); }, [loadMeta]);
  useEffect(() => {
    const id = params.get("project");
    if (id && !project) void openProject(id, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll while SOCIA is understanding (also after a refresh mid-run).
  useEffect(() => {
    if (project?.status !== "understanding") return;
    const t = setInterval(async () => {
      const p = await openProject(project.id, true);
      if (p && p.status !== "understanding") { clearInterval(t); void loadMeta(); }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [project?.status, project?.id, openProject, loadMeta]);

  // ----------------------------------------------------------- uploads ----
  const ensureProject = useCallback(async (): Promise<StudioProject | null> => {
    if (projectRef.current) return projectRef.current;
    const res = await fetch("/api/studio/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      if (isPlanError(j)) setPlanError(j); else if (j?.migration) setMigration(j.error); else setNotice(j?.error ?? "Couldn't start a project.");
      return null;
    }
    return openProject(j.id);
  }, [openProject, setPlanError, setNotice]);

  const onFiles = useCallback(async (list: FileList | File[]) => {
    const p = await ensureProject();
    if (!p) return;
    setAdding(true); setOpenOpp(null);
    await uploads.addFiles(list, p);
  }, [ensureProject, uploads]);

  // -------------------------------------------------------- understand ----
  const understand = useCallback(async () => {
    if (!project) return;
    setStarting(true); setPlanError(null); setNotice(null);
    const res = await fetch(`/api/studio/projects/${project.id}/understand`, { method: "POST" });
    const j = await res.json().catch(() => null);
    setStarting(false);
    if (!res.ok) {
      if (isPlanError(j)) setPlanError(j);
      else if (res.status === 409 && j?.running) { setProject({ ...project, status: "understanding" }); }
      else setNotice(j?.error ?? "Couldn't start.");
      return;
    }
    setAdding(false);
    setProject({ ...project, status: "understanding", error: null, progress: null });
    if (j?.usage) setMeta((m) => (m ? { ...m, usage: j.usage } : m));
  }, [project, setPlanError, setNotice]);

  const openOpportunity = useCallback(async (o: Opportunity) => {
    if (!project) return;
    setOpenOpp(o); setBuild(null); setBuildError(null); setBuildLoading(true);
    const get = await fetch(`/api/studio/projects/${project.id}/opportunities/${o.idx}`);
    if (get.ok) { setBuild(await get.json()); setBuildLoading(false); return; }
    const post = await fetch(`/api/studio/projects/${project.id}/opportunities/${o.idx}`, { method: "POST" });
    const j = await post.json().catch(() => null);
    setBuildLoading(false);
    if (!post.ok) { setBuildError(j?.error ?? "Something went wrong."); return; }
    setBuild(j);
    setProject((p) => (p && !p.builds.includes(o.idx) ? { ...p, builds: [...p.builds, o.idx] } : p));
  }, [project]);

  const deleteProject = useCallback(async (id: string) => {
    if (!window.confirm("Delete this project and its uploaded clips?")) return;
    const res = await fetch(`/api/studio/projects/${id}`, { method: "DELETE" });
    if (!res.ok) { setNotice("Couldn't delete that project."); return; }
    if (project?.id === id) { setProject(null); setLocals([]); router.replace("/studio?mode=clips", { scroll: false }); }
    void loadMeta();
  }, [project, router, loadMeta, setLocals, setNotice]);

  // ------------------------------------------------------------ derive ----
  const { locals, uploading, readyClips, footageSec, bytes, planError, notice } = uploads;
  const stale = Boolean(project?.yield && project.status === "collecting");
  const view: "start" | "collect" | "understanding" | "yield" | "opportunity" | "builder" =
    !project ? "start" : project.status === "understanding" ? "understanding" : openOpp && building && build ? "builder" : openOpp ? "opportunity" : project.yield && !adding ? "yield" : "collect";
  const canUnderstand = readyClips.length > 0 && !uploading && !starting;
  const limits = meta?.limits;

  const dropZone = (compact: boolean) => (
    <div className={`st-drop cb-drop${compact ? " compact" : ""}${drag ? " drag" : ""}`} role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}>
      <span className="st-drop-ico"><Upload size={compact ? 16 : 22} /></span>
      <b>{drag ? "Drop them" : compact ? "Drop more clips, or click to browse" : "Drop your raw clips here, or click to browse"}</b>
      {!compact && <p>MP4 or MOV, the raw footage from your phone. SOCIA measures each clip on your device, keeps a few frames and the sound for analysis, and stores the footage privately{limits ? ` for ${limits.retentionDays} days` : ""}.</p>}
      {limits && <small className="cb-limits">Up to {limits.clipsPerProject} clips · {limits.footageMinutes} minutes · {limits.uploadMb} MB per project</small>}
    </div>
  );

  return (
    <div className="st cb" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length && view !== "understanding") void onFiles(e.dataTransfer.files); }}>
      <PageHeader
        title="Content Studio"
        sub="Upload raw clips. SOCIA tells you which posts are in them, and how to make each one."
        status={meta ? <span className="ov-status"><i className={meta.transcription ? "live" : ""} />{meta.transcription ? "Speech is transcribed with timestamps" : "No transcription service configured — clips are understood from frames and measured sound"}</span> : null}
        actions={
          <>
            {project && view !== "understanding" && <button type="button" className="ov-btn ghost" onClick={() => { setProject(null); setLocals([]); setOpenOpp(null); setBuilding(false); setAdding(false); router.replace("/studio?mode=clips", { scroll: false }); void loadMeta(); }}><FolderOpen size={14} /> Projects</button>}
            <button type="button" className="ov-btn primary" disabled={view === "understanding"} onClick={() => input.current?.click()}><Upload size={14} /> Add clips</button>
            <input ref={input} type="file" hidden accept="video/mp4,video/quicktime,video/webm,video/*" multiple onChange={(e) => { if (e.target.files) void onFiles(e.target.files); e.target.value = ""; }} />
          </>
        }
      />
      {modeTabs}

      {migration && (
        <div className="ov-card st-error cb-notice"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><b>Build from Clips isn&apos;t set up in the database yet</b><p>{migration}</p></div></div>
      )}
      {planError && <div className="ov-card st-error cb-notice"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><PlanNotice error={planError} compact onCta={() => setPlanError(null)} /></div></div>}
      {notice && <div className="cal2-toast cb-toast" role="status">{notice}<button type="button" className="ov-x" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button></div>}

      {view === "start" && !migration && (
        <div className="st-grid empty">
          <div className="st-preview">{dropZone(false)}</div>
          <div className="st-work">
            <div className="ov-card st-intro">
              <h2>What happens</h2>
              <ul>
                <li><b>1 · Upload</b><span>Drop everything from the shoot. Each clip is measured here first — length, picture, sound — and uploaded privately.</span></li>
                <li><b>2 · Understand</b><span>Speech is transcribed with timestamps; SOCIA reads a few frames per clip and writes down what&apos;s in it and where the strong moments are. Done once per clip and remembered.</span></li>
                <li><b>3 · Content Yield</b><span>SOCIA groups clips that belong together and counts only posts with enough distinct, usable footage. If 20 clips make one post, it says one.</span></li>
                <li><b>4 · Edit guide</b><span>Open a post and get the exact cut: which clip, which seconds, the on-screen text, what to brighten or turn up, the recommended length.</span></li>
              </ul>
              <p className="ov-source">No invented scores. Picture and sound fixes appear only where the measurements support them. Music is a recommendation — SOCIA never adds a track.</p>
            </div>
            <LearnCard />
            <ProjectList projects={projects} onOpen={(id) => void openProject(id)} onDelete={(id) => void deleteProject(id)} busy={uploading} />
          </div>
        </div>
      )}

      {(view === "collect" || view === "understanding") && project && (
        <div className="cb-collect">
          <div className="ov-card cb-bar">
            <div className="cb-bar-facts">
              <b><Layers size={14} /> {readyClips.length} clip{readyClips.length === 1 ? "" : "s"}{uploading ? ` · ${locals.filter((l) => l.phase !== "done" && l.phase !== "error" && l.phase !== "duplicate").length} adding` : ""}</b>
              <span>{fmtMinutes(footageSec)} of footage · {(bytes / 1024 / 1024).toFixed(0)} MB</span>
              {stale && <span className="cb-stale-inline"><AlertTriangle size={12} /> Footage changed — understand again</span>}
              {project.status === "failed" && project.error && <span className="cb-stale-inline"><AlertTriangle size={12} /> {project.error}</span>}
            </div>
            <div className="cb-bar-actions">
              {meta?.usage && <UsageLine meter="content_build" used={meta.usage.used} limit={meta.usage.limit} resetsOn={meta.usage.resetsOn} always />}
              {view === "collect" && project.yield && <button type="button" className="ov-btn ghost small" onClick={() => setAdding(false)}>Back to results</button>}
              {view === "collect" && (
                <button type="button" className="ov-btn primary" disabled={!canUnderstand} onClick={() => void understand()}>
                  {starting ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} {project.yield ? "Understand again" : "Understand this footage"}
                </button>
              )}
            </div>
          </div>
          {locals.length > 0 && <ClipGrid clips={locals} onRemove={(c) => void uploads.removeClip(c)} busy={uploading || view === "understanding"} />}
          {view === "understanding" ? <UnderstandCard progress={project.progress} clipCount={readyClips.length} /> : dropZone(locals.length > 0)}
          {view === "collect" && project.status === "failed" && (
            <div className="ov-card st-error"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><b>Understanding didn&apos;t finish</b><p>{project.error ?? "Something went wrong."} Nothing was counted against your plan.</p><button type="button" className="ov-btn ghost small" onClick={() => void understand()}><RefreshCw size={12} /> Try again</button></div></div>
          )}
        </div>
      )}

      {view === "yield" && project?.yield && (
        <>
          <YieldView y={project.yield} clips={project.clips} builds={project.builds} onOpen={(o) => void openOpportunity(o)} onAddMore={() => setAdding(true)} stale={stale} outcomes={learn?.outcomes} />
          {project.yield.opportunities.length > 0 && <PlanPanel projectId={project.id} stale={stale} />}
        </>
      )}

      {view === "opportunity" && project && openOpp && (
        <OpportunityView o={openOpp} build={build} clips={project.clips} loading={buildLoading} error={buildError} onBack={() => { setOpenOpp(null); setBuild(null); }} onRetry={() => void openOpportunity(openOpp)} canMake={meta ? meta.autoBuild : null} onMake={() => setBuilding(true)} />
      )}

      {view === "builder" && openOpp && build && (
        <ClipBuilder buildId={build.id} title={openOpp.title} onBack={() => { setBuilding(false); void openOpportunity(openOpp); }} />
      )}

      <div className="st-privacy"><Sparkles size={11} /> Clips are measured on your device and stored privately. SOCIA counts a post only when the footage supports it.</div>
    </div>
  );
}
