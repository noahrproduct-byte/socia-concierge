"use client";

// A ranking SOCIA put together from a long video, before it is a file: the
// countdown it chose, then one press to choose the shots for each moment, join
// them in this browser (./renderClip.ts) and save the clip.
import { useEffect, useRef, useState } from "react";
import { Loader2, Scissors } from "lucide-react";
import type { ClipRender } from "@/lib/clipper/server";
import type { Ranking } from "@/lib/clipper/ranking";
import type { CropKey } from "@/lib/clipper/reframe";
import { renderBlocker } from "@/components/studio/renderBuild";
import { api, errorText, uploadToSigned } from "./shared";
import { renderClip } from "./renderClip";
import { findShots } from "./findShots";
import { sourceFrame, sourceSize, type SourceSize } from "./sourceMedia";

const CENTRED = 0.5;
const secs = (ms: number) => `${Math.round(ms / 1000)} s`;

export default function RankingRenderCard({ id, ranking, sub, why, render, canMutate, onRendered, autoStart = false, onSettled }: {
  id: string; ranking: Ranking; sub: string; why: string | null; render: ClipRender; canMutate: boolean;
  onRendered: () => void; autoStart?: boolean; onSettled?: () => void;
}) {
  const [size, setSize] = useState<SourceSize | null>(null);
  const [sizeFailed, setSizeFailed] = useState(false);
  const [still, setStill] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const best = ranking.items[ranking.items.length - 1];

  useEffect(() => {
    let live = true;
    void sourceSize(render.sourceUrl).then((s) => { if (!live) return; if (s) setSize(s); else setSizeFailed(true); });
    void sourceFrame(render.sourceUrl, best.startMs / 1000).then((f) => { if (live && f) setStill(f); });
    return () => { live = false; };
  }, [render.sourceUrl, best.startMs]);

  // Leaving the page stops a render in this browser.
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  // Its turn in "Make all". The ref keeps one start per turn, however often this re-renders.
  const started = useRef(false);
  const makeRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!autoStart || !size || started.current) return;
    started.current = true;
    void makeRef.current();
  }, [autoStart, size]);

  async function make() {
    if (!size) return;
    setErr(null);
    try {
      const blocked = await renderBlocker(1080, 1920);
      if (blocked) throw new Error(blocked);
      const paths: (CropKey[] | null)[] = [];
      if ((size.height * 9) / 16 < size.width) {
        for (let i = 0; i < ranking.items.length; i++) {
          setBusy(`Choosing the shots, ${i + 1} of ${ranking.items.length}`);
          paths.push(await findShots(id, render.sourceUrl, size, ranking.items[i].startMs, ranking.items[i].endMs, i));
        }
      }
      setBusy("Making the clip"); setProgress(0);
      const { blob } = await renderClip({ ...render, cropX: CENTRED, cropPath: null }, {
        title: ranking.title, headline: false, paths, size: { width: size.width, height: size.height }, sourceSec: size.duration,
        onProgress: (f) => setProgress(f),
      });
      setBusy("Saving"); setProgress(null);
      const up = await api<{ path: string; signedUrl: string }>(`/api/clipper/clips/${id}`, { method: "POST" });
      await uploadToSigned(up.signedUrl, new File([blob], "clip.mp4", { type: "video/mp4" }), (p) => setProgress(p));
      await api(`/api/clipper/clips/${id}`, { method: "PATCH", body: JSON.stringify({ path: up.path, cropX: CENTRED, cropPath: null }) });
      onRendered();
    } catch (e) {
      setErr(errorText(e));
    } finally { setBusy(null); setProgress(null); started.current = false; onSettled?.(); }
  }
  makeRef.current = make;

  const rows = [...ranking.items].sort((a, b) => a.rank - b.rank);
  return (
    <article className="ai-card ai-cropcard">
      <div className="ai-crop" style={size ? { aspectRatio: `${size.width} / ${size.height}` } : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a still made in this browser; next/image cannot optimise it */}
        {still ? <img className="ai-crop-still" src={still} alt="" draggable={false} /> : <span className="ai-crop-wait">Loading the picture</span>}
      </div>
      <div className="ai-card-body">
        <b>{ranking.title}</b>
        <small>{sub}</small>
        <ol className="ai-ranking">
          {rows.map((r) => <li key={r.rank}><span>{r.label}</span> <small>{secs(r.endMs - r.startMs)}</small></li>)}
        </ol>
        <small>It plays from {rows.length} to 1, with the title and the list on screen.</small>
        {sizeFailed && <p className="ai-err" role="alert">SOCIA couldn&apos;t read this video. Reload the page to try again.</p>}
        {why && <details className="ai-why"><summary>Why this order</summary><p>{why}</p></details>}
        {progress != null && <progress className="ai-progress" value={progress} max={1} />}
        {err && <p className="ai-err" role="alert">{err}</p>}
        <div className="ai-actions">
          {canMutate ? (
            <button type="button" className="ai-act is-primary" onClick={make} disabled={Boolean(busy) || !size} aria-busy={Boolean(busy) || undefined}>
              {busy ? <><Loader2 size={14} className="spin" aria-hidden /> {busy}</> : <><Scissors size={14} aria-hidden /> Make this clip</>}
            </button>
          ) : <small>Only the brand&apos;s owner or an admin can make clips.</small>}
        </div>
      </div>
    </article>
  );
}
