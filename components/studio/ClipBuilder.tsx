"use client";

// The video editor. Two kinds of build share it: SOCIA's first cut of a post
// (Make This Video, Growth/Pro) and the person's own edit of their clips
// (Editor V1, every plan; no AI regenerate). Previewed by Remotion from the
// EDL: reorder, trim (by step or at the playhead), split, replace, delete,
// aspect ratio and reframe, text lines, captions on/off, undo/redo. The video is rendered HERE
// in the browser (WebCodecs) and saved as a DRAFT post — nothing is scheduled
// or published without the person doing it in Create Post.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Player, type PlayerRef } from "@remotion/player";
import { ChevronLeft, Undo2, Redo2, Save, ArrowUp, ArrowDown, Trash2, Plus, Minus, Replace, Captions, Sparkles, Loader2, AlertTriangle, Clapperboard, ArrowRight, Check, Type, Music, Crop, Scissors, SkipBack, SkipForward, Palette, Volume2, VolumeX } from "lucide-react";
import PlanNotice from "../PlanNotice";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { ClipComposition } from "./remotion/ClipComposition";
import AudioPanel from "./AudioPanel";
import FinishPanel from "./FinishPanel";
import Timeline from "./Timeline";
import { tracksFor } from "@/lib/studioClips/tracks";
import { timeline } from "@/lib/studioClips/timeline";
import { DEFAULT_STYLE, FONTS, type EdlStyle, type VideoPresets } from "@/lib/studioClips/style";
import { ASPECTS, clipLabel, fmtClock, OUTPUT, REGENERATE_OPTIONS, MAX_REGENERATIONS, type BuildPlayerData, type BuildSource, type Edl, type EdlText, type RegenerateDirective, type StudioBuild } from "@/lib/studioClips/types";

const MIN_SEG = 0.8;
const STEP = 0.5;
const r2 = (n: number) => Number(n.toFixed(2));

type ExportPhase = "idle" | "checking" | "rendering" | "uploading" | "saving" | "done" | "error";
type ExportState = { phase: ExportPhase; progress: number; message: string | null; postId: string | null };

