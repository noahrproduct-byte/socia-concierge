"use client";

// Build from Clips. Flow: upload raw clips → SOCIA understands them →
// Content Yield (which posts the footage really supports, with evidence) →
// open a post → the edit guide. Everything heavy about a clip is measured on
// this device; the server runs the analysis and keeps the project so it
// survives a refresh. Plan limits are enforced by the API; this only shows them.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { Upload, Sparkles, AlertTriangle, Loader2, RefreshCw, Layers, FolderOpen, Scissors } from "lucide-react";
import PageHeader from "../PageHeader";
import PlanNotice, { UsageLine } from "../PlanNotice";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import type { UsageSnapshot } from "@/lib/entitlements";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { fingerprintFile, probeClip, ingestClip } from "@/lib/studioClips/ingest";
import { STUDIO_BUCKET, type BuildPlayerData, type Opportunity, type StudioBuild, type StudioClip, type StudioProject } from "@/lib/studioClips/types";
import type { ProjectSummary } from "@/lib/studioClips/server";
import { ClipGrid, UnderstandCard, YieldView, OpportunityView, ProjectList, fmtMinutes, type LocalClip } from "./ClipsViews";
import BatchPanel from "./BatchPanel";
import BriefPanel from "./BriefPanel";
import VideoList from "./VideoList";
import ClipLibrary from "./ClipLibrary";
import { takeHandoff } from "@/lib/studioClips/handoff";
import { overlayStyle, placeOverlays, type OverlayLine } from "@/lib/studioClips/overlay";
import { fileLabel } from "@/lib/publishing/postLabel";
import type { VideoSummary } from "@/lib/studioClips/videos";
import LearnCard, { useStudioLearn } from "./LearnCard";

type Meta = { limits: { clipsPerProject: number; footageMinutes: number; uploadMb: number }; usage: UsageSnapshot | null; transcription: boolean; autoBuild: boolean };

// The video builder pulls in Remotion; load it only when a post is opened for building.
const ClipBuilder = dynamic(() => import("./ClipBuilder"), { ssr: false, loading: () => <div className="ov-card st-progress"><ul><li className="on"><i />Opening the video builder</li></ul></div> });
type Paths = { folder: string; source: string; frames: string; audio: string };

const VIDEO_RE = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;
const UPLOAD_CONCURRENCY = 2;
const POLL_MS = 2500;

const errCopy = (e: unknown): string => {
  const m = e instanceof Error ? e.message : String(e);
  if (m === "unsupported") return "Couldn't read this file in the browser. Export it as an H.264 MP4 and add it again.";
  if (m === "too_long") return "Longer than 10 minutes — trim it first.";
  if (m === "too_short") return "Shorter than a second.";
  return m.replace(/^Upload failed: /, "");
};

