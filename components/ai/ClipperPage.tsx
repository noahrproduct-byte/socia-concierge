"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Scissors } from "lucide-react";
import { CLIP_LENGTHS, DEFAULT_CLIPPER_OPTIONS, MAX_CLIPS, type ClipLength, type ClipperOptions } from "@/lib/clipper/provider";
import { clipCredits } from "@/lib/credits/config";
import { api, errorText, isCreditsShort, usePolling, uploadToSigned, videoMinutes, CreditsLine, StatusChip, MediaCard } from "./shared";

type Job = { id: string; status: "queued" | "processing" | "done" | "failed" | "cancelled"; source_kind: string; source_url: string; source_minutes: number; credits_reserved: number; credits_charged: number | null; error: string | null; created_at: string; options: ClipperOptions };
type Clip = { id: string; title: string | null; score: number | null; score_reason: string | null; duration_ms: number | null; caption: string | null; hashtags: string[]; playUrl: string | null; downloadUrl: string | null; transcript: string | null };
type Source = "youtube" | "upload" | "url";

const fmtDur = (ms: number | null) => (ms == null ? "" : `${Math.round(ms / 1000)} s`);
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function ClipperPage({ initialBalance, canMutate }: { initialBalance: number | null; canMutate: boolean }) {
  const [balance, setBalance] = useState<number | null>(initialBalance);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clipsByJob, setClipsByJob] = useState<Record<string, Clip[]>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // The measured price, waiting for a second press (not an error).
  const [priceNote, setPriceNote] = useState<string | null>(null);

  const [source, setSource] = useState<Source>("youtube");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  // The uploaded copy of `file`, so confirming the real price doesn't upload it twice.
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number | "">("");
  const [opts, setOpts] = useState<ClipperOptions>(DEFAULT_CLIPPER_OPTIONS);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const price = typeof minutes === "number" && minutes > 0 ? clipCredits(minutes, opts.clipModel) : null;

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
        body = { source: { kind: "upload", path }, minutes, options: opts };
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
    if (!confirm("Remove this job and its clips?")) return;
    try {
      await api(`/api/clipper/jobs/${job.id}`, { method: "DELETE" });
      setJobs((js) => js.filter((j) => j.id !== job.id));
      if (open === job.id) setOpen(null);
    } catch (e) { setErr(errorText(e)); }
  }

  const toggleLength = (id: ClipLength) => setOpts((o) => ({ ...o, lengths: o.lengths.includes(id) ? (o.lengths.length > 1 ? o.lengths.filter((l) => l !== id) : o.lengths) : [...o.lengths.filter((l) => l !== "auto" && id !== "auto"), id] }));
  const canSubmit = canMutate && !busy && (source === "youtube" ? url.trim().length > 10 : source === "url" ? url.trim().length > 10 : Boolean(file));

  return (
    <div className="ai-page">
      <section className="ai-panel">
        <div className="ai-panel-head"><Scissors size={16} aria-hidden /><h2>New clips</h2></div>
        <div className="ai-tabs" role="tablist">
          {(["youtube", "upload", "url"] as Source[]).map((s) => (
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
          <label className="ai-field ai-field-short">
            <span>Clips, at most</span>
            <input type="number" min={1} max={MAX_CLIPS} value={opts.maxClips} onChange={(e) => setOpts((o) => ({ ...o, maxClips: Math.min(MAX_CLIPS, Math.max(1, Number(e.target.value) || 1)) }))} />
          </label>
          <div className="ai-field">
            <span>Clip length</span>
            <div className="ai-chips">
              {CLIP_LENGTHS.map((l) => (
                <button key={l.id} type="button" className={`ai-chip${opts.lengths.includes(l.id) ? " is-on" : ""}`} aria-pressed={opts.lengths.includes(l.id)} onClick={() => (l.id === "auto" ? setOpts((o) => ({ ...o, lengths: ["auto"] })) : toggleLength(l.id))}>{l.label}</button>
              ))}
            </div>
          </div>
          <label className="ai-check"><input type="checkbox" checked={opts.captions} onChange={(e) => setOpts((o) => ({ ...o, captions: e.target.checked }))} /> Captions on the clips</label>
          <label className="ai-check"><input type="checkbox" checked={opts.headline} onChange={(e) => setOpts((o) => ({ ...o, headline: e.target.checked }))} /> A headline on each clip</label>
          <label className="ai-check"><input type="checkbox" checked={opts.clipModel === "clip_v2"} onChange={(e) => setOpts((o) => ({ ...o, clipModel: e.target.checked ? "clip_v2" : "clip_v1" }))} /> Newer clipping model (costs a quarter more)</label>
        </div>
        <CreditsLine balance={balance} price={price} label={price == null ? undefined : "This will use"} />
        {price == null && <p className="ai-note">SOCIA reads the video&apos;s length and shows the price before anything is spent: {clipCredits(1, opts.clipModel)} credits a minute.</p>}
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
        {!loading && jobs.length === 0 && <p className="ai-empty">No clips yet. Paste a YouTube link above to make the first ones.</p>}
        <ul className="ai-jobs">
          {jobs.map((j) => (
            <li key={j.id} className={`ai-job${open === j.id ? " is-open" : ""}`}>
              <button type="button" className="ai-job-row" onClick={() => { setOpen(open === j.id ? null : j.id); if (j.status === "done" && !clipsByJob[j.id]) void loadJob(j.id); }} aria-expanded={open === j.id}>
                <span className="ai-job-src">{j.source_kind === "youtube" ? j.source_url : j.source_kind === "upload" ? "Uploaded video" : j.source_url}</span>
                <span className="ai-job-meta">{j.source_minutes} min · {j.credits_charged ?? j.credits_reserved} credits · {when(j.created_at)}</span>
                <StatusChip status={j.status} />
              </button>
              {j.status === "failed" && <p className="ai-err">{j.error ?? "Clipping failed."} {j.credits_charged === 0 && "Your credits are back."}</p>}
              {j.status === "done" && j.error && <p className="ai-note">{j.error}</p>}
              {open === j.id && j.status === "done" && (
                <div className="ai-grid">
                  {(clipsByJob[j.id] ?? []).map((c) => (
                    <MediaCard key={c.id} kind="clip" id={c.id} title={c.title ?? "Clip"} isVideo playUrl={c.playUrl} downloadUrl={c.downloadUrl} caption={c.caption ?? ""} hashtags={c.hashtags ?? []} canMutate={canMutate}
                      sub={<>{fmtDur(c.duration_ms)}{c.score != null && <> · score {c.score}/10</>}</>}>
                      {c.score_reason && <details className="ai-why"><summary>Why this score</summary><p>{c.score_reason}</p></details>}
                    </MediaCard>
                  ))}
                  {!clipsByJob[j.id] && <p className="ai-note"><Loader2 size={14} className="spin" aria-hidden /> Loading clips</p>}
                </div>
              )}
              {canMutate && j.status !== "processing" && j.status !== "queued" && <button type="button" className="ai-act is-quiet ai-job-remove" onClick={() => remove(j)}>Remove</button>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
