"use client";

// Footage: the standing clip library. One place to drop raw clips whenever
// you shoot. SOCIA understands what is new (one clip build credit per look),
// keeps the posts it finds, and every cut becomes a draft the person reviews.
// Nothing is posted from here on its own. The library is a Build-from-Clips
// project of kind "library", so the clip grid, understanding, Content Yield,
// the builder and Plan These Posts are the same components as in the Studio.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Upload, ScanSearch, AlertTriangle, Loader2, RefreshCw, Layers, Film, CalendarDays, Check, Lock } from "lucide-react";
import PageHeader from "../PageHeader";
import PlanNotice, { UsageLine } from "../PlanNotice";
import { isPlanError } from "@/lib/planErrors";
import type { UsageSnapshot } from "@/lib/entitlements";
import type { Opportunity, StudioBuild, StudioProject } from "@/lib/studioClips/types";
import { libraryStatus, libraryLine, type LibraryBuild } from "@/lib/studioClips/library";
import { ClipGrid, UnderstandCard, YieldView, OpportunityView, fmtMinutes } from "../studio/ClipsViews";
import PlanPanel from "../studio/PlanPanel";
import { useStudioLearn } from "../studio/LearnCard";
import { useClipUploads } from "../studio/useClipUploads";

type Meta = { limits: { clipsPerProject: number; footageMinutes: number; uploadMb: number; retentionDays: number }; usage: UsageSnapshot | null; transcription: boolean; autoBuild: boolean };
type Payload = { library: StudioProject | null; builds: LibraryBuild[]; limits: Meta["limits"]; usage: UsageSnapshot | null; transcription: boolean; features?: { autoBuild?: boolean }; error?: string; migration?: boolean };

const ClipBuilder = dynamic(() => import("../studio/ClipBuilder"), { ssr: false, loading: () => <div className="ov-card st-progress"><ul><li className="on"><i />Opening the video builder</li></ul></div> });

const POLL_MS = 2500;

