"use client";
/* eslint-disable @next/next/no-img-element -- local object URLs for files not yet uploaded */

// Add many posts at once. Drop any number of videos and photos; SOCIA spreads
// them over the coming week (lib/spread.ts: free days first, the audience
// hour for each weekday, never two within an hour), the person adjusts times
// and captions, and one click saves them. The server decides each row's
// state exactly as it does for a single post: media + caption + future time
// on a plan with scheduling = scheduled, otherwise a draft that says what it
// still needs. Nothing is published from here.
import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, X, Loader2, Check, AlertTriangle, FileVideo, Image as ImageIcon } from "lucide-react";
import PlanNotice from "@/components/PlanNotice";
import { isPlanError, type PlanError } from "@/lib/planErrors";
import { createClient } from "@/lib/supabase/client";
import { uploadMedia } from "@/lib/supabase/uploadMedia";
import { readiness, type MediaType, type ScheduledPost } from "@/lib/scheduling";
import { spreadSlots } from "@/lib/spread";

const BUCKET = "scheduled-media";
const VIDEO_RE = /\.(mp4|mov|m4v|webm)$/i;
const IMAGE_RE = /\.(jpe?g|png|webp|heic)$/i;
const CONCURRENCY = 2;

type RowState = "pending" | "saving" | "uploading" | "done" | "error";
type Row = {
  key: string;
  file: File;
  mediaType: MediaType;
  caption: string;
  at: Date;
  thumb: string;
  state: RowState;
  post: ScheduledPost | null;
  error: string | null;
};

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmtWhen = (d: Date) => d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const isVideo = (f: File) => f.type.startsWith("video/") || VIDEO_RE.test(f.name);
const isImage = (f: File) => f.type.startsWith("image/") || IMAGE_RE.test(f.name);

async function api<T>(method: string, body: unknown): Promise<T> {
  const res = await fetch("/api/schedule", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) { const e = new Error(j.error ?? `Request failed (${res.status})`) as Error & { body?: unknown }; e.body = j; throw e; }
  return j;
}

