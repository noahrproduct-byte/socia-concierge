"use client";

// Pieces the AI Clipper and AI Studio pages share: fetch helpers, the credits
// line, polling of open jobs, a signed upload, and the media card with its
// four actions (preview, download, copy caption, send to scheduler).
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, Copy, Download, Loader2, Send, Trash2 } from "lucide-react";
import { formatCredits } from "@/lib/credits/config";

export type ApiError = { error: string; code?: string; balance?: number | null; migration?: boolean; minutes?: number };

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = (await res.json().catch(() => null)) as (T & Partial<ApiError>) | null;
  if (!res.ok) {
    const err = Object.assign(new Error(j?.error || `SOCIA could not complete that (${res.status}). Try again in a moment.`), { status: res.status, code: j?.code, balance: j?.balance, minutes: j?.minutes });
    throw err;
  }
  return j as T;
}

export const errorText = (e: unknown): string =>
  e instanceof Error
    // The renderer's own timeout, which reads like a crash: browsers pause a page that is off screen.
    ? (/delayRender/.test(e.message) ? "Making the clip stalled. Keep this page on screen while it runs, then press Make this clip again." : e.message)
    : "SOCIA could not complete that. Try again in a moment.";
export const isCreditsShort = (e: unknown): boolean => (e as { code?: string })?.code === "insufficient_credits";

/** "Balance: 5,980 credits" with the price of what is about to run. */
export function CreditsLine({ balance, price, label }: { balance: number | null; price: number | null; label?: string }) {
  const short = balance != null && price != null && price > balance;
  return (
    <p className={`ai-credits${short ? " is-short" : ""}`} role="status">
      {price != null && <span>{label ?? "This will use"} <b>{formatCredits(price)}</b>. </span>}
      {balance == null ? <span>Credits could not be read.</span> : <span>Balance: <b>{formatCredits(balance)}</b>.</span>}
      {short && <span> <Link href="/settings#plan">Buy a top-up</Link> or wait for next month&apos;s allowance.</span>}
    </p>
  );
}

/** Keeps asking about open jobs; a job's GET also moves it along on the server. */
export function usePolling<T extends { id: string; status: string }>(jobs: T[], load: (id: string) => Promise<T>, everyMs: number, onDone?: (job: T) => void) {
  const ref = useRef(jobs);
  ref.current = jobs;
  useEffect(() => {
    const open = jobs.filter((j) => j.status === "queued" || j.status === "processing");
    if (!open.length) return;
    let stop = false;
    const tick = async () => {
      for (const j of ref.current.filter((x) => x.status === "queued" || x.status === "processing")) {
        if (stop) return;
        try {
          const next = await load(j.id);
          if (next.status !== j.status && (next.status === "done" || next.status === "failed")) onDone?.(next);
        } catch { /* keep polling */ }
      }
    };
    const t = setInterval(tick, everyMs);
    return () => { stop = true; clearInterval(t); };
  }, [jobs, load, everyMs, onDone]);
}

/** PUT a file to a Supabase signed upload URL. Reports progress 0..1. */
export function uploadToSigned(signedUrl: string, file: File, onProgress?: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      const tooBig = xhr.status === 413 || /exceeded the maximum/i.test(xhr.responseText ?? "");
      reject(new Error(tooBig ? "This file is bigger than storage allows right now. Export a smaller version and try again." : `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(file);
  });
}

/** Length of a local video file in minutes (rounded up), read in the browser; null when it cannot be read. */
export function videoMinutes(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(url); resolve(Number.isFinite(d) && d > 0 ? Math.ceil(d / 60) : null); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    v.src = url;
  });
}

export function StatusChip({ status, working = "Working" }: { status: string; working?: string }) {
  const label = status === "queued" ? "Waiting to start" : status === "processing" ? working : status === "done" ? "Done" : status === "failed" ? "Failed" : status === "cancelled" ? "Cancelled" : status;
  return <span className={`ai-status is-${status}`}>{(status === "queued" || status === "processing") && <Loader2 size={12} className="spin" aria-hidden />}{label}</span>;
}

export function CopyButton({ text, label = "Copy caption" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="ai-act" disabled={!text} onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard refused */ } }}>
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />} {done ? "Copied" : label}
    </button>
  );
}

export function SendToScheduler({ kind, id, disabled }: { kind: "clip" | "generation"; id: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [href, setHref] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const go = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ href: string }>("/api/media/to-scheduler", { method: "POST", body: JSON.stringify({ kind, id }) });
      setHref(r.href);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }, [kind, id]);
  if (href) return <Link href={href} className="ai-act is-primary"><Check size={14} aria-hidden /> Open the draft</Link>;
  return (
    <>
      <button type="button" className="ai-act" onClick={go} disabled={busy || disabled} aria-busy={busy || undefined}>
        {busy ? <Loader2 size={14} className="spin" aria-hidden /> : <Send size={14} aria-hidden />} Send to scheduler
      </button>
      {err && <small className="ai-err" role="alert">{err}</small>}
    </>
  );
}

export function MediaCard({ kind, id, title, sub, playUrl, downloadUrl, caption, hashtags, isVideo, canMutate, onDelete, children }: {
  kind: "clip" | "generation"; id: string; title: string; sub?: ReactNode; playUrl: string | null; downloadUrl: string | null;
  caption: string; hashtags: string[]; isVideo: boolean; canMutate: boolean; onDelete?: () => void; children?: ReactNode;
}) {
  const full = [caption, hashtags.map((t) => `#${t}`).join(" ")].filter(Boolean).join("\n\n");
  return (
    <article className="ai-card">
      <div className={`ai-media${isVideo ? " is-video" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a short signed URL from the private bucket; next/image cannot optimise it */}
        {playUrl ? (isVideo ? <video src={playUrl} controls playsInline preload="metadata" /> : <img src={playUrl} alt={title} />) : <span className="ai-media-none">Not stored yet</span>}
      </div>
      <div className="ai-card-body">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
        {caption && <p className="ai-caption">{caption}</p>}
        {hashtags.length > 0 && <p className="ai-tags">{hashtags.map((t) => `#${t}`).join(" ")}</p>}
        {children}
        <div className="ai-actions">
          {downloadUrl && <a className="ai-act" href={downloadUrl} download><Download size={14} aria-hidden /> Download</a>}
          <CopyButton text={full} />
          {canMutate && <SendToScheduler kind={kind} id={id} />}
          {canMutate && onDelete && <button type="button" className="ai-act is-quiet" onClick={onDelete} aria-label="Remove"><Trash2 size={14} aria-hidden /> Remove</button>}
        </div>
      </div>
    </article>
  );
}