export default function FootagePage() {
  const input = useRef<HTMLInputElement>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [migration, setMigration] = useState<string | null>(null);
  const [library, setLibrary] = useState<StudioProject | null>(null);
  const [builds, setBuilds] = useState<LibraryBuild[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [drag, setDrag] = useState(false);
  const [starting, setStarting] = useState(false);
  const [openOpp, setOpenOpp] = useState<Opportunity | null>(null);
  const [build, setBuild] = useState<StudioBuild | null>(null);
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const libraryRef = useRef<StudioProject | null>(null);
  libraryRef.current = library;

  const uploads = useClipUploads({ onChanged: async () => { await load(true); } });
  const { syncLocals, setPlanError, setNotice } = uploads;
  const learn = useStudioLearn(library?.yield ? library.id : null);

  // ---------------------------------------------------------- loading ----
  const apply = useCallback((j: Payload) => {
    setMeta({ limits: j.limits, usage: j.usage ?? null, transcription: Boolean(j.transcription), autoBuild: Boolean(j.features?.autoBuild) });
    setBuilds(j.builds ?? []);
    setLibrary(j.library);
    if (j.library) syncLocals(j.library);
  }, [syncLocals]);

  const load = useCallback(async (quiet = false): Promise<StudioProject | null> => {
    const res = await fetch("/api/footage").catch(() => null);
    if (!res) { if (!quiet) setNotice("Couldn't reach SOCIA. Check your connection and try again."); return null; }
    const j = (await res.json().catch(() => null)) as Payload | null;
    setLoaded(true);
    if (res.status === 503 && j?.migration) { setMigration(j.error ?? "Footage isn't set up yet."); return null; }
    if (!res.ok || !j) { if (!quiet) setNotice(j?.error ?? "Couldn't load your footage."); return null; }
    apply(j);
    return j.library;
  }, [apply, setNotice]);

  useEffect(() => { void load(); }, [load]);

  /** The library row exists once the first clip is dropped (owners and admins; plan feature). */
  const ensureLibrary = useCallback(async (): Promise<StudioProject | null> => {
    if (libraryRef.current) return libraryRef.current;
    const res = await fetch("/api/footage", { method: "POST" });
    const j = (await res.json().catch(() => null)) as Payload | null;
    if (!res.ok || !j) {
      if (isPlanError(j)) setPlanError(j); else if (j?.migration) setMigration(j.error ?? ""); else setNotice(j?.error ?? "Couldn't start your footage library.");
      return null;
    }
    apply(j);
    return j.library;
  }, [apply, setPlanError, setNotice]);

  // Poll while SOCIA is understanding (also after a refresh mid-run).
  useEffect(() => {
    if (library?.status !== "understanding") return;
    const t = setInterval(async () => {
      const p = await load(true);
      if (p && p.status !== "understanding") clearInterval(t);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [library?.status, load]);

  // ----------------------------------------------------------- actions ----
  const onFiles = useCallback(async (list: FileList | File[]) => {
    if (libraryRef.current?.status === "understanding") { setNotice("Wait for SOCIA to finish looking at the footage, then add more."); return; }
    const lib = await ensureLibrary();
    if (!lib) return;
    setOpenOpp(null); setBuilding(false);
    await uploads.addFiles(list, lib);
  }, [ensureLibrary, uploads, setNotice]);

  const understand = useCallback(async () => {
    const lib = libraryRef.current;
    if (!lib) return;
    setStarting(true); setPlanError(null); setNotice(null);
    const res = await fetch(`/api/studio/projects/${lib.id}/understand`, { method: "POST" });
    const j = await res.json().catch(() => null);
    setStarting(false);
    if (!res.ok) {
      if (isPlanError(j)) setPlanError(j);
      else if (res.status === 409 && j?.running) setLibrary({ ...lib, status: "understanding" });
      else setNotice(j?.error ?? "Couldn't start.");
      return;
    }
    setLibrary({ ...lib, status: "understanding", error: null, progress: null });
    if (j?.usage) setMeta((m) => (m ? { ...m, usage: j.usage } : m));
  }, [setPlanError, setNotice]);

  const openOpportunity = useCallback(async (o: Opportunity) => {
    const lib = libraryRef.current;
    if (!lib) return;
    setOpenOpp(o); setBuild(null); setBuildError(null); setBuildLoading(true);
    const get = await fetch(`/api/studio/projects/${lib.id}/opportunities/${o.idx}`);
    if (get.ok) { setBuild(await get.json()); setBuildLoading(false); return; }
    const post = await fetch(`/api/studio/projects/${lib.id}/opportunities/${o.idx}`, { method: "POST" });
    const j = await post.json().catch(() => null);
    setBuildLoading(false);
    if (!post.ok) { setBuildError(j?.error ?? "Something went wrong."); return; }
    setBuild(j);
    setLibrary((p) => (p && !p.builds.includes(o.idx) ? { ...p, builds: [...p.builds, o.idx] } : p));
    void load(true);
  }, [load]);

  // ------------------------------------------------------------ derive ----
  const status = useMemo(() => libraryStatus(library ?? { clips: [], yield: null }, builds), [library, builds]);
  const understanding = library?.status === "understanding";
  const view: "opportunity" | "builder" | "library" = openOpp && building && build ? "builder" : openOpp ? "opportunity" : "library";
  const canUnderstand = uploads.readyClips.length > 0 && !uploads.uploading && !starting && !understanding;
  const limits = meta?.limits;
  const retention = limits?.retentionDays ?? null;
  const empty = loaded && !migration && uploads.locals.length === 0;

  const dropZone = (compact: boolean) => (
    <div className={`st-drop cb-drop${compact ? " compact" : ""}${drag ? " drag" : ""}`} role="button" tabIndex={0} aria-disabled={understanding || undefined} onClick={() => !understanding && input.current?.click()} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !understanding) { e.preventDefault(); input.current?.click(); } }}>
      <span className="st-drop-ico"><Upload size={compact ? 16 : 22} /></span>
      <b>{drag ? "Drop them" : compact ? "Drop more clips, or click to browse" : "Drop your raw clips here, or click to browse"}</b>
      {!compact && <p>MP4 or MOV, straight from your phone. Each clip is measured on this device, a few frames and the sound are kept for analysis, and the footage is stored privately{retention ? ` for ${retention} days` : ""}.</p>}
      {limits && !compact && <small className="cb-limits">Up to {limits.clipsPerProject} clips · {limits.footageMinutes} minutes · {limits.uploadMb} MB on file at a time</small>}
    </div>
  );

  return (
    <div className="st cb" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) void onFiles(e.dataTransfer.files); }}>
      <PageHeader
        title="Footage"
        sub={loaded && !migration ? libraryLine(status, retention) : "Your standing clip library."}
        status={meta ? <span className="ov-status"><i className={meta.transcription ? "live" : ""} />{meta.transcription ? "Speech is transcribed with timestamps" : "No transcription service configured. Clips are understood from frames and measured sound"}</span> : null}
        actions={
          <>
            {view !== "library" && <button type="button" className="ov-btn ghost" onClick={() => { setOpenOpp(null); setBuild(null); setBuilding(false); }}><Film size={14} /> Library</button>}
            <button type="button" className="ov-btn primary" disabled={understanding || Boolean(migration)} onClick={() => input.current?.click()}><Upload size={14} /> Add clips</button>
            <input ref={input} type="file" hidden accept="video/mp4,video/quicktime,video/webm,video/*" multiple onChange={(e) => { if (e.target.files) void onFiles(e.target.files); e.target.value = ""; }} />
          </>
        }
      />

      {migration && (
        <div className="ov-card st-error cb-notice"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><b>Footage isn&apos;t set up in the database yet</b><p>{migration}</p></div></div>
      )}
      {uploads.planError && <div className="ov-card st-error cb-notice"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><PlanNotice error={uploads.planError} compact onCta={() => setPlanError(null)} /></div></div>}
      {uploads.notice && <div className="cal2-toast cb-toast" role="status">{uploads.notice}<button type="button" className="ov-x" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button></div>}

      {view === "library" && !migration && (
        <>
          {empty ? (
            <div className="st-grid empty">
              <div className="st-preview">{dropZone(false)}</div>
              <div className="st-work">
                <div className="ov-card st-intro fl-how">
                  <h2>How Footage works</h2>
                  <ul>
                    <li><b>Drop clips</b><span>Whenever you shoot. No project to start; the library is always here, one per brand.</span></li>
                    <li><b>SOCIA looks</b><span>Press Find posts when there is new footage. New clips are transcribed and understood once; clips it has seen are remembered. One clip build credit per look.</span></li>
                    <li><b>Posts appear</b><span>Only posts the footage really supports, with the clips and seconds behind each one. Open one for the exact cut, make the video, or place it in your Calendar.</span></li>
                    <li><b>You approve</b><span>Every cut becomes a draft. SOCIA never schedules or posts from here on its own.</span></li>
                  </ul>
                  <p className="ov-source">Footage is kept{retention ? ` for ${retention} days` : " for a limited time"}; what SOCIA learned about each clip stays.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="cb-collect fl-top">
              {library && (
                <div className="ov-card cb-bar">
                  <div className="cb-bar-facts">
                    <b><Layers size={14} /> {uploads.readyClips.length} clip{uploads.readyClips.length === 1 ? "" : "s"}{uploads.uploading ? ` · ${uploads.locals.filter((l) => l.phase !== "done" && l.phase !== "error" && l.phase !== "duplicate").length} adding` : ""}</b>
                    <span>{fmtMinutes(uploads.footageSec)} of footage · {(uploads.bytes / 1024 / 1024).toFixed(0)} MB</span>
                    {status.stale && <span className="cb-stale-inline"><AlertTriangle size={12} /> {status.newSinceYield} new clip{status.newSinceYield === 1 ? "" : "s"} SOCIA hasn&apos;t looked at</span>}
                    {library.status === "failed" && library.error && <span className="cb-stale-inline"><AlertTriangle size={12} /> {library.error}</span>}
                  </div>
                  <div className="cb-bar-actions">
                    {meta?.usage && <UsageLine meter="content_build" used={meta.usage.used} limit={meta.usage.limit} resetsOn={meta.usage.resetsOn} always />}
                    {!understanding && (
                      <button type="button" className={`ov-btn ${status.hasYield && !status.stale ? "ghost" : "primary"}`} disabled={!canUnderstand} onClick={() => void understand()}>
                        {starting ? <Loader2 size={14} className="spin" /> : <ScanSearch size={14} />} {status.hasYield ? (status.stale ? "Find posts in the new footage" : "Look again") : "Find posts in this footage"}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {understanding && library ? <UnderstandCard progress={library.progress} clipCount={uploads.readyClips.length} /> : dropZone(true)}
              {uploads.locals.length > 0 && <ClipGrid clips={uploads.locals} onRemove={(c) => void uploads.removeClip(c)} busy={uploads.uploading || understanding} />}
              {library?.status === "failed" && !understanding && (
                <div className="ov-card st-error"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><b>Understanding didn&apos;t finish</b><p>{library.error ?? "Something went wrong."} Nothing was counted against your plan.</p><button type="button" className="ov-btn ghost small" onClick={() => void understand()}><RefreshCw size={12} /> Try again</button></div></div>
              )}
              {library?.yield && !understanding && (
                <>
                  {(status.rendered > 0 || status.drafted > 0) && (
                    <ul className="fl-made" aria-label="What SOCIA made from this footage">
                      {status.drafted > 0 && <li><CalendarDays size={13} /> {status.drafted} draft{status.drafted === 1 ? "" : "s"} in your Calendar</li>}
                      {status.rendered > 0 && <li><Check size={13} /> {status.rendered} video{status.rendered === 1 ? "" : "s"} rendered</li>}
                    </ul>
                  )}
                  <YieldView y={library.yield} clips={library.clips} builds={library.builds} onOpen={(o) => void openOpportunity(o)} onAddMore={() => input.current?.click()} stale={status.stale} outcomes={learn?.outcomes} />
                  {library.yield.opportunities.length > 0 && <PlanPanel projectId={library.id} stale={status.stale} />}
                </>
              )}
            </div>
          )}
        </>
      )}

      {view === "opportunity" && library && openOpp && (
        <OpportunityView o={openOpp} build={build} clips={library.clips} loading={buildLoading} error={buildError} onBack={() => { setOpenOpp(null); setBuild(null); }} onRetry={() => void openOpportunity(openOpp)} canMake={meta ? meta.autoBuild : null} onMake={() => setBuilding(true)} />
      )}

      {view === "builder" && openOpp && build && (
        <ClipBuilder buildId={build.id} title={openOpp.title} onBack={() => { setBuilding(false); void openOpportunity(openOpp); }} />
      )}

      <div className="st-privacy"><Lock size={11} /> Clips are measured on your device and stored privately. SOCIA counts a post only when the footage supports it, and posts nothing on its own.</div>
    </div>
  );
}