export default function ClipsStudio({ viewerId, modeTabs, variant = "build" }: {
  viewerId: string; modeTabs?: ReactNode;
  /** build: SOCIA understands the clips as soon as they're in and leads with Make and schedule. edit: the person's videos, and new footage opens straight in the editor. audio: a video dropped here opens on Music, with a track added from the brand's taste. */
  variant?: "build" | "edit" | "audio";
}) {
  const editing = variant === "edit";
  const audio = variant === "audio";
  const modeParam = editing ? "edit" : audio ? "audio" : "clips";
  const router = useRouter();
  const params = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const input = useRef<HTMLInputElement>(null);

  const [meta, setMeta] = useState<Meta | null>(null);
  const [migration, setMigration] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<StudioProject | null>(null);
  // Learn: results of posts made from this project's ideas, for the chips on each idea.
  const learn = useStudioLearn(project?.yield ? project.id : null);
  const [locals, setLocals] = useState<LocalClip[]>([]);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState(false);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [openOpp, setOpenOpp] = useState<Opportunity | null>(null);
  const [build, setBuild] = useState<StudioBuild | null>(null);
  const [buildLoading, setBuildLoading] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  // The person's own edit of these clips (Editor V1, every plan, no AI).
  const [manual, setManual] = useState<StudioBuild | null>(null);
  // A cut made from a prompt or a reference video, open in the editor.
  const [custom, setCustom] = useState<{ id: string; title: string; panel?: "text" | "audio" } | null>(null);
  const [manualBusy, setManualBusy] = useState(false);
  const [building, setBuilding] = useState(false);
  const [busyIds, setBusyIds] = useState(0);
  const [autoStart, setAutoStart] = useState(false);
  const [autoAudio, setAutoAudio] = useState(false);
  // Rate → "Put the text on the video": the lines to put on the clip once it's in.
  const overlaysRef = useRef<OverlayLine[] | null>(null);
  const [autoText, setAutoText] = useState(false);
  // A video idea from the Dashboard: its plan starts the prompt.
  const [startPrompt, setStartPrompt] = useState<string | null>(null);
  // Edit: every video made in this brand (null while loading).
  const [videos, setVideos] = useState<VideoSummary[] | null>(null);
  const projectRef = useRef<StudioProject | null>(null);
  projectRef.current = project;

  // ---------------------------------------------------------- loading ----
  const loadMeta = useCallback(async () => {
    const res = await fetch("/api/studio/projects").catch(() => null);
    if (!res) return;
    const j = await res.json().catch(() => null);
    if (res.status === 503 && j?.migration) { setMigration(j.error); return; }
    if (!res.ok) { setNotice(j?.error ?? "Couldn't load your projects."); return; }
    setMeta({ limits: j.limits, usage: j.usage ?? null, transcription: Boolean(j.transcription), autoBuild: Boolean(j.features?.autoBuild) });
    setProjects(j.projects ?? []);
  }, []);

  const syncLocals = useCallback((p: StudioProject) => {
    setLocals((cur) => {
      const inflight = cur.filter((l) => l.phase !== "done" && l.phase !== "duplicate" && !l.clip);
      const fromServer: LocalClip[] = p.clips.map((c) => {
        const prev = cur.find((l) => l.clip?.id === c.id);
        return {
          key: c.id, name: c.name, phase: c.status === "failed" ? "error" : "done", progress: 1, stageNote: null,
          error: c.status === "failed" ? c.error : null, thumb: c.frames[0]?.url ?? prev?.thumb ?? null, clip: c,
          durationSec: c.durationSec, reused: c.reused,
        };
      });
      return [...fromServer, ...inflight];
    });
  }, []);

  const openProject = useCallback(async (id: string, quiet = false): Promise<StudioProject | null> => {
    const res = await fetch(`/api/studio/projects/${id}`).catch(() => null);
    if (!res) return null;
    const j = await res.json().catch(() => null);
    if (!res.ok) { if (!quiet) setNotice(j?.error ?? "Couldn't open that project."); return null; }
    const p = j as StudioProject;
    setProject(p);
    syncLocals(p);
    const sp = new URLSearchParams(Array.from(params.entries()));
    sp.set("mode", modeParam); sp.set("project", id);
    router.replace(`/studio?${sp.toString()}`, { scroll: false });
    return p;
  }, [params, router, syncLocals, modeParam]);

  const loadVideos = useCallback(async () => {
    const res = await fetch("/api/studio/videos").catch(() => null);
    const j = res?.ok ? ((await res.json().catch(() => null)) as { videos?: VideoSummary[] } | null) : null;
    setVideos(j?.videos ?? []);
  }, []);

  useEffect(() => { void loadMeta(); }, [loadMeta]);
  useEffect(() => { if (editing) void loadVideos(); }, [editing, loadVideos]);
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
  }, [openProject]);

  const patchLocal = (key: string, patch: Partial<LocalClip>) => setLocals((cur) => cur.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  type Registered = { key: string; file: File; probe: Awaited<ReturnType<typeof probeClip>>; clip: StudioClip; paths: Paths };

  /** Step 1, one file at a time: identify, measure the basics, reserve the slot (plan limits are checked here). */
  const registerFile = useCallback(async (file: File, p: StudioProject, key: string): Promise<Registered | null> => {
    try {
      patchLocal(key, { phase: "reading", progress: 0.1 });
      const [fingerprint, probe] = await Promise.all([fingerprintFile(file), probeClip(file)]);
      patchLocal(key, { phase: "registering", progress: 0.3, durationSec: probe.durationSec });
      const reg = await fetch("/api/studio/clips", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: p.id, fingerprint, name: file.name, mime: file.type || null, bytes: file.size, durationSec: probe.durationSec, width: probe.width, height: probe.height, recordedAt: file.lastModified ? new Date(file.lastModified).toISOString() : null, ext: file.name.split(".").pop() }),
      });
      const rj = await reg.json().catch(() => null);
      if (reg.status === 409 && rj?.duplicate) { patchLocal(key, { phase: "duplicate", progress: 1 }); return null; }
      if (!reg.ok) {
        if (isPlanError(rj)) { setPlanError(rj); setLocals((cur) => cur.filter((l) => l.key !== key)); return null; }
        throw new Error(rj?.error ?? "Couldn't add this clip.");
      }
      const clip = rj.clip as StudioClip;
      patchLocal(key, { clip, reused: Boolean(rj.reused), phase: "analyzing", progress: 0, stageNote: "Waiting to measure" });
      return { key, file, probe, clip, paths: rj.paths as Paths };
    } catch (e) {
      patchLocal(key, { phase: "error", error: errCopy(e), stageNote: null });
      return null;
    }
  }, []);

  /** Step 2, a couple at a time: frames, sound and facts on this device, then the uploads. */
  const uploadFile = useCallback(async ({ key, file, probe, clip, paths }: Registered) => {
    try {
      patchLocal(key, { phase: "analyzing", progress: 0, stageNote: "Measuring picture and sound" });
      const ingest = await ingestClip(file, probe, (stage, done, total) => patchLocal(key, { progress: total ? done / total : 0, stageNote: stage === "frames" ? "Finding scene changes" : "Reading the sound" }));
      const first = ingest.frames[0];
      if (first) patchLocal(key, { thumb: URL.createObjectURL(first.blob) });

      patchLocal(key, { phase: "uploading", progress: 0, stageNote: "Uploading" });
      await uploadMedia(supabase, STUDIO_BUCKET, paths.source, file, (sent, total) => patchLocal(key, { progress: total ? sent / total : 0 }));
      const framePaths: { t: number; path: string }[] = [];
      for (let i = 0; i < ingest.frames.length; i++) {
        const path = `${paths.frames}${i}.jpg`;
        await uploadMedia(supabase, STUDIO_BUCKET, path, new File([ingest.frames[i].blob], `${i}.jpg`, { type: "image/jpeg" }));
        framePaths.push({ t: ingest.frames[i].t, path });
      }
      let audioPath: string | null = null;
      if (ingest.wav) {
        await uploadMedia(supabase, STUDIO_BUCKET, paths.audio, new File([ingest.wav], "audio.wav", { type: "audio/wav" }));
        audioPath = paths.audio;
      }
      const done = await fetch(`/api/studio/clips/${clip.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourcePath: paths.source, frames: framePaths, audioPath, facts: ingest.facts }) });
      const dj = await done.json().catch(() => null);
      if (!done.ok) throw new Error(dj?.error ?? "Couldn't finish adding this clip.");
      patchLocal(key, { phase: "done", progress: 1, stageNote: null, clip: dj as StudioClip });
    } catch (e) {
      patchLocal(key, { phase: "error", error: errCopy(e), stageNote: null });
    }
  }, [supabase]);

  const onFiles = useCallback(async (list: FileList | File[]) => {
    const files = Array.from(list).filter((f) => f.type.startsWith("video/") || VIDEO_RE.test(f.name));
    if (!files.length) { setNotice("Drop video clips (MP4 or MOV). Photos come in a later step."); return; }
    setPlanError(null);
    const p = await ensureProject();
    if (!p) return;
    setAdding(true); setOpenOpp(null);
    const entries = files.map((f) => ({ key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file: f }));
    setLocals((cur) => [...cur, ...entries.map<LocalClip>((e) => ({ key: e.key, name: e.file.name, phase: "reading", progress: 0, stageNote: null, error: null, thumb: null, clip: null, durationSec: null, reused: false }))]);
    setBusyIds((n) => n + 1);
    // Register in order (positions and plan limits are decided server-side,
    // one clip at a time), then measure and upload a couple at a time.
    const registered: Registered[] = [];
    for (const e of entries) {
      const r = await registerFile(e.file, p, e.key);
      if (r) registered.push(r);
    }
    let i = 0;
    const workers = Array.from({ length: Math.min(UPLOAD_CONCURRENCY, registered.length) }, async () => {
      while (i < registered.length) await uploadFile(registered[i++]);
    });
    await Promise.all(workers);
    setBusyIds((n) => n - 1);
    const fresh = await openProject(p.id, true);
    void loadMeta();
    const usable = Boolean(fresh?.clips.some((c) => c.status === "ready" || c.status === "uploaded"));
    // Audio: the footage opens straight in the editor, on Music. Text from Rate: on Text, with the lines in.
    if (audio && fresh && usable) setAutoAudio(true);
    else if (editing && overlaysRef.current && fresh && usable) setAutoText(true);
    // Build: the first time clips are in, SOCIA starts understanding them without another click.
    // Footage added after a result waits for "Understand again" (each run counts on the plan).
    else if (!editing && fresh && !fresh.yield && fresh.status !== "understanding" && usable) setAutoStart(true);
  }, [ensureProject, registerFile, uploadFile, openProject, loadMeta, editing, audio]);

  // Rate → "Add music" (Audio) or "Put the text on the video" (Video editor): the video comes with it.
  useEffect(() => {
    if (!audio && !editing) return;
    const handed = takeHandoff(audio ? "audio" : "edit");
    if (editing && handed.data.prompt) setStartPrompt(handed.data.prompt);
    if (!handed.files.length) return;
    if (editing) overlaysRef.current = handed.data.overlays?.length ? handed.data.overlays : null;
    void onFiles(handed.files);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeClip = useCallback(async (l: LocalClip) => {
    if (l.clip) {
      const res = await fetch(`/api/studio/clips/${l.clip.id}`, { method: "DELETE" });
      if (!res.ok) { setNotice("Couldn't remove that clip."); return; }
    }
    setLocals((cur) => cur.filter((x) => x.key !== l.key));
    if (project) void openProject(project.id, true);
  }, [project, openProject]);

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
  }, [project]);

  useEffect(() => {
    if (!autoStart || busyIds > 0 || starting) return;
    setAutoStart(false);
    void understand();
  }, [autoStart, busyIds, starting, understand]);

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

  const openManual = useCallback(async () => {
    if (!project) return;
    setManualBusy(true); setNotice(null);
    const res = await fetch(`/api/studio/projects/${project.id}/edit`, { method: "POST" });
    const j = await res.json().catch(() => null);
    setManualBusy(false);
    if (!res.ok) { if (isPlanError(j)) setPlanError(j); else setNotice(j?.error ?? "Couldn't open the editor."); return; }
    setManual(j as StudioBuild);
  }, [project]);

  // Video editor: new clips are understood when the person asks for a video from a prompt or a
  // reference (that's what the cut needs), never just for being added. Waits for the result.
  const ensureUnderstood = useCallback(async (say: (step: string) => void): Promise<string | null> => {
    const p = projectRef.current;
    if (!p) return "Add your clips first.";
    if (busyIds > 0) return "Wait for your clips to finish uploading.";
    if (p.yield && p.status === "ready") return null;
    say("Understanding your clips first (about a minute)…");
    if (p.status !== "understanding") {
      const res = await fetch(`/api/studio/projects/${p.id}/understand`, { method: "POST" }).catch(() => null);
      const j = res ? await res.json().catch(() => null) : null;
      if (!res?.ok && !(res?.status === 409 && j?.running)) {
        if (isPlanError(j)) { setPlanError(j); return "Your plan doesn't have a footage analysis left this month."; }
        return j?.error ?? "SOCIA couldn't understand these clips. Try again.";
      }
      if (j?.usage) setMeta((m) => (m ? { ...m, usage: j.usage } : m));
    }
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const fresh = await openProject(p.id, true);
      if (fresh && fresh.status !== "understanding") return fresh.status === "failed" ? (fresh.error ?? "Understanding didn't finish. Nothing was counted.") : null;
    }
    return "Understanding is taking longer than usual. Try again in a minute.";
  }, [busyIds, openProject]);

  // Video editor: clips picked from Your clips join the video being made here.
  const addFromLibrary = useCallback(async (clipIds: string[]): Promise<string | null> => {
    const p = projectRef.current ?? (await ensureProject());
    if (!p) return "Couldn't start a video.";
    const res = await fetch(`/api/studio/projects/${p.id}/from-library`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clipIds }) }).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    if (!res?.ok) { if (isPlanError(j)) setPlanError(j); return j?.error ?? "Couldn't add those clips."; }
    await openProject(p.id, true);
    const skipped = (j?.skipped as string[] | undefined) ?? [];
    return j?.added ? (skipped.length ? skipped.join(" ") : null) : skipped.join(" ") || "Those clips are already in this video.";
  }, [ensureProject, openProject]);

  // Audio: one video opens as its own cut; several open together in the editor.
  useEffect(() => {
    if (!autoAudio || busyIds > 0 || manualBusy || !project) return;
    setAutoAudio(false);
    const usable = project.clips.filter((c) => c.status === "ready" || c.status === "uploaded");
    if (usable.length !== 1) { void openManual(); return; }
    const clip = usable[0];
    void (async () => {
      setManualBusy(true);
      const res = await fetch(`/api/studio/projects/${project.id}/clip-build`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clipId: clip.id }) }).catch(() => null);
      const j = res ? await res.json().catch(() => null) : null;
      setManualBusy(false);
      if (!res?.ok || !j?.id) { if (isPlanError(j)) setPlanError(j); else setNotice(j?.error ?? "Couldn't open the video."); return; }
      setCustom({ id: j.id as string, title: fileLabel(clip.name) ?? clip.name });
    })();
  }, [autoAudio, busyIds, manualBusy, project, openManual]);

  // The lines from Rate go on the clip in the plain creator look (lib/studioClips/overlay.ts), then it opens on Text.
  useEffect(() => {
    if (!autoText || busyIds > 0 || manualBusy || !project) return;
    setAutoText(false);
    const lines = overlaysRef.current ?? [];
    overlaysRef.current = null;
    const clip = project.clips.filter((c) => c.status === "ready" || c.status === "uploaded").slice(-1)[0];
    if (!clip) return;
    void (async () => {
      setManualBusy(true);
      try {
        const res = await fetch(`/api/studio/projects/${project.id}/clip-build`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clipId: clip.id }) }).catch(() => null);
        const j = res ? await res.json().catch(() => null) : null;
        if (!res?.ok || !j?.id) { if (isPlanError(j)) setPlanError(j); else setNotice(j?.error ?? "Couldn't open the video."); return; }
        const id = j.id as string;
        const title = fileLabel(clip.name) ?? clip.name;
        const pres = await fetch(`/api/studio/builds/${id}`).catch(() => null);
        const pj = pres?.ok ? ((await pres.json().catch(() => null)) as BuildPlayerData | null) : null;
        const edl = pj?.build.edl;
        if (edl) {
          const dur = edl.segments.reduce((a, s) => a + Math.max(0, s.out - s.in), 0);
          const text = placeOverlays(lines, dur);
          if (text.length) {
            const style = overlayStyle({ preset: pj?.presets?.brand?.style ?? null, brightness: clip.facts?.visual?.brightness ?? null });
            const saved = await fetch(`/api/studio/builds/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ edl: { ...edl, text, style } }) }).catch(() => null);
            if (!saved?.ok) setNotice("The video is open, but SOCIA couldn't put the text on it. Add it in Text & captions.");
          } else if (lines.length) {
            setNotice("None of those lines read naturally enough to put on the video. Write your own in Text & captions.");
          }
        }
        setCustom({ id, title, panel: "text" });
      } finally {
        setManualBusy(false);
      }
    })();
  }, [autoText, busyIds, manualBusy, project]);

  const deleteProject = useCallback(async (id: string) => {
    if (!window.confirm("Delete this project and its uploaded clips?")) return;
    const res = await fetch(`/api/studio/projects/${id}`, { method: "DELETE" });
    if (!res.ok) { setNotice("Couldn't delete that project."); return; }
    if (project?.id === id) { setProject(null); setLocals([]); router.replace(`/studio?mode=${modeParam}`, { scroll: false }); }
    void loadMeta();
  }, [project, router, loadMeta, modeParam]);

  // ------------------------------------------------------------ derive ----
  const uploading = busyIds > 0;
  const readyClips = locals.filter((l) => l.phase === "done" && l.clip && (l.clip.status === "uploaded" || l.clip.status === "ready"));
  const footageSec = readyClips.reduce((a, l) => a + (l.durationSec ?? 0), 0);
  const bytes = readyClips.reduce((a, l) => a + (l.clip?.bytes ?? 0), 0);
  const stale = Boolean(project?.yield && project.status === "collecting");
  const view: "start" | "collect" | "understanding" | "yield" | "opportunity" | "builder" | "manual" | "custom" =
    custom ? "custom" : !project ? "start" : manual ? "manual" : project.status === "understanding" ? "understanding" : openOpp && building && build ? "builder" : openOpp ? "opportunity" : project.yield && !adding ? "yield" : "collect";
  const canUnderstand = readyClips.length > 0 && !uploading && !starting;
  const limits = meta?.limits;

  const backToStart = () => {
    setProject(null); setLocals([]); setOpenOpp(null); setBuilding(false); setAdding(false); setCustom(null); setManual(null);
    router.replace(`/studio?mode=${modeParam}`, { scroll: false });
    void loadMeta();
    if (editing) void loadVideos();
  };

  const dropZone = (compact: boolean) => (
    <div className={`st-drop cb-drop${compact ? " compact" : ""}${drag ? " drag" : ""}`} role="button" tabIndex={0} onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}>
      <span className="st-drop-ico"><Upload size={compact ? 16 : 22} /></span>
      <b>{drag ? "Drop them" : compact ? "Drop more clips, or click to browse" : audio ? "Drop a video to add music, or click to browse" : editing ? "Drop your clips here, or click to browse" : "Drop your raw clips here, or click to browse"}</b>
      {!compact && <p>MP4 or MOV{audio ? ". SOCIA listens to it, makes a track for it from your taste and puts it in." : editing ? ", one video or many clips." : ", the raw footage from your phone."} SOCIA measures each clip on your device, keeps a few frames and the sound for analysis, and keeps the footage privately until you delete it, so you can post it again or use it in a new video.</p>}
      {limits && <small className="cb-limits">Up to {limits.clipsPerProject} clips · {limits.footageMinutes} minutes · {limits.uploadMb} MB per project</small>}
    </div>
  );

  return (
    <div className="st cb" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length && view !== "understanding") void onFiles(e.dataTransfer.files); }}>
      <PageHeader
        title="Content Studio"
        sub={audio ? "Drop a video. SOCIA adds music made for it from your taste, and you can hear the others and pick one." : editing ? "Put in your clips, then write what you want or add a video to copy. SOCIA cuts it, and you finish it in the editor." : "Drop your raw clips. SOCIA finds the posts in them, makes the videos and schedules them after you check the list."}
        status={meta ? <span className="ov-status"><i className={meta.transcription ? "live" : ""} />{meta.transcription ? "Speech is transcribed with timestamps" : "No transcription service configured — clips are understood from frames and measured sound"}</span> : null}
        actions={
          <>
            {(project || custom) && view !== "understanding" && <button type="button" className="ov-btn ghost" onClick={backToStart}><FolderOpen size={14} /> {editing ? "Your videos" : "Projects"}</button>}
            <button type="button" className="ov-btn primary" disabled={view === "understanding"} onClick={() => input.current?.click()}><Upload size={14} /> {audio ? "Upload a video" : "Add clips"}</button>
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

      {editing && view !== "custom" && view !== "manual" && !migration && (
        <div className="cb-editor">
          <section className="ov-card cbp" aria-labelledby="cb-ed-clips">
            <div className="cbp-head">
              <h3 id="cb-ed-clips"><Layers size={15} /> Clips for this video</h3>
              {readyClips.length > 0 && <span className="cbp-muted">{readyClips.length} clip{readyClips.length === 1 ? "" : "s"} · {fmtMinutes(footageSec)}{uploading ? " · adding more" : ""}</span>}
            </div>
            {locals.length > 0 && <ClipGrid clips={locals} onRemove={(c) => void removeClip(c)} busy={uploading || view === "understanding"} />}
            {view === "understanding" && project ? <UnderstandCard progress={project.progress} clipCount={readyClips.length} /> : dropZone(locals.length > 0)}
          </section>
          <BriefPanel
            projectId={project && readyClips.length ? project.id : null}
            viewerId={viewerId}
            canMake={meta ? meta.autoBuild : null}
            heading="Prompt and reference"
            initialPrompt={startPrompt}
            noClipsNote="Add clips above first, or pick some from Your clips below."
            beforeMake={ensureUnderstood}
            onOpen={(id, title) => setCustom({ id, title })}
          />
          <div className="ov-card cb-manual">
            <div><b><Scissors size={14} /> Or edit them yourself</b><small>Cut, arrange, reframe and add text and music to these clips by hand. No AI, nothing counted against your plan.</small></div>
            <button type="button" className="ov-btn ghost small" disabled={!readyClips.length || uploading || manualBusy} onClick={() => void openManual()}>{manualBusy ? <Loader2 size={13} className="spin" /> : null} Open the editor</button>
          </div>
          <VideoList videos={videos} onOpen={(v) => setCustom({ id: v.id, title: v.title })} />
          <ClipLibrary onOpenCut={(id, title) => setCustom({ id, title })} onUse={addFromLibrary} useLabel="Add to this video" />
        </div>
      )}

      {view === "start" && !migration && audio && (
        <div className="st-grid empty">
          <div className="st-preview">{dropZone(false)}</div>
          <div className="st-work">
            <div className="ov-card st-intro">
              <h2>What happens</h2>
              <ul>
                <li><b>1 · Drop a video</b><span>It&apos;s measured on this device and kept privately until you delete it.</span></li>
                <li><b>2 · SOCIA picks the music</b><span>From your taste: how your best posts sound, whether music or your own sound has done better, and the tracks you chose before. Lower under speech.</span></li>
                <li><b>3 · Hear the others</b><span>The rest of the playlist is there to listen to and pick instead, with levels for the music and the video&apos;s own sound.</span></li>
                <li><b>4 · Make it and post it</b><span>Make the video with the music in, then schedule it. Each track counts as a music track on your plan.</span></li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {view === "start" && !migration && !editing && !audio && (
        <div className="st-grid empty">
          <div className="st-preview">{dropZone(false)}</div>
          <div className="st-work">
            <div className="ov-card st-intro">
              <h2>What happens</h2>
              <ul>
                <li><b>1 · Drop your clips</b><span>Everything from the shoot. Each clip is measured on this device and uploaded privately.</span></li>
                <li><b>2 · SOCIA understands them</b><span>It starts on its own once the clips are in: speech, scenes and the posts the footage really supports. If 20 clips make one post, it says one. Counts one footage analysis on your plan.</span></li>
                <li><b>3 · Make the videos</b><span>Pick the ideas, post each clip on its own, or describe a video or give a reference to copy. SOCIA makes each one and writes its caption.</span></li>
                <li><b>4 · Check, then schedule</b><span>See every video with its day, time and caption, change anything, then schedule them all with one click. Or tell Ask SOCIA when to post them.</span></li>
              </ul>
              <p className="ov-source">No invented scores. Picture and sound fixes appear only where the measurements support them. From Starter, music made from your taste goes in on its own; you can pick another or take it out.</p>
            </div>
            <LearnCard />
            <ProjectList projects={projects} onOpen={(id) => void openProject(id)} onDelete={(id) => void deleteProject(id)} busy={uploading} />
            <ClipLibrary allowPost={false} />
          </div>
        </div>
      )}

      {!editing && (view === "collect" || view === "understanding") && project && (
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
                <button type="button" className={`ov-btn ${editing ? "primary" : "ghost"}`} disabled={!(readyClips.length > 0 && !uploading) || manualBusy} onClick={() => void openManual()} title="Cut, arrange and export these clips yourself. No AI, nothing counted.">
                  {manualBusy ? <Loader2 size={14} className="spin" /> : <Scissors size={14} />} {editing ? "Open the editor" : "Edit them yourself"}
                </button>
              )}
              {view === "collect" && !editing && (
                <button type="button" className="ov-btn primary" disabled={!canUnderstand} onClick={() => void understand()}>
                  {starting ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} {project.yield ? "Understand again" : "Understand this footage"}
                </button>
              )}
            </div>
          </div>
          {locals.length > 0 && <ClipGrid clips={locals} onRemove={(c) => void removeClip(c)} busy={uploading || view === "understanding"} />}
          {view === "understanding" ? <UnderstandCard progress={project.progress} clipCount={readyClips.length} /> : dropZone(locals.length > 0)}
          {view === "collect" && project.status === "failed" && (
            <div className="ov-card st-error"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><b>Understanding didn&apos;t finish</b><p>{project.error ?? "Something went wrong."} Nothing was counted against your plan.</p><button type="button" className="ov-btn ghost small" onClick={() => void understand()}><RefreshCw size={12} /> Try again</button></div></div>
          )}
        </div>
      )}

      {!editing && view === "yield" && project?.yield && (
        <>
          {!editing && <BatchPanel key={project.id} project={project} autoBuild={meta ? meta.autoBuild : null} />}
          <YieldView y={project.yield} clips={project.clips} builds={project.builds} onOpen={(o) => void openOpportunity(o)} onAddMore={() => setAdding(true)} stale={stale} outcomes={learn?.outcomes} />
          <div className="ov-card cb-manual">
            <div><b><Scissors size={14} /> Edit the clips yourself</b><small>Cut, arrange, reframe and add text to every clip in this project, then export. No AI, nothing counted against your plan.</small></div>
            <button type="button" className="ov-btn ghost small" disabled={manualBusy} onClick={() => void openManual()}>{manualBusy ? <Loader2 size={13} className="spin" /> : null} Open the editor</button>
          </div>
          <BriefPanel projectId={project.id} viewerId={viewerId} canMake={meta ? meta.autoBuild : null} onOpen={(id, title) => setCustom({ id, title })} />
        </>
      )}

      {!editing && view === "opportunity" && project && openOpp && (
        <OpportunityView o={openOpp} build={build} clips={project.clips} loading={buildLoading} error={buildError} onBack={() => { setOpenOpp(null); setBuild(null); }} onRetry={() => void openOpportunity(openOpp)} canMake={meta ? meta.autoBuild : null} onMake={() => setBuilding(true)} />
      )}

      {view === "custom" && custom && (
        <ClipBuilder buildId={custom.id} title={custom.title} initialPanel={custom.panel ?? (audio ? "audio" : undefined)} onBack={() => { if (audio) { backToStart(); return; } setCustom(null); if (editing) void loadVideos(); }} />
      )}

      {view === "manual" && manual && (
        <ClipBuilder buildId={manual.id} title={project?.title || "Your edit"} initialPanel={audio ? "audio" : undefined} onBack={() => { setManual(null); if (editing || audio) backToStart(); }} />
      )}

      {view === "builder" && openOpp && build && (
        <ClipBuilder buildId={build.id} title={openOpp.title} onBack={() => { setBuilding(false); void openOpportunity(openOpp); }} />
      )}

      <div className="st-privacy"><Sparkles size={11} /> Clips are measured on your device and stored privately. SOCIA counts a post only when the footage supports it.</div>
    </div>
  );
}
