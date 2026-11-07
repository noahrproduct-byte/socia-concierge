"use client";

// One moment SOCIA picked from a long video, before it is a file: watch the
// moment, drag the 9:16 frame over the speaker, then make the clip in this
// browser (./renderClip.ts) and save it. The frame's position is the same
// `x` the renderer crops with (lib/studioClips/timeline.ts videoBox), so what
// is inside the frame is what the clip shows.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Loader2, Pause, Play, Scissors } from "lucide-react";
import type { ClipRender } from "@/lib/clipper/server";
import { renderBlocker } from "@/components/studio/renderBuild";
import { api, errorText, uploadToSigned } from "./shared";
import { renderClip } from "./renderClip";
import { sourceSize, takeSlot, type SourceSize } from "./sourceMedia";

const OUT_RATIO = 9 / 16;

export default function ClipRenderCard({ id, title, sub, why, render, headline, canMutate, onRendered, onCancel, autoStart = false, onSettled }: {
  id: string; title: string; sub: string; why: string | null; render: ClipRender; headline: boolean; canMutate: boolean;
  onRendered: () => void; onCancel?: () => void;
  /** Its turn in "Make all": starts as soon as the video has loaded. */
  autoStart?: boolean;
  /** Finished, made or not, so the next clip in "Make all" can start. */
  onSettled?: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startCrop: number } | null>(null);
  const [size, setSize] = useState<SourceSize | null>(null);
  const [sizeFailed, setSizeFailed] = useState(false);
  // The picture for this moment loads when the card is on screen and it's this card's turn (./sourceMedia.ts).
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const releasePreview = useRef<() => void>(() => {});
  const [cropX, setCropX] = useState(render.cropX);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // How much of the source's width the vertical frame covers (1 = the source is already vertical or narrower).
  const share = size ? Math.min(1, (size.height * OUT_RATIO) / size.width) : null;
  const movable = share != null && share < 0.999;

  useEffect(() => {
    let live = true;
    void sourceSize(render.sourceUrl).then((s) => { if (!live) return; if (s) setSize(s); else setSizeFailed(true); });
    return () => { live = false; };
  }, [render.sourceUrl]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const line = new AbortController();
    const src = `${render.sourceUrl}#t=${render.startMs / 1000}`;
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      seen.disconnect();
      void takeSlot(line.signal).then((release) => { releasePreview.current = release; setPreviewSrc(src); }).catch(() => {});
    }, { rootMargin: "200px" });
    seen.observe(el);
    return () => { seen.disconnect(); line.abort(); releasePreview.current(); };
  }, [render.sourceUrl, render.startMs]);

  // Its turn in "Make all". The ref keeps one start per turn, however often this re-renders.
  const started = useRef(false);
  const makeRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!autoStart || !size || started.current) return;
    started.current = true;
    void makeRef.current();
  }, [autoStart, size]);

  // Leaving the page stops a render in this browser.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const stop = () => { if (v.currentTime >= render.endMs / 1000) { v.pause(); v.currentTime = render.startMs / 1000; } };
    v.addEventListener("timeupdate", stop);
    return () => v.removeEventListener("timeupdate", stop);
  }, [render.startMs, render.endMs]);

  function toggle() {
    const v = video.current;
    if (!v) return;
    // Pressing play doesn't wait in line.
    if (!previewSrc) setPreviewSrc(`${render.sourceUrl}#t=${render.startMs / 1000}`);
    if (v.paused) {
      if (v.currentTime < render.startMs / 1000 || v.currentTime >= render.endMs / 1000) v.currentTime = render.startMs / 1000;
      void v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else { v.pause(); setPlaying(false); }
  }

  function onDown(e: PointerEvent<HTMLDivElement>) {
    if (!movable || busy) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { startX: e.clientX, startCrop: cropX };
  }
  function onMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const w = box.current?.clientWidth;
    if (!d || !w || share == null) return;
    const free = w * (1 - share);
    setCropX(Math.min(1, Math.max(0, d.startCrop + (e.clientX - d.startX) / free)));
  }
  const onUp = () => { drag.current = null; };
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!movable) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); setCropX((x) => Math.max(0, x - 0.05)); }
    if (e.key === "ArrowRight") { e.preventDefault(); setCropX((x) => Math.min(1, x + 0.05)); }
  }

  async function make() {
    setErr(null);
    try {
      const blocked = await renderBlocker(1080, 1920);
      if (blocked) throw new Error(blocked);
      setBusy("Making the clip"); setProgress(0);
      const { blob } = await renderClip({ ...render, cropX }, {
        title, headline, size: { width: size?.width ?? null, height: size?.height ?? null }, sourceSec: size?.duration ?? render.endMs / 1000,
        onProgress: (f) => setProgress(f),
      });
      setBusy("Saving"); setProgress(null);
      const up = await api<{ path: string; signedUrl: string }>(`/api/clipper/clips/${id}`, { method: "POST" });
      await uploadToSigned(up.signedUrl, new File([blob], "clip.mp4", { type: "video/mp4" }), (p) => setProgress(p));
      await api(`/api/clipper/clips/${id}`, { method: "PATCH", body: JSON.stringify({ path: up.path, cropX }) });
      onRendered();
    } catch (e) {
      setErr(errorText(e));
    } finally { setBusy(null); setProgress(null); started.current = false; onSettled?.(); }
  }
  makeRef.current = make;

  const left = share != null ? cropX * (1 - share) * 100 : 0;
  return (
    <article className="ai-card ai-cropcard">
      <div className="ai-crop" ref={box} style={size ? { aspectRatio: `${size.width} / ${size.height}` } : undefined} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <video ref={video} src={previewSrc ?? undefined} playsInline preload="metadata"
          onLoadedData={() => { setPreviewReady(true); releasePreview.current(); }} onError={() => releasePreview.current()}
          onPause={() => setPlaying(false)} />
        {!previewReady && <span className="ai-crop-wait">Loading the picture</span>}
        {share != null && (
          <div className={`ai-crop-win${movable ? " is-movable" : ""}`} style={{ left: `${left}%`, width: `${share * 100}%` }}
            role="slider" tabIndex={movable ? 0 : -1} aria-label="Where the vertical frame sits" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(cropX * 100)}
            aria-disabled={!movable || undefined} onKeyDown={onKey} />
        )}
        <button type="button" className="ai-crop-play" onClick={toggle} onPointerDown={(e) => e.stopPropagation()} aria-label={playing ? "Pause" : "Play this moment"}>
          {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
        </button>
      </div>
      <div className="ai-card-body">
        <b>{title}</b>
        <small>{sub}</small>
        {sizeFailed && <p className="ai-err" role="alert">SOCIA couldn&apos;t read this video. Reload the page to try again.</p>}
        {movable ? <small>Drag the frame, or use the arrow keys, so the speaker is inside it.</small> : size && <small>This video is already vertical, so the whole frame is used.</small>}
        {why && <details className="ai-why"><summary>Why this moment</summary><p>{why}</p></details>}
        {progress != null && <progress className="ai-progress" value={progress} max={1} />}
        {err && <p className="ai-err" role="alert">{err}</p>}
        <div className="ai-actions">
          {canMutate && (
            <button type="button" className="ai-act is-primary" onClick={make} disabled={Boolean(busy) || !size} aria-busy={Boolean(busy) || undefined}>
              {busy ? <><Loader2 size={14} className="spin" aria-hidden /> {busy}</> : <><Scissors size={14} aria-hidden /> Make this clip</>}
            </button>
          )}
          {onCancel && !busy && <button type="button" className="ai-act is-quiet" onClick={onCancel}>Keep the current clip</button>}
          {!canMutate && <small>Only the brand&apos;s owner or an admin can make clips.</small>}
        </div>
      </div>
    </article>
  );
}
