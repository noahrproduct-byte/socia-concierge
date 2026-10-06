"use client";

// Make This Video (Growth/Pro). SOCIA's first cut of a post, previewed by
// Remotion from the same EDL the edit guide describes, with the few controls
// the brief asked for: reorder, trim, replace, delete, edit text, captions
// on/off, undo/redo, regenerate with a directive. The video is rendered HERE
// in the browser (WebCodecs) and saved as a DRAFT post — nothing is scheduled
// or published without the person doing it in Create Post.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Player } from "@remotion/player";
import { ChevronLeft, Undo2, Redo2, Save, ArrowUp, ArrowDown, Trash2, Plus, Minus, Replace, Captions, Sparkles, Loader2, AlertTriangle, Clapperboard, ArrowRight, Check, Type, Music } from "lucide-react";
import PlanNotice from "../PlanNotice";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { ClipComposition } from "./remotion/ClipComposition";
import AudioPanel from "./AudioPanel";
import { timeline, secToFrames } from "@/lib/studioClips/timeline";
import { clipLabel, fmtClock, OUTPUT, REGENERATE_OPTIONS, MAX_REGENERATIONS, type BuildPlayerData, type BuildSource, type Edl, type EdlText, type RegenerateDirective, type StudioBuild } from "@/lib/studioClips/types";

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
  const [panel, setPanel] = useState<"cut" | "text" | "audio" | "regenerate">("cut");
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

  const sources = useMemo(() => Object.fromEntries((data?.sources ?? []).map((s) => [s.clipId, s])) as Record<string, BuildSource>, [data]);
  const tl = useMemo(() => (edl ? timeline(edl) : null), [edl]);
  const anySpeech = useMemo(() => (edl ? edl.segments.some((s) => sources[s.clipId]?.words?.length) : false), [edl, sources]);
  const captionsOn = Boolean(edl?.captions);
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
      const check = await canRenderMediaOnWeb({ width: OUTPUT.width, height: OUTPUT.height, container: "mp4" });
      if (!check.canRender) {
        const why = check.issues.filter((i) => i.severity === "error").map((i) => i.message).join(" ");
        setExp({ phase: "error", progress: 0, message: `This browser can't render video: ${why || "WebCodecs is unavailable."} Open SOCIA in Chrome, Edge or Firefox on a computer to make the video; the edit guide works everywhere.`, postId: null });
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
        composition: { id: "socia-clip-build", component: ClipComposition, durationInFrames: tl.durationFrames, fps: OUTPUT.fps, width: OUTPUT.width, height: OUTPUT.height, defaultProps: props, calculateMetadata: null },
        inputProps: props,
        container: "mp4",
        videoBitrate: "high",
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
        await fetch(`/api/studio/builds/${buildId}/export`, { method: "DELETE" }).catch(() => null);
        throw e;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") { setExp({ phase: "idle", progress: 0, message: null, postId: null }); return; }
      setExp({ phase: "error", progress: 0, message: (e as Error)?.message?.replace(/^Upload failed: /, "") ?? "Something went wrong.", postId: null });
    }
  };

  // -------------------------------------------------------------- render ----
  if (planError) return <div className="cbb"><button type="button" className="cb-back" onClick={onBack}><ChevronLeft size={14} /> Back to the guide</button><div className="ov-card st-error"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><PlanNotice error={planError} compact /></div></div></div>;
  if (loadErr) return <div className="cbb"><button type="button" className="cb-back" onClick={onBack}><ChevronLeft size={14} /> Back to the guide</button><div className="ov-card st-error"><span className="st-error-ico"><AlertTriangle size={16} /></span><div><b>Couldn't open the video builder</b><p>{loadErr}</p></div></div></div>;
  if (!data || !edl || !tl) return <div className="cbb"><div className="ov-card st-progress"><ul><li className="on"><i />Loading the cut and your clips</li></ul></div></div>;

  const busy = Boolean(regen) || saving || (exp.phase !== "idle" && exp.phase !== "done" && exp.phase !== "error");
  const build = data.build;

  return (
    <div className="cbb">
      <div className="cbb-head">
        <button type="button" className="cb-back" onClick={onBack}><ChevronLeft size={14} /> Back to the guide</button>
        <div className="cbb-head-actions">
          <button type="button" className="ov-btn ghost small" disabled={!past.length || busy} onClick={undo} title="Undo"><Undo2 size={13} /> Undo</button>
          <button type="button" className="ov-btn ghost small" disabled={!future.length || busy} onClick={redo} title="Redo"><Redo2 size={13} /> Redo</button>
          {data.canEdit && <button type="button" className="ov-btn ghost small" disabled={!dirty || busy} onClick={save}>{saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />} {dirty ? "Save changes" : "Saved"}</button>}
        </div>
      </div>

      <div className="cbb-grid">
        <div className="cbb-player-col">
          <div className="ov-card cbb-player-card">
            <div className="cbb-player">
              <Player
                component={ClipComposition}
                inputProps={{ edl, sources, captionsOn }}
                durationInFrames={tl.durationFrames}
                fps={OUTPUT.fps}
                compositionWidth={OUTPUT.width}
                compositionHeight={OUTPUT.height}
                controls
                acknowledgeRemotionLicense
                style={{ width: "100%", aspectRatio: "9 / 16" }}
              />
            </div>
            <div className="cbb-player-meta">
              <b>{title}</b>
              <span>{tl.durationSec.toFixed(1)}s · {edl.segments.length} cut{edl.segments.length === 1 ? "" : "s"} · {OUTPUT.width}×{OUTPUT.height}</span>
              {missing > 0 && <span className="cb-stale"><AlertTriangle size={12} /> {missing} cut{missing === 1 ? "" : "s"} point{missing === 1 ? "s" : ""} at footage that expired — replace or remove {missing === 1 ? "it" : "them"}.</span>}
            </div>
          </div>

          <div className="ov-card cbb-export">
            <h3><Clapperboard size={14} /> Make the video</h3>
            {exp.phase === "idle" || exp.phase === "error" ? (
              <>
                <p>Rendered on this computer at {OUTPUT.width}×{OUTPUT.height}, then saved as a <b>draft</b> in your Calendar. You schedule or publish it from Create Post.</p>
                {exp.message && <p className="cbb-err"><AlertTriangle size={12} /> {exp.message}</p>}
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
            <button type="button" role="tab" className={panel === "text" ? "on" : ""} onClick={() => setPanel("text")}>Text &amp; captions</button>
            <button type="button" role="tab" className={panel === "audio" ? "on" : ""} onClick={() => setPanel("audio")}>Audio</button>
            <button type="button" role="tab" className={panel === "regenerate" ? "on" : ""} onClick={() => setPanel("regenerate")}>Regenerate</button>
          </div>

          {panel === "audio" && (
            <div className="cbb-audio">
              <div className="ov-card cba-current">
                <b><Music size={14} /> Music line in this cut</b>
                <p>{edl.music ?? "No music recommendation in this cut."}</p>
                <small>SOCIA never adds a track to the file. Add music from Instagram's library when you post, or bake in a track you have the rights to.</small>
              </div>
              <AudioPanel canEdit={data.canEdit && !busy} current={edl.music} onUse={(line) => commit({ ...edl, music: line })} />
            </div>
          )}

          {panel === "cut" && (
            <ol className="cbb-segs">
              {edl.segments.map((s, i) => {
                const src = sources[s.clipId];
                return (
                  <li key={s.id} className={`cbb-seg${src ? "" : " missing"}`}>
                    {src?.thumb ? <img src={src.thumb} alt="" /> : <span className="cb-clip-ph small" />}
                    <div className="cbb-seg-main">
                      <b>{src ? clipLabel(src.position) : "Expired clip"} <small>{s.role === "opener" ? "opener" : s.role === "ending" ? "ending" : `cut ${i + 1}`}</small></b>
                      <div className="cbb-trim">
                        <span className="cbb-trim-grp" title="Start inside the clip"><button type="button" aria-label="Start earlier" disabled={!data.canEdit || busy} onClick={() => trim(i, "in", -STEP)}><Minus size={11} /></button><em>{fmtClock(s.in)}</em><button type="button" aria-label="Start later" disabled={!data.canEdit || busy} onClick={() => trim(i, "in", STEP)}><Plus size={11} /></button></span>
                        <span className="cbb-trim-sep">→</span>
                        <span className="cbb-trim-grp" title="End inside the clip"><button type="button" aria-label="End earlier" disabled={!data.canEdit || busy} onClick={() => trim(i, "out", -STEP)}><Minus size={11} /></button><em>{fmtClock(s.out)}</em><button type="button" aria-label="End later" disabled={!data.canEdit || busy} onClick={() => trim(i, "out", STEP)}><Plus size={11} /></button></span>
                        <small>{(s.out - s.in).toFixed(1)}s</small>
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
                <button type="button" className="ov-btn ghost small" disabled={!data.canEdit || busy || Boolean(regen)} onClick={() => regenerate("different_hook")}>{regen === "different_hook" ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />} Different hook</button>
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
              <p className="ov-source">{MAX_REGENERATIONS - build.regenerations} of {MAX_REGENERATIONS} regenerations left for this post. Each one is written from the clips' real moments and transcript, then checked the same way as the first.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
