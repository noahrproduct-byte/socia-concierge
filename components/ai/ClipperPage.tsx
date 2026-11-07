"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Scissors } from "lucide-react";
import { CLIP_LANGUAGES, CLIP_LENGTHS, DEFAULT_CLIPPER_OPTIONS, MAX_CLIPS, type ClipLength, type ClipperOptions } from "@/lib/clipper/provider";
import { clipCredits } from "@/lib/credits/config";
import { api, errorText, isCreditsShort, usePolling, uploadToSigned, videoMinutes, CreditsLine, StatusChip, MediaCard } from "./shared";
import type { ClipRender } from "@/lib/clipper/server";
import ClipRenderCard from "./ClipRenderCard";
import { ConfirmDialog } from "@/components/system";

type Job = { id: string; status: "queued" | "processing" | "done" | "failed" | "cancelled"; source_kind: string; source_url: string; source_minutes: number; credits_reserved: number; credits_charged: number | null; error: string | null; created_at: string; options: ClipperOptions; stage?: string | null; provider?: string };
type Clip = { id: string; title: string | null; score: number | null; score_reason: string | null; duration_ms: number | null; caption: string | null; hashtags: string[]; playUrl: string | null; downloadUrl: string | null; transcript: string | null; render?: ClipRender | null };
type Source = "youtube" | "upload" | "url";

/** SOCIA's own clipper says which step a job is on (lib/clipper/server.ts); others just work. */
const stageLabel = (stage: string | null | undefined): string | undefined =>
  stage === "transcribing" ? "Transcribing" : stage ? "Picking the moments" : undefined;

const fmtDur = (ms: number | null) => (ms == null ? "" : `${Math.round(ms / 1000)} s`);
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * sociaReady: SOCIA's own clipper takes uploads (transcribed, picked, made in
 * this browser). vizardReady: YouTube and direct links go to Vizard when its
 * key is set; otherwise only uploads are offered.
 */
/** One button for all the moments not made yet; they are made one at a time, in this browser. */
function MakeAll({ clips, canMutate, queue, queueSize, onStart }: { clips: Clip[]; canMutate: boolean; queue: string[]; queueSize: number; onStart: (ids: string[]) => void }) {
  const waiting = clips.filter((c) => c.render && !c.playUrl).map((c) => c.id);
  if (!canMutate) return null;
  if (queue.length) return <p className="ai-note" role="status"><Loader2 size={14} className="spin" aria-hidden /> Making clip {queueSize - queue.length + 1} of {queueSize}. Keep this page open until they finish.</p>;
  if (waiting.length < 2) return null;
  return <div className="ai-makeall"><button type="button" className="btn-primary" onClick={() => onStart(waiting)}>Make all {waiting.length} clips</button><small>Each clip is made in this browser, so keep the page open.</small></div>;
}