export default function ClipBuilder({ buildId, title, onBack, fixture }: { buildId: string; title: string; onBack: () => void; fixture?: BuildPlayerData }) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<BuildPlayerData | null>(fixture ?? null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanError | null>(null);
  const [edl, setEdl] = useState<Edl | null>(fixture?.build.edl ?? null);
  const [past, setPast] = useState<Edl[]>([]);
  const [future, setFuture] = useState<Edl[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [regen, setRegen] = useState<RegenerateDirective | null>(null);
  const [regenErr, setRegenErr] = useState<string | null>(null);
  const [exp, setExp] = useState<ExportState>({ phase: "idle", progress: 0, message: null, postId: null });
  const [panel, setPanel] = useState<"cut" | "frame" | "style" | "text" | "finish" | "audio" | "regenerate">("cut");
  const [presets, setPresets] = useState<VideoPresets>({ brand: null, templates: [] });
  const [tplName, setTplName] = useState("");
  const [styleNote, setStyleNote] = useState<string | null>(null);
  const [quality, setQuality] = useState<"high" | "medium">("high");
  // Before/After for the measured corrections; the export always uses After.
  const [compare, setCompare] = useState<"before" | "after">("after");
  const player = useRef<PlayerRef>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (fixture) return;
    let alive = true;
    (async () => {
      const res = await fetch(`/api/studio/builds/${buildId}`);
      const j = await res.json().catch(() => null);
      if (!alive) return;
      if (!res.ok) { if (isPlanError(j)) setPlanError(j); else setLoadErr(j?.error ?? "Couldn't load this build."); return; }
      setData(j); setEdl(j.build.edl);
    })();
    return () => { alive = false; abort.current?.abort(); };
  }, [buildId, fixture]);

  useEffect(() => { if (data?.presets) setPresets(data.presets); }, [data?.presets]);
  const sources = useMemo(() => Object.fromEntries((data?.sources ?? []).map((s) => [s.clipId, s])) as Record<string, BuildSource>, [data]);
  const tl = useMemo(() => (edl ? timeline(edl) : null), [edl]);
  const anySpeech = useMemo(() => (edl ? edl.segments.some((s) => sources[s.clipId]?.words?.length) : false), [edl, sources]);
  const captionsOn = Boolean(edl?.captions);
  const tracks = useMemo(() => (edl ? tracksFor(edl, (id) => (sources[id] ? clipLabel(sources[id].position) : "Expired clip"), Object.fromEntries(Object.values(sources).map((x) => [x.clipId, x.words])), captionsOn) : null), [edl, sources, captionsOn]);
  const missing = useMemo(() => (edl ? edl.segments.filter((s) => !sources[s.clipId]).length : 0), [edl, sources]);

  // ------------------------------------------------------------ editing ----
  const commit = useCallback((next: Edl) => {
    setEdl((cur) => { if (cur) setPast((p) => [...p.slice(-30), cur]); return next; });
    setFuture([]); setDirty(true); setSaveErr(null);
  }, []);
  const undo = () => setPast((p) => { const prev = p[p.length - 1]; if (!prev || !edl) return p; setFuture((f) => [edl, ...f]); setEdl(prev); setDirty(true); return p.slice(0, -1); });
  const redo = () => setFuture((f) => { const next = f[0]; if (!next || !edl) return f; setPast((p) => [...p, edl]); setEdl(next); setDirty(true); return f.slice(1); });

  const move = (i: number, dir: -1 | 1) => { if (!edl) return; const j = i + dir; if (j < 0 || j >= edl.segments.length) return; const segs = [...edl.segments]; [segs[i], segs[j]] = [segs[j], segs[i]]; commit({ ...edl, segments: segs }); };
  const trim = (i: number, edge: "in" | "out", delta: number) => {
    if (!edl) return;
    const s = edl.segments[i]; const src = sources[s.clipId]; const dur = src?.durationSec ?? s.out;
    let { in: a, out: b } = s;
    if (edge === "in") a = Math.max(0, Math.min(a + delta, b - MIN_SEG)); else b = Math.min(dur, Math.max(b + delta, a + MIN_SEG));
    commit({ ...edl, segments: edl.segments.map((x, k) => (k === i ? { ...x, in: r2(a), out: r2(b) } : x)) });
  };
  const remove = (i: number) => { if (!edl || edl.segments.length <= 1) return; commit({ ...edl, segments: edl.segments.filter((_, k) => k !== i) }); };
  const replace = (i: number, clipId: string) => {
    if (!edl) return; const src = sources[clipId]; if (!src) return;
    const m = src.moments.find((x) => x.strength !== "weak");
    const a = m ? m.start : 0, b = m ? Math.min(m.end, m.start + 6) : Math.min(src.durationSec, 4);
    commit({ ...edl, segments: edl.segments.map((x, k) => (k === i ? { ...x, clipId, in: r2(a), out: r2(Math.max(b, a + MIN_SEG)), note: "" } : x)) });
  };
  const setText = (i: number, patch: Partial<EdlText>) => { if (!edl) return; commit({ ...edl, text: edl.text.map((t, k) => (k === i ? { ...t, ...patch } : t)) }); };
  const removeText = (i: number) => { if (!edl) return; commit({ ...edl, text: edl.text.filter((_, k) => k !== i) }); };
  const addText = () => { if (!edl || !tl) return; const at = Math.min(Math.max(0, tl.durationSec - 4), Math.round(tl.durationSec / 2)); commit({ ...edl, text: [...edl.text, { id: `t${Date.now()}`, at, end: Math.min(tl.durationSec, at + 3), text: "New line", role: "mid" }] }); };
  const toggleCaptions = () => { if (!edl) return; commit({ ...edl, captions: edl.captions ? null : { source: "transcript" } }); };

  // At the playhead: which cut it is in, and where that is inside the clip.
  const at = () => {
    if (!tl) return null;
    const sec = (player.current?.getCurrentFrame() ?? 0) / OUTPUT.fps;
    const i = tl.segments.findIndex((x) => sec >= x.startSec && sec < x.startSec + x.durationFrames / OUTPUT.fps);
    const k = i < 0 ? tl.segments.length - 1 : i;
    const seg = tl.segments[k];
    return { sec, i: k, clipT: r2(seg.in + Math.max(0, sec - seg.startSec)) };
  };
  const [hereNote, setHereNote] = useState<string | null>(null);
  const startHere = () => { const p = at(); if (!edl || !p) return; const s = edl.segments[p.i]; if (s.out - p.clipT < MIN_SEG) return setHereNote(`Too close to the end of that cut; a cut needs ${MIN_SEG}s.`); setHereNote(null); commit({ ...edl, segments: edl.segments.map((x, k) => (k === p.i ? { ...x, in: p.clipT } : x)) }); };
  const endHere = () => { const p = at(); if (!edl || !p) return; const s = edl.segments[p.i]; if (p.clipT - s.in < MIN_SEG) return setHereNote(`Too close to the start of that cut; a cut needs ${MIN_SEG}s.`); setHereNote(null); commit({ ...edl, segments: edl.segments.map((x, k) => (k === p.i ? { ...x, out: p.clipT } : x)) }); };
  const splitHere = () => {
    const p = at(); if (!edl || !p) return; const s = edl.segments[p.i];
    if (p.clipT - s.in < MIN_SEG || s.out - p.clipT < MIN_SEG) return setHereNote(`Move the playhead at least ${MIN_SEG}s from either end of the cut to split it.`);
    setHereNote(null);
    const a = { ...s, out: p.clipT }, b = { ...s, id: `s${Date.now()}`, in: p.clipT, role: "body" as const };
    commit({ ...edl, segments: [...edl.segments.slice(0, p.i), a, b, ...edl.segments.slice(p.i + 1)] });
  };
  const lineHere = () => { const p = at(); if (!edl || !tl) return; const t0 = r2(Math.min(Math.max(0, (p?.sec ?? 0)), Math.max(0, tl.durationSec - 0.5))); commit({ ...edl, text: [...edl.text, { id: `t${Date.now()}`, at: t0, end: r2(Math.min(tl.durationSec, t0 + 3)), text: "New line", role: t0 < 1 ? "opening" : "mid" }] }); };

  // Reframe: a drag is one undo step (history pushed when it starts), applied live while it moves.
  const beginLive = () => { if (edl) { setPast((p) => [...p.slice(-49), edl]); setFuture([]); } };
  const setFrame = (i: number, patch: Partial<{ zoom: number; x: number; y: number }>) => {
    if (!edl) return;
    setEdl({ ...edl, segments: edl.segments.map((x, k) => (k === i ? { ...x, frame: { zoom: 1, x: 0.5, y: 0.5, ...x.frame, ...patch } } : x)) });
    setDirty(true);
  };
  const resetFrame = (i: number) => { if (!edl) return; commit({ ...edl, segments: edl.segments.map((x, k) => (k === i ? { ...x, frame: undefined } : x)) }); };
  const setAspect = (w: number, h: number) => { if (!edl || (edl.width === w && edl.height === h)) return; commit({ ...edl, width: w, height: h }); };

  // Style (Editor V2): discrete choices are one undo step each; the colour picker is live after one.
  const st: EdlStyle = edl?.style ?? DEFAULT_STYLE;
  const setStyle = (patch: Partial<EdlStyle>) => { if (edl) commit({ ...edl, style: { ...st, ...patch } }); };
  const setCaptionStyle = (patch: Partial<EdlStyle["captions"]>) => setStyle({ captions: { ...st.captions, ...patch } });
  const liveAccent = (accent: string) => { if (!edl) return; setEdl({ ...edl, style: { ...st, accent } }); setDirty(true); };
  const applyPreset = (p: { style: EdlStyle; width: number; height: number }, label: string) => { if (!edl) return; commit({ ...edl, style: p.style, width: p.width, height: p.height }); setStyleNote(`${label} applied.`); };
  const savePreset = async (body: Record<string, unknown>, ok: string) => {
    if (!edl) return;
    setStyleNote(null);
    const r = await fetch("/api/studio/style", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, style: st, width: edl.width, height: edl.height }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    if (!r?.ok) return setStyleNote(j?.error ?? "Couldn't save that. Try again.");
    setPresets(j as VideoPresets);
    setStyleNote(ok);
  };
  const setVolume = (i: number, v: number) => { if (!edl) return; setEdl({ ...edl, segments: edl.segments.map((x, k) => (k === i ? { ...x, volume: v } : x)) }); setDirty(true); };
  const toggleMute = (i: number) => { if (!edl) return; commit({ ...edl, segments: edl.segments.map((x, k) => (k === i ? { ...x, volume: (x.volume ?? 1) === 0 ? 1 : 0 } : x)) }); };

  const save = async () => {
    if (!edl || fixture) { setDirty(false); return; }
    setSaving(true); setSaveErr(null);
    const res = await fetch(`/api/studio/builds/${buildId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ edl }) });
    const j = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) { if (isPlanError(j)) setPlanError(j); else setSaveErr(j?.error ?? "Couldn't save."); return; }
    const b = j as StudioBuild;
    setData((d) => (d ? { ...d, build: b } : d)); setEdl(b.edl); setDirty(false);
  };

  const regenerate = async (directive: RegenerateDirective) => {
    if (!edl || fixture) return;
    setRegen(directive); setRegenErr(null);
    const res = await fetch(`/api/studio/builds/${buildId}/regenerate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ directive }) });
    const j = await res.json().catch(() => null);
    setRegen(null);
    if (!res.ok) { if (isPlanError(j)) setPlanError(j); else setRegenErr(j?.error ?? "Couldn't regenerate."); return; }
    const b = j as StudioBuild;
    setPast((p) => [...p.slice(-30), edl]); setFuture([]);
    setData((d) => (d ? { ...d, build: b } : d)); setEdl(b.edl); setDirty(false);
  };

  // ------------------------------------------------------------- export ----
  const exportVideo = async () => {
    if (!edl || !tl || !data) return;
    const ctrl = new AbortController(); abort.current = ctrl;
    setExp({ phase: "checking", progress: 0, message: null, postId: null });
    try {
      const { canRenderMediaOnWeb, renderMediaOnWeb } = await import("@remotion/web-renderer");
      const check = await canRenderMediaOnWeb({ width: edl.width, height: edl.height, container: "mp4" });
      if (!check.canRender) {
        const why = check.issues.filter((i) => i.severity === "error").map((i) => i.message).join(" ");
        setExp({ phase: "error", progress: 0, message: `This browser can't render video: ${why || "WebCodecs is unavailable."} Open SOCIA in Chrome or Edge on a computer to make the video; your edit is saved and opens there as it is.`, postId: null });
        return;
      }
      if (dirty && !fixture) await save();
      let path: string | null = null;
      if (!fixture) {
        const res = await fetch(`/api/studio/builds/${buildId}/export`, { method: "POST" });
        const j = await res.json().catch(() => null);
        if (!res.ok) { if (isPlanError(j)) setPlanError(j); setExp({ phase: "error", progress: 0, message: isPlanError(j) ? null : (j?.error ?? "Couldn't start the export."), postId: null }); return; }
        path = j.path as string;
      }
      setExp({ phase: "rendering", progress: 0, message: null, postId: null });
      const props = { edl, sources, captionsOn };
      const { getBlob } = await renderMediaOnWeb({
        composition: { id: "socia-clip-build", component: ClipComposition, durationInFrames: tl.durationFrames, fps: OUTPUT.fps, width: edl.width, height: edl.height, defaultProps: props, calculateMetadata: null },
        inputProps: props,
        container: "mp4",
        videoBitrate: quality,
        pageResponsiveness: "medium",
        signal: ctrl.signal,
        onProgress: ({ progress }) => setExp((e) => (e.phase === "rendering" ? { ...e, progress } : e)),
      });
      const blob = await getBlob();
      if (fixture || !path) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "socia-build.mp4"; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
        setExp({ phase: "done", progress: 1, message: `Rendered ${(blob.size / 1024 / 1024).toFixed(1)} MB (downloaded — fixture mode).`, postId: null });
        return;
      }
      setExp({ phase: "uploading", progress: 0, message: null, postId: null });
      try {
        await uploadMedia(supabase, "scheduled-media", path, new File([blob], "video.mp4", { type: "video/mp4" }), (sent, total) => setExp((e) => (e.phase === "uploading" ? { ...e, progress: total ? sent / total : 0 } : e)));
        setExp({ phase: "saving", progress: 1, message: null, postId: null });
        const d = await fetch(`/api/studio/builds/${buildId}/draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, durationSec: tl.durationSec, caption: edl.caption }) });
        const dj = await d.json().catch(() => null);
        if (!d.ok) throw new Error(dj?.error ?? "Couldn't save the draft.");
        setExp({ phase: "done", progress: 1, message: null, postId: dj.postId });
        setData((cur) => (cur ? { ...cur, build: { ...cur.build, renderPath: path, postId: dj.postId } } : cur));
      } catch (e) {
        // The render happened but nothing was saved: give the video build back.
        await fetch(`/api/studio/builds/${buildId}/export`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) }).catch(() => null);
        throw e;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") { setExp({ phase: "idle", progress: 0, message: null, postId: null }); return; }
      setExp({ phase: "error", progress: 0, message: (e as Error)?.message?.replace(/^Upload failed: /, "") ?? "Something went wrong.", postId: null });
    }
  };

  // -------------------------------------------------------------- render ----
  if (planError) return <div className="cbb"><button type="button" className="cb-back" onClick={onBack}><ChevronLeft size={14} /> Back to the guide</button><div className="ov-card st-error"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><PlanNotice error={planError} compact /></div></div></div>;
  if (loadErr) return <div className="cbb"><button type="button" className="cb-back" onClick={onBack}><ChevronLeft size={14} /> Back to the guide</button><div className="ov-card st-error"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><b>Couldn&apos;t open the video builder</b><p>{loadErr}</p></div></div></div>;
  if (!data || !edl || !tl) return <div className="cbb"><div className="ov-card st-progress"><ul><li className="on"><i />Loading the cut and your clips</li></ul></div></div>;

  const busy = Boolean(regen) || saving || (exp.phase !== "idle" && exp.phase !== "done" && exp.phase !== "error");
  const build = data.build;

  return (
    <div className="cbb">
      <div className="cbb-head">
        <button type="button" className="cb-back" onClick={onBack}><ChevronLeft size={14} /> {data.manual ? "Back to your clips" : "Back to the guide"}</button>
        <div className="cbb-head-actions">
          <button type="button" className="ov-btn ghost small" disabled={!past.length || busy} onClick={undo} title="Undo"><Undo2 size={13} /> Undo</button>
          <button type="button" className="ov-btn ghost small" disabled={!future.length || busy} onClick={redo} title="Redo"><Redo2 size={13} /> Redo</button>
          {data.canEdit && <button type="button" className="ov-btn ghost small" disabled={!dirty || busy} onClick={save}>{saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />} {dirty ? "Save changes" : "Saved"}</button>}
        </div>
      </div>
      {saveErr && <p className="cbb-err" role="alert"><AlertTriangle size={13} aria-hidden /> {saveErr}</p>}

      <div className="cbb-grid">
        <div className="cbb-player-col">
          <div className="ov-card cbb-player-card">
            <div className="cbb-player">
              <Player
                ref={player}
                component={ClipComposition}
                inputProps={{ edl, sources, captionsOn, finishOn: compare === "after" }}
                durationInFrames={tl.durationFrames}
                fps={OUTPUT.fps}
                compositionWidth={edl.width}
                compositionHeight={edl.height}
                controls
                acknowledgeRemotionLicense
                style={{ width: "100%", aspectRatio: `${edl.width} / ${edl.height}` }}
              />
            </div>
            <div className="cbb-player-meta">
              <b>{title}</b>
              <span>{tl.durationSec.toFixed(1)}s, {edl.segments.length} cut{edl.segments.length === 1 ? "" : "s"}, {edl.width}×{edl.height}</span>
              {edl.finish && (
                <div className="cal2-seg cbf-compare" role="radiogroup" aria-label="Compare corrections">
                  <button type="button" role="radio" aria-checked={compare === "before"} className={compare === "before" ? "on" : ""} onClick={() => setCompare("before")}>Before</button>
                  <button type="button" role="radio" aria-checked={compare === "after"} className={compare === "after" ? "on" : ""} onClick={() => setCompare("after")}>After</button>
                </div>
              )}
              {missing > 0 && <span className="cb-stale"><AlertTriangle size={12} /> {missing} cut{missing === 1 ? "" : "s"} point{missing === 1 ? "s" : ""} at footage that expired — replace or remove {missing === 1 ? "it" : "them"}.</span>}
            </div>
          </div>

          <div className="ov-card cbb-export">
            <h3><Clapperboard size={14} /> Make the video</h3>
            {exp.phase === "idle" || exp.phase === "error" ? (
              <>
                <p>Rendered on this computer at {edl.width}×{edl.height}, then saved as a <b>draft</b> in your Calendar. You schedule or publish it from Create Post.{data.manual ? " Nothing is counted against your plan." : ""} Works best in Chrome or Edge on a computer.</p>
                {exp.message && <p className="cbb-err"><AlertTriangle size={12} /> {exp.message}</p>}
                <label className="cbb-quality">Quality
                  <select value={quality} onChange={(e) => setQuality(e.target.value as "high" | "medium")} disabled={busy}>
                    <option value="high">High (larger file)</option>
                    <option value="medium">Standard (smaller, faster to upload)</option>
                  </select>
                </label>
                <button type="button" className="ov-btn primary" disabled={busy || missing > 0 || !data.canEdit} onClick={exportVideo}><Clapperboard size={14} /> {build.renderPath ? "Make it again" : "Make this video"}</button>
                {build.postId && <Link className="ov-btn ghost small" href={`/create?post=${build.postId}`}>Open the saved draft <ArrowRight size={12} /></Link>}
              </>
            ) : exp.phase === "done" ? (
              <>
                <p className="cbb-ok"><Check size={13} /> {exp.message ?? "Rendered and saved as a draft."}</p>
                {exp.postId && <Link className="ov-btn primary small" href={`/create?post=${exp.postId}`}>Review in Create Post <ArrowRight size={12} /></Link>}
                <button type="button" className="ov-btn ghost small" onClick={() => setExp({ phase: "idle", progress: 0, message: null, postId: null })}>Make another version</button>
              </>
            ) : (
              <>
                <ul className="st-progress">
                  <li className={exp.phase === "checking" ? "on" : "done"}><i />Checking this browser can render</li>
                  <li className={exp.phase === "rendering" ? "on" : exp.phase === "checking" ? "" : "done"}><i />Rendering {exp.phase === "rendering" ? `${Math.round(exp.progress * 100)}%` : ""}</li>
                  <li className={exp.phase === "uploading" ? "on" : exp.phase === "saving" ? "done" : ""}><i />Uploading {exp.phase === "uploading" ? `${Math.round(exp.progress * 100)}%` : ""}</li>
                  <li className={exp.phase === "saving" ? "on" : ""}><i />Saving the draft</li>
                </ul>
                <span className="cbb-bar"><i style={{ width: `${Math.round(exp.progress * 100)}%` }} /></span>
                <button type="button" className="ov-btn ghost small" onClick={() => abort.current?.abort()}>Cancel</button>
                <p className="ov-source">Keep this tab open while it renders.</p>
              </>
            )}
          </div>
        </div>

        <div className="cbb-panels">
          <div className="st-tabs cbb-tabs" role="tablist">
            <button type="button" role="tab" className={panel === "cut" ? "on" : ""} onClick={() => setPanel("cut")}>Cut</button>
            <button type="button" role="tab" className={panel === "frame" ? "on" : ""} onClick={() => setPanel("frame")}>Frame</button>
            <button type="button" role="tab" className={panel === "style" ? "on" : ""} onClick={() => setPanel("style")}>Style</button>
            <button type="button" role="tab" className={panel === "text" ? "on" : ""} onClick={() => setPanel("text")}>Text &amp; captions</button>
            <button type="button" role="tab" className={panel === "finish" ? "on" : ""} onClick={() => setPanel("finish")}>Look &amp; sound</button>
            <button type="button" role="tab" className={panel === "audio" ? "on" : ""} onClick={() => setPanel("audio")}>Music</button>
            {!data.manual && <button type="button" role="tab" className={panel === "regenerate" ? "on" : ""} onClick={() => setPanel("regenerate")}>Regenerate</button>}
          </div>

          {panel === "finish" && (
            <FinishPanel edl={edl} sources={sources} canEdit={data.canEdit} busy={busy} onCommit={(next) => { commit(next); setCompare("after"); }} />
          )}

          {panel === "audio" && (
            <div className="cbb-audio">
              <div className="ov-card cba-current">
                <b><Music size={14} /> Music line in this cut</b>
                <p>{edl.music ?? "No music recommendation in this cut."}</p>
                <small>SOCIA never adds a track to the file. Add music from Instagram&apos;s library when you post, or bake in a track you have the rights to.</small>
              </div>
              <AudioPanel canEdit={data.canEdit && !busy} current={edl.music} onUse={(line) => commit({ ...edl, music: line })} />
            </div>
          )}

          {panel === "cut" && (
            <div className="cbb-here" role="group" aria-label="At the playhead">
              <span>At the playhead:</span>
              <button type="button" className="ov-btn ghost small" disabled={!data.canEdit || busy} onClick={startHere}><SkipBack size={12} /> Start here</button>
              <button type="button" className="ov-btn ghost small" disabled={!data.canEdit || busy} onClick={endHere}><SkipForward size={12} /> End here</button>
              <button type="button" className="ov-btn ghost small" disabled={!data.canEdit || busy} onClick={splitHere}><Scissors size={12} /> Split here</button>
              {hereNote && <small className="cbb-err" role="status">{hereNote}</small>}
            </div>
          )}

          {panel === "style" && (
            <div className="cbb-frame cbb-style">
              <div className="ov-card">
                <b><Palette size={14} /> Text</b>
                <label className="cbb-field">Font
                  <select value={st.font} disabled={!data.canEdit || busy} onChange={(e) => setStyle({ font: e.target.value as EdlStyle["font"] })}>
                    {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </label>
                <label className="cbb-field">Brand colour
                  <input type="color" value={st.accent} disabled={!data.canEdit || busy} onPointerDown={beginLive} onFocus={beginLive} onChange={(e) => liveAccent(e.target.value)} />
                </label>
                <small>Used for the call to action, and for text boxes set to Brand colour.</small>
                <div className="cal2-seg" role="radiogroup" aria-label="Text background">
                  {([["dark", "Dark box"], ["light", "Light box"], ["accent", "Brand colour"], ["none", "No box"]] as const).map(([id, label]) => (
                    <button key={id} type="button" role="radio" aria-checked={st.textBox === id} className={st.textBox === id ? "on" : ""} disabled={!data.canEdit || busy} onClick={() => setStyle({ textBox: id })}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="ov-card">
                <b><Captions size={14} /> Captions</b>
                <div className="cal2-seg" role="radiogroup" aria-label="Caption position">
                  {([["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]] as const).map(([id, label]) => (
                    <button key={id} type="button" role="radio" aria-checked={st.captions.position === id} className={st.captions.position === id ? "on" : ""} disabled={!data.canEdit || busy} onClick={() => setCaptionStyle({ position: id })}>{label}</button>
                  ))}
                </div>
                <div className="cal2-seg" role="radiogroup" aria-label="Caption size">
                  {([["s", "Small"], ["m", "Medium"], ["l", "Large"]] as const).map(([id, label]) => (
                    <button key={id} type="button" role="radio" aria-checked={st.captions.size === id} className={st.captions.size === id ? "on" : ""} disabled={!data.canEdit || busy} onClick={() => setCaptionStyle({ size: id })}>{label}</button>
                  ))}
                </div>
                <label className="cbb-check"><input type="checkbox" checked={st.captions.box} disabled={!data.canEdit || busy} onChange={(e) => setCaptionStyle({ box: e.target.checked })} /> Box behind captions</label>
                <label className="cbb-check"><input type="checkbox" checked={st.captions.uppercase} disabled={!data.canEdit || busy} onChange={(e) => setCaptionStyle({ uppercase: e.target.checked })} /> Capital letters</label>
                {!edl.captions && <small>Captions are off for this video; turn them on in Text &amp; captions.</small>}
              </div>
              <div className="ov-card">
                <b>Brand style and templates</b>
                <small>A brand style is the starting look for every new edit; templates keep other looks to reuse. Both hold the size, font, colours and caption style.</small>
                <div className="st-row-actions">
                  {presets.brand && <button type="button" className="ov-btn ghost small" disabled={!data.canEdit || busy} onClick={() => applyPreset(presets.brand!, "Brand style")}>Use brand style</button>}
                  {data.canManageBrand && <button type="button" className="ov-btn ghost small" disabled={busy} onClick={() => void savePreset({ action: "brand" }, "Saved as the brand style: new edits start with it.")}>Save as brand style</button>}
                </div>
                {presets.templates.length > 0 && (
                  <ul className="cbb-templates">
                    {presets.templates.map((t) => (
                      <li key={t.id}>
                        <span>{t.name} <small>{t.width}×{t.height}</small></span>
                        <button type="button" className="ov-btn ghost small" disabled={!data.canEdit || busy} onClick={() => applyPreset(t, `"${t.name}"`)}>Apply</button>
                        <button type="button" className="cbb-icon danger" aria-label={`Delete template ${t.name}`} disabled={busy} onClick={() => void savePreset({ action: "delete_template", id: t.id }, "Template deleted.")}><Trash2 size={13} /></button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="cbb-tpl-new">
                  <input type="text" placeholder="Template name" value={tplName} maxLength={40} onChange={(e) => setTplName(e.target.value)} aria-label="Template name" />
                  <button type="button" className="ov-btn ghost small" disabled={busy || !tplName.trim()} onClick={() => { void savePreset({ action: "template", name: tplName }, `Saved "${tplName.trim()}".`); setTplName(""); }}>Save as template</button>
                </div>
                {styleNote && <small role="status">{styleNote}</small>}
              </div>
            </div>
          )}

          {panel === "frame" && (
            <div className="cbb-frame">
              <div className="ov-card">
                <b><Crop size={14} /> Size</b>
                <div className="cal2-seg cbb-aspects" role="radiogroup" aria-label="Aspect ratio">
                  {ASPECTS.map((a) => (
                    <button key={a.id} type="button" role="radio" aria-checked={edl.width === a.width && edl.height === a.height} className={edl.width === a.width && edl.height === a.height ? "on" : ""} disabled={!data.canEdit || busy} onClick={() => setAspect(a.width, a.height)}>{a.label}</button>
                  ))}
                </div>
                <small>Reels, TikTok and Shorts are vertical; 4:5 and square suit the feed; 16:9 suits YouTube.</small>
              </div>
              <ol className="cbb-frames">
                {edl.segments.map((s, i) => {
                  const src = sources[s.clipId];
                  const f = s.frame ?? { zoom: 1, x: 0.5, y: 0.5 };
                  return (
                    <li key={s.id} className="ov-card">
                      <div className="cbb-frame-head">
                        <b>{src ? clipLabel(src.position) : "Expired clip"} <small>{fmtClock(s.in)} to {fmtClock(s.out)}</small></b>
                        <button type="button" className="ov-btn ghost small" disabled={!data.canEdit || busy || !s.frame} onClick={() => resetFrame(i)}>Reset</button>
                      </div>
                      {!src?.width || !src?.height ? <small>This clip&apos;s size wasn&apos;t measured, so it stays centred.</small> : (
                        <>
                          <label className="cbb-range"><span>Zoom</span><input type="range" min={1} max={3} step={0.05} value={f.zoom} disabled={!data.canEdit || busy} onPointerDown={beginLive} onKeyDown={beginLive} onChange={(e) => setFrame(i, { zoom: Number(e.target.value) })} /><em>{f.zoom.toFixed(2)}×</em></label>
                          <label className="cbb-range"><span>Left to right</span><input type="range" min={0} max={1} step={0.01} value={f.x} disabled={!data.canEdit || busy} onPointerDown={beginLive} onKeyDown={beginLive} onChange={(e) => setFrame(i, { x: Number(e.target.value) })} /><em>{Math.round(f.x * 100)}%</em></label>
                          <label className="cbb-range"><span>Top to bottom</span><input type="range" min={0} max={1} step={0.01} value={f.y} disabled={!data.canEdit || busy} onPointerDown={beginLive} onKeyDown={beginLive} onChange={(e) => setFrame(i, { y: Number(e.target.value) })} /><em>{Math.round(f.y * 100)}%</em></label>
                        </>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {panel === "cut" && (
            <ol className="cbb-segs">
              {edl.segments.map((s, i) => {
                const src = sources[s.clipId];
                return (
                  <li key={s.id} className={`cbb-seg${src ? "" : " missing"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage URL */}
                    {src?.thumb ? <img src={src.thumb} alt="" /> : <span className="cb-clip-ph small" />}
                    <div className="cbb-seg-main">
                      <b>{src ? clipLabel(src.position) : "Expired clip"} <small>{s.role === "opener" ? "opener" : s.role === "ending" ? "ending" : `cut ${i + 1}`}</small></b>
                      <div className="cbb-trim">
                        <span className="cbb-trim-grp" title="Start inside the clip"><button type="button" aria-label="Start earlier" disabled={!data.canEdit || busy} onClick={() => trim(i, "in", -STEP)}><Minus size={11} /></button><em>{fmtClock(s.in)}</em><button type="button" aria-label="Start later" disabled={!data.canEdit || busy} onClick={() => trim(i, "in", STEP)}><Plus size={11} /></button></span>
                        <span className="cbb-trim-sep">→</span>
                        <span className="cbb-trim-grp" title="End inside the clip"><button type="button" aria-label="End earlier" disabled={!data.canEdit || busy} onClick={() => trim(i, "out", -STEP)}><Minus size={11} /></button><em>{fmtClock(s.out)}</em><button type="button" aria-label="End later" disabled={!data.canEdit || busy} onClick={() => trim(i, "out", STEP)}><Plus size={11} /></button></span>
                        <small>{(s.out - s.in).toFixed(1)}s</small>
                      </div>
                      <div className="cbb-vol">
                        <button type="button" className="cbb-icon" aria-label={(s.volume ?? 1) === 0 ? "Unmute this clip" : "Mute this clip"} disabled={!data.canEdit || busy} onClick={() => toggleMute(i)}>{(s.volume ?? 1) === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}</button>
                        <input type="range" min={0} max={2} step={0.05} value={s.volume ?? 1} aria-label="Clip volume" disabled={!data.canEdit || busy} onPointerDown={beginLive} onKeyDown={beginLive} onChange={(e) => setVolume(i, Number(e.target.value))} />
                        <em>{Math.round((s.volume ?? 1) * 100)}%</em>
                      </div>
                      {s.note && <small className="cbb-note">{s.note}</small>}
                    </div>
                    <div className="cbb-seg-actions">
                      <button type="button" aria-label="Move up" disabled={!data.canEdit || busy || i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
                      <button type="button" aria-label="Move down" disabled={!data.canEdit || busy || i === edl.segments.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
                      <label className="cbb-replace" title="Replace with another clip"><Replace size={13} /><select aria-label="Replace clip" disabled={!data.canEdit || busy} value="" onChange={(e) => { if (e.target.value) replace(i, e.target.value); }}><option value="">Replace…</option>{data.sources.filter((x) => x.clipId !== s.clipId).map((x) => <option key={x.clipId} value={x.clipId}>{clipLabel(x.position)} · {fmtClock(x.durationSec)}</option>)}</select></label>
                      <button type="button" aria-label="Remove cut" className="danger" disabled={!data.canEdit || busy || edl.segments.length <= 1} onClick={() => remove(i)}><Trash2 size={13} /></button>
                    </div>
                  </li>
                );
              })}
              <li className="cbb-hint"><Sparkles size={12} /> Cuts snap to pauses and word boundaries when you save. Levels are balanced from measured loudness{edl.audio.length ? ` (${edl.audio.map((a) => `${clipLabel(sources[a.clipId]?.position ?? 0)} ${a.gainDb > 0 ? "+" : ""}${a.gainDb} dB`).join(", ")})` : ""}.</li>
            </ol>
          )}

          {panel === "text" && (
            <div className="cbb-text">
              <div className="ov-card cbb-captions">
                <div>
                  <b><Captions size={14} /> Captions</b>
                  <small>{anySpeech ? "From the real transcript, word by word." : "No speech was detected in these clips, so there is nothing to caption."}</small>
                </div>
                <button type="button" className={`cbb-toggle${captionsOn ? " on" : ""}`} role="switch" aria-checked={captionsOn} disabled={!anySpeech || !data.canEdit || busy} onClick={toggleCaptions}><i /></button>
              </div>
              <ul className="cbb-lines">
                {edl.text.map((t, i) => (
                  <li key={t.id} className="ov-card">
                    <div className="cbb-line-head">
                      <select value={t.role} disabled={!data.canEdit || busy} onChange={(e) => setText(i, { role: e.target.value as EdlText["role"] })}><option value="opening">Opening line</option><option value="mid">Mid-point</option><option value="cta">Call to action</option></select>
                      <span className="cbb-trim"><span className="cbb-trim-grp"><button type="button" aria-label="Earlier" disabled={!data.canEdit || busy} onClick={() => setText(i, { at: r2(Math.max(0, t.at - STEP)), end: r2(Math.max(t.end - STEP, Math.max(0, t.at - STEP) + 0.5)) })}><Minus size={11} /></button><em>{fmtClock(t.at)}–{fmtClock(t.end)}</em><button type="button" aria-label="Later" disabled={!data.canEdit || busy} onClick={() => setText(i, { at: r2(Math.min(tl.durationSec - 0.5, t.at + STEP)), end: r2(Math.min(tl.durationSec, t.end + STEP)) })}><Plus size={11} /></button></span></span>
                      <button type="button" className="cbb-icon danger" aria-label="Remove line" disabled={!data.canEdit || busy} onClick={() => removeText(i)}><Trash2 size={13} /></button>
                    </div>
                    <textarea rows={2} value={t.text} disabled={!data.canEdit || busy} onChange={(e) => setText(i, { text: e.target.value.slice(0, 120) })} />
                  </li>
                ))}
              </ul>
              <div className="st-row-actions">
                <button type="button" className="ov-btn ghost small" disabled={!data.canEdit || busy || edl.text.length >= 4} onClick={addText}><Type size={12} /> Add a line</button>
                <button type="button" className="ov-btn ghost small" disabled={!data.canEdit || busy} onClick={lineHere}><Type size={12} /> Add a line at the playhead</button>
                {!data.manual && <button type="button" className="ov-btn ghost small" disabled={!data.canEdit || busy || Boolean(regen)} onClick={() => regenerate("different_hook")}>{regen === "different_hook" ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />} Different hook</button>}
              </div>
              <div className="ov-card cbb-caption-copy">
                <b>Caption for the post</b>
                <textarea rows={4} value={edl.caption} disabled={!data.canEdit || busy} onChange={(e) => commit({ ...edl, caption: e.target.value.slice(0, 2200) })} />
              </div>
            </div>
          )}

          {panel === "regenerate" && (
            <div className="cbb-regen">
              <p>A new first cut of the same post with one change. The current cut stays in Undo.</p>
              <ul>
                {REGENERATE_OPTIONS.map((o) => (
                  <li key={o.id}><button type="button" disabled={!data.canEdit || busy} onClick={() => regenerate(o.id)}>{regen === o.id ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}<span><b>{o.label}</b><small>{o.hint}</small></span></button></li>
                ))}
              </ul>
              {regenErr && <p className="cbb-err"><AlertTriangle size={12} /> {regenErr}</p>}
              <p className="ov-source">{MAX_REGENERATIONS - build.regenerations} of {MAX_REGENERATIONS} regenerations left for this post. Each one is written from the clips&apos; real moments and transcript, then checked the same way as the first.</p>
            </div>
          )}
        </div>
      </div>
      {tracks && (
        <div className="ov-card cbb-tl-card">
          <Timeline
            tracks={tracks}
            fps={OUTPUT.fps}
            player={player}
            canEdit={data.canEdit && !busy}
            onTextStart={beginLive}
            onTextLive={(i, at, end) => { setEdl((cur) => (cur ? { ...cur, text: cur.text.map((t, k) => (k === i ? { ...t, at, end } : t)) } : cur)); setDirty(true); }}
          />
        </div>
      )}
    </div>
  );
}
