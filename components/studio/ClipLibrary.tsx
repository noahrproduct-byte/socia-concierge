"use client";

// Your clips: every clip uploaded to Content Studio, kept until you delete
// it. Post one again on its own (it opens in the editor), or pick several and
// make a new video from them in Build (they're copied into a new project, with
// what SOCIA already understood about each).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileVideo, Layers, Loader2, Send } from "lucide-react";
import PlanNotice from "../PlanNotice";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import { fmtClock } from "@/lib/studioClips/types";
import { fileLabel } from "@/lib/publishing/postLabel";
import type { LibraryClip } from "@/lib/studioClips/library";

export default function ClipLibrary({ onOpenCut, allowPost = true, onUse, useLabel = "Make a new video" }: {
  /** a clip opened as its own post: the cut to edit and schedule */
  onOpenCut?: (buildId: string, title: string) => void;
  allowPost?: boolean;
  /** Video editor: the picked clips go into the video being made here (instead of a new Build project) */
  onUse?: (clipIds: string[]) => Promise<string | null>;
  useLabel?: string;
}) {
  const router = useRouter();
  const [clips, setClips] = useState<LibraryClip[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<PlanError | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/studio/library").then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setClips((j?.clips as LibraryClip[] | undefined) ?? []); }).catch(() => { if (alive) setClips([]); });
    return () => { alive = false; };
  }, []);

  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const postOne = async (c: LibraryClip) => {
    setBusy(c.id); setError(null); setPlanError(null);
    const res = await fetch(`/api/studio/projects/${c.projectId}/clip-build`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clipId: c.id }) }).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    setBusy(null);
    if (!res?.ok || !j?.id) { if (isPlanError(j)) setPlanError(j); else setError(j?.error ?? "Couldn't open that clip."); return; }
    onOpenCut?.(j.id as string, fileLabel(c.name) ?? c.name);
  };

  const newVideo = async () => {
    setBusy("new"); setError(null); setPlanError(null);
    if (onUse) {
      const err = await onUse(Array.from(picked));
      setBusy(null);
      if (err) setError(err); else setPicked(new Set());
      return;
    }
    const res = await fetch("/api/studio/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fromClips: Array.from(picked) }) }).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    if (!res?.ok || !j?.id) { setBusy(null); if (isPlanError(j)) setPlanError(j); else setError(j?.error ?? "Couldn't start a new video."); return; }
    if (!j.added) { setBusy(null); setError((j.skipped as string[] | undefined)?.join(" ") || "None of those clips could be added."); return; }
    router.push(`/studio?mode=clips&project=${encodeURIComponent(j.id)}`);
  };

  return (
    <div className="ov-card cb-projects cb-lib">
      <div className="ov-card-head"><h2><FileVideo size={15} /> Your clips</h2></div>
      {clips == null ? (
        <p className="ov-source"><Loader2 size={12} className="spin" /> Loading your clips</p>
      ) : !clips.length ? (
        <p className="ov-source">Every clip you upload to Content Studio stays here until you delete it, ready to post again or use in a new video.</p>
      ) : (
        <>
          <p className="ov-source">Kept until you delete them. Post one again on its own, or pick a few and make a new video from them.</p>
          <ul className="cb-grid">
            {clips.map((c) => (
              <li key={c.id} className={`cb-clip${picked.has(c.id) ? " on" : ""}`}>
                <label className="cb-clip-thumb cb-lib-pick">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.thumb ? <img src={c.thumb} alt="" /> : <span className="cb-clip-ph"><FileVideo size={18} /></span>}
                  {c.durationSec != null && <small className="cb-clip-dur">{fmtClock(c.durationSec)}</small>}
                  <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Use ${c.name} in a new video`} />
                </label>
                <div className="cb-clip-meta">
                  <b title={c.name}>{fileLabel(c.name) ?? c.name}</b>
                  <small>{c.projectTitle ? `${c.projectTitle} · ` : ""}{new Date(c.addedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small>
                  {allowPost && onOpenCut && (
                    <button type="button" className="ov-btn ghost small cb-lib-post" disabled={busy != null} onClick={() => void postOne(c)}>
                      {busy === c.id ? <Loader2 size={12} className="spin" /> : <Send size={12} />} Post it again
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="cb-lib-bar">
            <span>{picked.size ? `${picked.size} clip${picked.size === 1 ? "" : "s"} picked` : onUse ? "Pick clips to use in this video" : "Pick clips to make a new video"}</span>
            <button type="button" className="ov-btn primary small" disabled={!picked.size || busy != null} onClick={() => void newVideo()}>
              {busy === "new" ? <Loader2 size={12} className="spin" /> : <Layers size={12} />} {useLabel}
            </button>
          </div>
        </>
      )}
      {planError && <PlanNotice error={planError} compact />}
      {error && <p className="cbb-err" role="alert"><AlertTriangle size={12} /> {error}</p>}
    </div>
  );
}