export default function BulkDrop({ userId, now, existing, hourFor, canSchedule, planError: pagePlanError, initialFiles, onSaved, onClose, notify }: {
  userId: string;
  now: Date;
  /** times of posts already on the calendar */
  existing: Date[];
  hourFor: (weekdayMonFirst: number) => number;
  canSchedule: boolean;
  planError: PlanError | null;
  initialFiles?: File[];
  onSaved: (p: ScheduledPost) => void;
  onClose: () => void;
  notify: (s: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [drag, setDrag] = useState(false);
  const [running, setRunning] = useState(false);
  const [serverPlanError, setServerPlanError] = useState<PlanError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const planError = serverPlanError ?? pagePlanError;

  /** Lay the pending rows over the week again (existing posts and already-saved rows count as taken). */
  const place = (list: Row[]): Row[] => {
    const pending = list.filter((r) => r.state === "pending");
    const taken = [...existing, ...list.filter((r) => r.state !== "pending").map((r) => r.at)];
    const slots = spreadSlots({ count: pending.length, now, existing: taken, hourFor });
    const byIndex = new Map(slots.map((s) => [s.index, s.at]));
    let i = 0;
    return list.map((r) => (r.state === "pending" ? { ...r, at: byIndex.get(i++) ?? r.at } : r));
  };

  const addFiles = (files: FileList | File[]) => {
    const ok = Array.from(files).filter((f) => isVideo(f) || isImage(f));
    const seen = new Set(rows.map((r) => `${r.file.name}|${r.file.size}|${r.file.lastModified}`));
    const fresh = ok.filter((f) => !seen.has(`${f.name}|${f.size}|${f.lastModified}`));
    if (ok.length && !fresh.length) { setNotice("Those files are already in the list."); return; }
    if (!ok.length) { setNotice("Drop videos (MP4 or MOV) or photos (JPG or PNG)."); return; }
    setNotice(null);
    setRows((cur) => place([
      ...cur,
      ...fresh.map<Row>((file) => ({
        key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file,
        mediaType: isVideo(file) ? "REELS" : "IMAGE", caption: "", at: now,
        thumb: URL.createObjectURL(file), state: "pending", post: null, error: null,
      })),
    ]));
  };

  // Seed once (React's development strict mode mounts effects twice).
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (initialFiles?.length) addFiles(initialFiles);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => rows.forEach((r) => URL.revokeObjectURL(r.thumb)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (key: string, p: Partial<Row>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const removeRow = (key: string) => setRows((cur) => place(cur.filter((r) => r.key !== key)));

  const pending = rows.filter((r) => r.state === "pending");
  const done = rows.filter((r) => r.state === "done");
  const scheduledCount = done.filter((r) => r.post?.status === "scheduled").length;
  const draftCount = done.length - scheduledCount;
  const invalid = pending.filter((r) => Number.isNaN(r.at.getTime()) || r.at.getTime() <= Date.now());
  const days = useMemo(() => new Set(pending.map((r) => r.at.toDateString())).size, [pending]);

  const saveAll = async () => {
    if (!pending.length || invalid.length) return;
    setRunning(true); setServerPlanError(null); setNotice(null);
    const supabase = createClient();
    let planNote: PlanError | null = null;
    const one = async (r: Row) => {
      try {
        patch(r.key, { state: "saving" });
        // 1) the row, kept a draft until its media is attached
        const made = await api<{ posts: ScheduledPost[]; plan?: { canSchedule: boolean; error: PlanError | null } }>("POST", { scheduled_at: r.at.toISOString(), caption: r.caption, media_type: r.mediaType, keep_draft: true });
        if (made.plan && !made.plan.canSchedule && made.plan.error) planNote = made.plan.error;
        const row = made.posts[0];
        if (!row) throw new Error("The post wasn't saved.");
        // 2) the file, under this viewer's own folder
        patch(r.key, { state: "uploading", post: row });
        const safe = r.file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
        const path = `${userId}/${row.id}/${Date.now()}_${safe}`;
        await uploadMedia(supabase, BUCKET, path, r.file);
        // 3) attach it; the server derives the URL and decides scheduled vs draft
        const upd = await api<{ post: ScheduledPost }>("PATCH", { id: row.id, media_path: path });
        patch(r.key, { state: "done", post: upd.post, error: null });
        onSaved(upd.post);
      } catch (e) {
        const body = (e as { body?: unknown }).body;
        if (isPlanError(body)) { setServerPlanError(body); }
        patch(r.key, { state: "error", error: e instanceof Error ? e.message : "Something went wrong." });
      }
    };
    const queue = [...pending];
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => { while (queue.length) await one(queue.shift()!); }));
    if (planNote) setServerPlanError(planNote);
    setRunning(false);
  };

  useEffect(() => {
    if (running || !done.length || pending.length) return;
    const parts = [scheduledCount ? `${scheduledCount} scheduled` : "", draftCount ? `${draftCount} saved as draft${draftCount === 1 ? "" : "s"}` : ""].filter(Boolean);
    if (parts.length) notify(`${parts.join(", ")}.${draftCount ? " Drafts still need a caption before they go out." : ""}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const stateLine = (r: Row) => {
    if (r.state === "saving") return <span className="cal2-bulk-state"><Loader2 size={11} className="spin" /> Saving</span>;
    if (r.state === "uploading") return <span className="cal2-bulk-state"><Loader2 size={11} className="spin" /> Uploading</span>;
    if (r.state === "error") return <span className="cal2-bulk-state bad"><AlertTriangle size={11} /> {r.error}</span>;
    if (r.state === "done" && r.post) {
      if (r.post.status === "scheduled") return <span className="cal2-bulk-state ok"><Check size={11} /> Scheduled</span>;
      const missing = readiness(r.post).missing.filter((m) => m !== "media");
      return <span className="cal2-bulk-state"><Check size={11} /> Draft{missing.length ? `, needs ${missing.join(" and ")}` : canSchedule ? "" : " (scheduling isn't on this plan)"}</span>;
    }
    return <span className="cal2-bulk-state">{r.caption.trim() ? (canSchedule ? "Will be scheduled" : "Will be a draft") : "Will be a draft until it has a caption"}</span>;
  };

  return (
    <div className="cal2-modal-bg" role="dialog" aria-modal="true" aria-labelledby="bulk-title" onClick={(e) => { if (e.target === e.currentTarget && !running) onClose(); }}>
      <div className="cal2-modal wide" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length && !running) addFiles(e.dataTransfer.files); }}>
        <div className="cal2-modal-head">
          <h2 id="bulk-title">Add many posts</h2>
          <button type="button" className="cal2-x" aria-label="Close" disabled={running} onClick={onClose}><X size={16} /></button>
        </div>

        <div className={`cal2-bulk-drop${drag ? " drag" : ""}`} role="button" tabIndex={0} onClick={() => !running && input.current?.click()} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !running) { e.preventDefault(); input.current?.click(); } }}>
          <span className="cal2-bulk-ico"><Upload size={16} /></span>
          <div>
            <b>{drag ? "Drop them" : rows.length ? "Drop more, or click to browse" : "Drop videos and photos here, or click to browse"}</b>
            <p>They are spread over the next seven days: empty days first, at the hour your audience is usually around. Change any time or caption before saving.</p>
          </div>
          <input ref={input} type="file" hidden multiple accept="video/mp4,video/quicktime,video/*,image/jpeg,image/png,image/*" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
        </div>

        {planError && <div className="cal2-form-err"><PlanNotice error={planError} compact onCta={() => setServerPlanError(null)} /></div>}
        {notice && <p className="cal2-form-err" role="status">{notice}</p>}

        {rows.length > 0 && (
          <ul className="cal2-bulk-list">
            {rows.map((r) => (
              <li key={r.key} className={`cal2-bulk-row ${r.state}`}>
                <div className="cal2-bulk-thumb">
                  {r.mediaType === "REELS" ? <video src={r.thumb} muted playsInline preload="metadata" aria-hidden /> : <img src={r.thumb} alt="" />}
                </div>
                <div className="cal2-bulk-body">
                  <div className="cal2-bulk-top">
                    <b title={r.file.name}>{r.mediaType === "REELS" ? <FileVideo size={12} /> : <ImageIcon size={12} />} {r.file.name}</b>
                    <small>{(r.file.size / 1024 / 1024).toFixed(0)} MB · {r.mediaType === "REELS" ? "Reel" : "Photo"}</small>
                    {r.state === "pending" && !running && <button type="button" className="cal2-bulk-x" aria-label={`Remove ${r.file.name}`} onClick={() => removeRow(r.key)}><X size={13} /></button>}
                  </div>
                  <label className="cal2-bulk-when">
                    <span>When</span>
                    {r.state === "pending" && !running ? (
                      <input type="datetime-local" value={Number.isNaN(r.at.getTime()) ? "" : toLocalInput(r.at)} onChange={(e) => patch(r.key, { at: new Date(e.target.value) })} />
                    ) : <b>{fmtWhen(r.at)}</b>}
                  </label>
                  {r.state === "pending" && !running ? (
                    <textarea value={r.caption} maxLength={2200} placeholder="Caption (optional now; a post goes out only with one)" onChange={(e) => patch(r.key, { caption: e.target.value })} />
                  ) : r.caption.trim() ? <p className="cal2-bulk-summary" style={{ margin: 0 }}>{r.caption.trim().slice(0, 140)}</p> : null}
                  {stateLine(r)}
                </div>
              </li>
            ))}
          </ul>
        )}

        {pending.length > 0 && (
          <p className="cal2-bulk-summary">
            {pending.length} post{pending.length === 1 ? "" : "s"} over {days} day{days === 1 ? "" : "s"}.{" "}
            {invalid.length ? `${invalid.length} ${invalid.length === 1 ? "has" : "have"} a time in the past; fix it to continue.` : pending.some((r) => !r.caption.trim()) ? "Posts without a caption are saved as drafts; add the caption later in Create post." : canSchedule ? "Every post has a caption, so each one is scheduled when saved." : ""}
          </p>
        )}

        <div className="cal2-modal-actions">
          <button type="button" className="ov-btn ghost" disabled={running} onClick={onClose}>{done.length && !pending.length ? "Done" : "Cancel"}</button>
          {pending.length > 0 && (
            <button type="button" className="ov-btn primary" disabled={running || invalid.length > 0} onClick={() => void saveAll()}>
              {running ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} {running ? "Saving" : `Add ${pending.length} post${pending.length === 1 ? "" : "s"} to the calendar`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
