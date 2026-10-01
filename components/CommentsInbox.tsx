"use client";

// The AI comment-replies inbox. Every item shows the real comment on the left
// and SOCIA's suggested reply on the right, editable. Nothing is sent until the
// person clicks "Approve & send"; the platform's own response decides whether
// it becomes "sent" or "failed". History (sent/skipped) stays below for context.

import { useState } from "react";
import { Check, X, RefreshCw, Sparkles, Send, Loader2, AlertCircle } from "lucide-react";
import { platformMark } from "./platformMarks";
import type { CommentDraft } from "@/lib/commentDrafts";
import "./comments.css";

type SyncInfo = { scanned: number; newComments: number; drafted: number; capped: boolean; facebook: boolean; instagram: boolean };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

export default function CommentsInbox({ initial, connected }: { initial: CommentDraft[]; connected: { facebook: boolean; instagram: boolean } }) {
  const [items, setItems] = useState<CommentDraft[]>(initial);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, "send" | "skip" | "redraft">>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [syncing, setSyncing] = useState(false);
  const [syncInfo, setSyncInfo] = useState<SyncInfo | null>(null);
  const [syncErr, setSyncErr] = useState<string | null>(null);

  const open = items.filter((d) => d.status === "drafted" || d.status === "failed");
  const history = items.filter((d) => d.status === "sent" || d.status === "skipped");

  const patch = (id: string, p: Partial<CommentDraft>) => setItems((xs) => xs.map((d) => (d.id === id ? { ...d, ...p } : d)));
  const setBusyFor = (id: string, b: "send" | "skip" | "redraft" | null) => setBusy((m) => { const n = { ...m }; if (b) n[id] = b; else delete n[id]; return n; });

  async function sync() {
    setSyncing(true); setSyncErr(null);
    try {
      const res = await fetch("/api/comments/sync", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Couldn't check for comments.");
      setSyncInfo({ scanned: j.scanned, newComments: j.newComments, drafted: j.drafted, capped: j.capped, facebook: j.facebook, instagram: j.instagram });
      if (Array.isArray(j.drafts)) setItems(j.drafts);
    } catch (e) {
      setSyncErr(e instanceof Error ? e.message : "Couldn't check for comments.");
    } finally {
      setSyncing(false);
    }
  }

  async function act(d: CommentDraft, action: "send" | "skip" | "redraft") {
    setBusyFor(d.id, action);
    setErrors((m) => { const n = { ...m }; delete n[d.id]; return n; });
    try {
      const text = (edits[d.id] ?? d.draft ?? "").trim();
      const res = await fetch("/api/comments/act", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: d.id, action, text }) });
      const j = await res.json();
      if (action === "send") {
        if (!res.ok || !j.ok) { patch(d.id, { status: "failed", error: j?.error ?? "The platform rejected the reply." }); setErrors((m) => ({ ...m, [d.id]: j?.error ?? "The platform rejected the reply." })); }
        else patch(d.id, { status: "sent", draft: text, sent_reply_id: j.draft?.sent_reply_id ?? null, error: null });
      } else if (action === "skip") {
        if (j.ok) patch(d.id, { status: "skipped" });
      } else {
        if (j.ok && j.draft) { patch(d.id, { draft: j.draft, status: "drafted", error: null }); setEdits((m) => { const n = { ...m }; delete n[d.id]; return n; }); }
        else setErrors((m) => ({ ...m, [d.id]: "Couldn't draft another suggestion right now." }));
      }
    } catch {
      setErrors((m) => ({ ...m, [d.id]: "Something went wrong. Try again." }));
    } finally {
      setBusyFor(d.id, null);
    }
  }

  const noPlatforms = !connected.facebook && !connected.instagram;

  return (
    <div className="cm">
      <div className="cm-bar">
        <div className="cm-bar-meta">
          {open.length ? <><b>{open.length}</b> waiting for your approval</> : "Nothing waiting — you're all caught up."}
          {syncInfo && <> · checked {syncInfo.scanned} comment{syncInfo.scanned === 1 ? "" : "s"}, {syncInfo.newComments} new{syncInfo.capped ? " (drafting the rest on the next check)" : ""}</>}
        </div>
        <button type="button" className="cm-sync" onClick={sync} disabled={syncing || noPlatforms} title={noPlatforms ? "Connect Facebook or Instagram first" : ""}>
          {syncing ? <Loader2 size={14} className="cp-spin" /> : <RefreshCw size={14} />} {syncing ? "Checking…" : "Check for new comments"}
        </button>
      </div>
      {syncErr && <p className="cm-err" role="alert"><AlertCircle size={13} /> {syncErr}</p>}
      {noPlatforms && <div className="ov-empty"><b>Connect a platform to start</b><p>Comment replies work on your connected Facebook Page and Instagram account. Connect one in Settings → Connected accounts.</p></div>}

      {open.length > 0 && (
        <ul className="cm-list">
          {open.map((d) => {
            const b = busy[d.id];
            const value = edits[d.id] ?? d.draft ?? "";
            return (
              <li key={d.id} className="cm-item">
                <div className="cm-comment">
                  <div className="cm-who">
                    <span className={`cm-plat ${d.platform}`}>{platformMark(d.platform, "currentColor", 12)} {d.platform === "facebook" ? "Facebook" : "Instagram"}</span>
                    <b>{d.author ?? "Someone"}</b>
                    <span>{when(d.comment_created_at)}</span>
                  </div>
                  <p className="cm-text">{d.comment_text}</p>
                  {d.post_caption && <p className="cm-post">on: {d.post_caption}</p>}
                </div>
                <div className="cm-draft">
                  <span className="cm-draft-label"><Sparkles size={12} /> SOCIA's suggested reply</span>
                  <textarea value={value} onChange={(e) => setEdits((m) => ({ ...m, [d.id]: e.target.value }))} placeholder={d.draft == null ? "SOCIA couldn't draft a reply for this one — write yours here." : ""} aria-label="Reply text" />
                  <div className="cm-actions">
                    <button type="button" className="cm-btn primary" disabled={Boolean(b) || !value.trim()} onClick={() => act(d, "send")}>
                      {b === "send" ? <Loader2 size={14} className="cp-spin" /> : <Send size={14} />} Approve &amp; send
                    </button>
                    <button type="button" className="cm-btn" disabled={Boolean(b)} onClick={() => act(d, "redraft")} title="Ask SOCIA for another suggestion">
                      {b === "redraft" ? <Loader2 size={14} className="cp-spin" /> : <RefreshCw size={14} />} Another
                    </button>
                    <button type="button" className="cm-btn ghost" disabled={Boolean(b)} onClick={() => act(d, "skip")}>
                      {b === "skip" ? <Loader2 size={14} className="cp-spin" /> : <X size={14} />} Skip
                    </button>
                  </div>
                  {(errors[d.id] || (d.status === "failed" && d.error)) && <p className="cm-err" role="alert"><AlertCircle size={13} /> {errors[d.id] ?? d.error}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!open.length && !noPlatforms && (
        <div className="ov-empty"><b>No new comments to reply to</b><p>Click &ldquo;Check for new comments&rdquo; and SOCIA will draft a reply for each new comment on your recent posts. You approve every one before it&apos;s sent.</p></div>
      )}

      {history.length > 0 && (
        <>
          <h3 className="cm-section-h">Recent</h3>
          <ul className="cm-list">
            {history.slice(0, 20).map((d) => (
              <li key={d.id} className="cm-item history">
                <div className="cm-comment">
                  <div className="cm-who">
                    <span className={`cm-plat ${d.platform}`}>{platformMark(d.platform, "currentColor", 12)} {d.platform === "facebook" ? "Facebook" : "Instagram"}</span>
                    <b>{d.author ?? "Someone"}</b>
                    <span>{when(d.comment_created_at)}</span>
                    <span className={`cm-status ${d.status}`}>{d.status === "sent" ? "Replied" : "Skipped"}</span>
                  </div>
                  <p className="cm-text">{d.comment_text}</p>
                  {d.status === "sent" && d.draft && <p className="cm-ok"><Check size={13} /> {d.draft}</p>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