export default function ClipperPage({ initialBalance, canMutate, sociaReady, vizardReady }: { initialBalance: number | null; canMutate: boolean; sociaReady: boolean; vizardReady: boolean }) {
  const [balance, setBalance] = useState<number | null>(initialBalance);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clipsByJob, setClipsByJob] = useState<Record<string, Clip[]>>({});
  const [open, setOpen] = useState<string | null>(null);
  // A made clip whose crop is being changed.
  const [recrop, setRecrop] = useState<string | null>(null);
  // Clips waiting to be made one after another by "Make all"; the first is in progress.
  const [queue, setQueue] = useState<string[]>([]);
  const [queueSize, setQueueSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // The job waiting for "Remove job" in the dialog; a failed delete keeps it open and says why.
  const [removing, setRemoving] = useState<Job | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeErr, setRemoveErr] = useState<string | null>(null);
  // The same for stopping a job that is still running.
  const [cancelling, setCancelling] = useState<Job | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  // The measured price, waiting for a second press (not an error).
  const [priceNote, setPriceNote] = useState<string | null>(null);

  const sources: Source[] = [...(sociaReady || !vizardReady ? (["upload"] as Source[]) : []), ...(vizardReady ? (["youtube", "upload", "url"] as Source[]).filter((x) => !(sociaReady && x === "upload")) : [])];
  const [source, setSource] = useState<Source>(sources[0]);
  // Who clips the chosen source, for its price: SOCIA for uploads when it can, else Vizard.
  const provider = source === "upload" && sociaReady ? "socia" : "vizard";
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // The uploaded copy of `file`, so confirming the real price doesn't upload it twice.
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number | "">("");
  const [opts, setOpts] = useState<ClipperOptions>(DEFAULT_CLIPPER_OPTIONS);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const price = typeof minutes === "number" && minutes > 0 ? clipCredits(minutes, opts.clipModel, provider) : null;

  const loadJob = useCallback(async (id: string) => {
    const r = await api<{ job: Job; clips: Clip[] }>(`/api/clipper/jobs/${id}`);
    setJobs((js) => js.map((j) => (j.id === id ? r.job : j)));
    if (r.job.status === "done") setClipsByJob((m) => ({ ...m, [id]: r.clips }));
    return r.job;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await api<{ jobs: Job[]; balance: number | null }>("/api/clipper/jobs");
        setJobs(r.jobs); setBalance(r.balance);
        const last = r.jobs.find((j) => j.status === "done");
        if (last) { setOpen(last.id); void loadJob(last.id); }
      } catch (e) { setErr(errorText(e)); } finally { setLoading(false); }
    })();
  }, [loadJob]);

  usePolling(jobs, loadJob, 10_000, (job) => { if (job.status === "done") setOpen(job.id); void api<{ balance: number | null }>("/api/clipper/jobs").then((r) => setBalance(r.balance)).catch(() => null); });

  async function submit() {
    setErr(null); setPriceNote(null);
    try {
      let body: Record<string, unknown>;
      if (source === "youtube") body = { source: { kind: "youtube", url: url.trim() }, minutes: minutes || null, options: opts };
      else if (source === "url") body = { source: { kind: "url", url: url.trim() }, minutes: minutes || null, options: opts };
      else {
        if (!file) throw new Error("Choose a video file first.");
        let path = uploaded;
        if (!path) {
          setBusy("Uploading");
          const up = await api<{ path: string; signedUrl: string }>("/api/clipper/upload", { method: "POST", body: JSON.stringify({ contentType: file.type, bytes: file.size }) });
          await uploadToSigned(up.signedUrl, file, setProgress);
          setProgress(null);
          setUploaded(up.path);
          path = up.path;
        }
        body = { source: { kind: "upload", path }, minutes, options: { ...opts, sourceName: file.name } };
      }
      setBusy("Starting");
      const r = await api<{ job: Job; balance: number | null }>("/api/clipper/jobs", { method: "POST", body: JSON.stringify(body) });
      setJobs((js) => [r.job, ...js]); setBalance(r.balance);
      setUrl(""); setFile(null); setUploaded(null); setMinutes("");
    } catch (e) {
      // SOCIA measured the video: show its real price and let the person press again.
      const measured = (e as { code?: string; minutes?: number }).code === "confirm_price" ? (e as { minutes?: number }).minutes : undefined;
      if (typeof measured === "number") { setMinutes(measured); setPriceNote(errorText(e)); return; }
      setErr(isCreditsShort(e) ? "Not enough credits for this video. Buy a top-up in Settings or wait for next month's allowance." : errorText(e));
    } finally { setBusy(null); setProgress(null); }
  }

  async function remove(job: Job) {
    setRemoveBusy(true); setRemoveErr(null);
    try {
      await api(`/api/clipper/jobs/${job.id}`, { method: "DELETE" });
      setJobs((js) => js.filter((j) => j.id !== job.id));
      if (open === job.id) setOpen(null);
      setRemoving(null);
    } catch (e) { setRemoveErr(errorText(e)); } finally { setRemoveBusy(false); }
  }

  async function cancelJob(job: Job) {
    setCancelBusy(true); setCancelErr(null);
    try {
      const r = await api<{ job: Job; balance: number | null }>(`/api/clipper/jobs/${job.id}/cancel`, { method: "POST" });
      setJobs((js) => js.map((j) => (j.id === job.id ? r.job : j)));
      setBalance(r.balance);
      setCancelling(null);
    } catch (e) { setCancelErr(errorText(e)); } finally { setCancelBusy(false); }
  }

  const toggleLength = (id: ClipLength) => setOpts((o) => ({ ...o, lengths: o.lengths.includes(id) ? (o.lengths.length > 1 ? o.lengths.filter((l) => l !== id) : o.lengths) : [...o.lengths.filter((l) => l !== "auto" && id !== "auto"), id] }));
  const canSubmit = canMutate && !busy && (source === "youtube" ? url.trim().length > 10 : source === "url" ? url.trim().length > 10 : Boolean(file));

  return (
    <div className="ai-page">
      <section className="ai-panel">
        <div className="ai-panel-head"><Scissors size={16} aria-hidden /><h2>New clips</h2></div>
        <div className="ai-tabs" role="tablist">
          {sources.length > 1 && sources.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={source === s} className={`ai-tab${source === s ? " is-on" : ""}`} onClick={() => { setSource(s); setErr(null); setPriceNote(null); setMinutes(""); }}>
              {s === "youtube" ? "YouTube link" : s === "upload" ? "Upload a file" : "Direct video link"}
            </button>
          ))}
        </div>
        {source !== "upload" ? (
          <label className="ai-field">
            <span>{source === "youtube" ? "YouTube link" : "Link to an .mp4, .mov or .3gp file"}</span>
            <input type="url" value={url} onChange={(e) => { setUrl(e.target.value); if (source === "youtube") setMinutes(""); }} placeholder={source === "youtube" ? "https://www.youtube.com/watch?v=..." : "https://example.com/talk.mp4"} inputMode="url" />
          </label>
        ) : (
          <label className="ai-field">
            <span>Video file (.mp4, .mov, .3gp)</span>
            <input type="file" accept="video/mp4,video/quicktime,video/3gpp" onChange={async (e) => { const f = e.target.files?.[0] ?? null; setFile(f); setUploaded(null); if (f) { const m = await videoMinutes(f); if (m) setMinutes(m); } }} />
          </label>
        )}
        {source !== "youtube" && (
          <label className="ai-field ai-field-short">
            <span>{source === "url" ? "Length of the video, minutes (optional, SOCIA checks it)" : "Length of the video, minutes (SOCIA checks it)"}</span>
            <input type="number" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value ? Math.max(1, Math.ceil(Number(e.target.value))) : "")} />
          </label>
        )}
        <div className="ai-options">
          {provider === "socia" && (
            <label className="ai-field ai-field-short">
              <span>Language spoken</span>
              <select value={opts.lang} onChange={(e) => setOpts((o) => ({ ...o, lang: e.target.value }))}>
                {CLIP_LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
            </label>
          )}
          <label className="ai-field ai-field-short">
            <span>Clips, at most</span>
            <input type="number" min={1} max={MAX_CLIPS} value={opts.maxClips} onChange={(e) => setOpts((o) => ({ ...o, maxClips: Math.min(MAX_CLIPS, Math.max(1, Number(e.target.value) || 1)) }))} />
          </label>
          <div className="ai-field">
            <span>Clip length</span>
            <div className="ai-chips">
              {CLIP_LENGTHS.map((l) => (
                <button key={l.id} type="button" className={`ai-chip${opts.lengths.includes(l.id) ? " is-on" : ""}`} aria-pressed={opts.lengths.includes(l.id)} onClick={() => (l.id === "auto" ? setOpts((o) => ({ ...o, lengths: ["auto"] })) : toggleLength(l.id))}>{l.id === "auto" && provider === "socia" ? "Let SOCIA decide" : l.label}</button>
              ))}
            </div>
          </div>
          <label className="ai-check"><input type="checkbox" checked={opts.captions} onChange={(e) => setOpts((o) => ({ ...o, captions: e.target.checked }))} /> Captions on the clips</label>
          <label className="ai-check"><input type="checkbox" checked={opts.headline} onChange={(e) => setOpts((o) => ({ ...o, headline: e.target.checked }))} /> A headline on each clip</label>
          {provider === "vizard" && <label className="ai-check"><input type="checkbox" checked={opts.clipModel === "clip_v2"} onChange={(e) => setOpts((o) => ({ ...o, clipModel: e.target.checked ? "clip_v2" : "clip_v1" }))} /> Newer clipping model (costs a quarter more)</label>}
        </div>
        <CreditsLine balance={balance} price={price} label={price == null ? undefined : "This will use"} />
        {price == null && <p className="ai-note">SOCIA reads the video&apos;s length and shows the price before anything is spent: {provider === "socia" ? `${clipCredits(1, opts.clipModel, "socia")} credits for a 1-minute video, ${clipCredits(10, opts.clipModel, "socia")} for 10 minutes, ${clipCredits(60, opts.clipModel, "socia")} for an hour` : `${clipCredits(1, opts.clipModel)} credits a minute`}.</p>}
        <p className="ai-rights">Only clip videos you own or have the rights to use. SOCIA does not check ownership.</p>
        {progress != null && <progress className="ai-progress" value={progress} max={1} />}
        {priceNote && <p className="ai-note" role="status">{priceNote}</p>}
        {err && <p className="ai-err" role="alert">{err}</p>}
        <div className="ai-submit">
          <button type="button" className="btn-primary" onClick={submit} disabled={!canSubmit} aria-busy={Boolean(busy) || undefined}>
            {busy ? <><Loader2 size={14} className="spin" aria-hidden /> {busy}</> : "Make clips"}
          </button>
          {!canMutate && <small>Only the brand&apos;s owner or an admin can start a job.</small>}
        </div>
      </section>

      <section className="ai-panel">
        <div className="ai-panel-head"><h2>Your jobs</h2>{loading && <Loader2 size={14} className="spin" aria-hidden />}</div>
        {!loading && jobs.length === 0 && <p className="ai-empty">No clips yet. {sources.includes("upload") ? "Upload a video" : "Paste a YouTube link"} above to make the first ones.</p>}
        <ul className="ai-jobs">
          {jobs.map((j) => (
            <li key={j.id} className={`ai-job${open === j.id ? " is-open" : ""}`}>
              <button type="button" className="ai-job-row" onClick={() => { setOpen(open === j.id ? null : j.id); if (j.status === "done" && !clipsByJob[j.id]) void loadJob(j.id); }} aria-expanded={open === j.id}>
                <span className="ai-job-src">{j.source_kind === "youtube" ? j.source_url : j.source_kind === "upload" ? j.options?.sourceName ?? "Uploaded video" : j.source_url}</span>
                <span className="ai-job-meta">{j.source_minutes} min · {j.credits_charged ?? j.credits_reserved} credits · {when(j.created_at)}</span>
                <StatusChip status={j.status} working={stageLabel(j.stage)} />
              </button>
              {j.status === "cancelled" && <p className="ai-note">Cancelled. Your credits are back.</p>}
              {j.status === "failed" && <p className="ai-err">{j.error ?? "Clipping failed."} {j.credits_charged === 0 && "Your credits are back."}</p>}
              {j.status === "done" && j.error && <p className="ai-note">{j.error}</p>}
              {open === j.id && j.status === "done" && <MakeAll clips={clipsByJob[j.id] ?? []} canMutate={canMutate} queue={queue} queueSize={queueSize} onStart={(ids) => { setQueue(ids); setQueueSize(ids.length); }} />}
              {open === j.id && j.status === "done" && (
                <div className="ai-grid">
                  {(clipsByJob[j.id] ?? []).map((c) => c.render && (!c.playUrl || recrop === c.id) ? (
                    <ClipRenderCard key={c.id} id={c.id} title={c.title ?? "Clip"} render={c.render} headline={j.options?.headline !== false} canMutate={canMutate}
                      autoStart={queue[0] === c.id} onSettled={() => setQueue((q) => q.filter((x) => x !== c.id))}
                      sub={`${fmtDur(c.duration_ms)}${c.score != null ? `, score ${c.score}/10` : ""}`} why={c.score_reason}
                      onRendered={() => { setRecrop(null); void loadJob(j.id); }} onCancel={c.playUrl ? () => setRecrop(null) : undefined} />
                  ) : (
                    <MediaCard key={c.id} kind="clip" id={c.id} title={c.title ?? "Clip"} isVideo playUrl={c.playUrl} downloadUrl={c.downloadUrl} caption={c.caption ?? ""} hashtags={c.hashtags ?? []} canMutate={canMutate}
                      sub={<>{fmtDur(c.duration_ms)}{c.score != null && <> · score {c.score}/10</>}</>}>
                      {c.score_reason && <details className="ai-why"><summary>Why this score</summary><p>{c.score_reason}</p></details>}
                      {c.render && canMutate && <button type="button" className="ai-act is-quiet" onClick={() => setRecrop(c.id)}>Change the crop</button>}
                    </MediaCard>
                  ))}
                  {!clipsByJob[j.id] && <p className="ai-note"><Loader2 size={14} className="spin" aria-hidden /> Loading clips</p>}
                </div>
              )}
              {canMutate && (j.status === "queued" || (j.status === "processing" && j.provider === "socia")) && <button type="button" className="ai-act is-quiet ai-job-remove" onClick={() => { setCancelErr(null); setCancelling(j); }}>Cancel</button>}
              {canMutate && j.status !== "processing" && j.status !== "queued" && <button type="button" className="ai-act is-quiet ai-job-remove" onClick={() => { setRemoveErr(null); setRemoving(j); }}>Remove</button>}
            </li>
          ))}
        </ul>
      </section>
      <ConfirmDialog open={Boolean(cancelling)} onOpenChange={(o) => { if (!o) setCancelling(null); }} danger busy={cancelBusy}
        title="Cancel this job?" confirmLabel="Cancel job" cancelLabel="Keep it running"
        body={cancelErr ?? `SOCIA stops working on it, your ${cancelling?.credits_reserved ?? ""} credits come back, and the uploaded video is deleted. To clip it later, you'd upload it again.`}
        onConfirm={() => { if (cancelling) return cancelJob(cancelling); }} />
      <ConfirmDialog open={Boolean(removing)} onOpenChange={(o) => { if (!o) setRemoving(null); }} danger busy={removeBusy}
        title="Remove this job?" confirmLabel="Remove job"
        body={removeErr ?? "The uploaded video and every clip made from it are deleted, and this can't be undone. Drafts already sent to the scheduler stay."}
        onConfirm={() => { if (removing) return remove(removing); }} />
    </div>
  );
}
