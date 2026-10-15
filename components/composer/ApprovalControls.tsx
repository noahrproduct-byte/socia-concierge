"use client";

// Approvals in Create post (Pro).
//   Members:   "Submit for approval" instead of Schedule/Publish, then
//              Waiting / Sent back (with the reviewer's note) / Approved.
//   Approvers: a banner on a post that is waiting, with Send back. Scheduling
//              or publishing the post with the normal button IS the approval.
// The server checks role, plan and the post again on every action.

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck, Loader2, Undo2, MessageSquareWarning } from "lucide-react";
import type { ComposerDraft } from "@/lib/publishing/composer";
import { formatWhen } from "@/lib/publishing/timing";
import { relTime } from "@/lib/overview";
import { useNow, useViewerZone } from "./rail/ReadinessPanel";

export type ApprovalCurrent = {
  id: string;
  status: "pending" | "approved" | "changes_requested" | "withdrawn";
  submittedAt: string;
  submittedByEmail: string | null;
  mine: boolean;
  requestedAt: string | null;
  submitNote: string | null;
  reviewNote: string | null;
  decidedAt: string | null;
  scheduledFor: string | null;
};

/** The viewer's part in approvals and this post's latest round. */
export function useApproval(postId: string | null, enabled: boolean) {
  const [state, setState] = useState<{ role: "submit" | "approve" | null; current: ApprovalCurrent | null } | null>(null);
  const reload = useCallback(async () => {
    if (!enabled) return;
    const r = await fetch(`/api/approvals${postId ? `?post=${encodeURIComponent(postId)}` : ""}`).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    setState({ role: j?.role ?? null, current: j?.current ?? null });
  }, [postId, enabled]);
  useEffect(() => { void reload(); }, [reload]);
  return { state, reload };
}

async function post(url: string, body: unknown): Promise<{ ok: boolean; error?: string; openComposer?: string }> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  return r?.ok ? { ok: true } : { ok: false, error: (j as { error?: string }).error ?? "SOCIA couldn't do that just now. Try again.", openComposer: (j as { openComposer?: string }).openComposer };
}

/** A Member's primary action in the review card. */
export function ApprovalSubmit({
  draft, canAct, busy, current, saveDraft, ensurePostId, reload,
}: {
  draft: ComposerDraft;
  canAct: boolean;
  busy: boolean;
  current: ApprovalCurrent | null;
  saveDraft: () => Promise<void>;
  ensurePostId: () => Promise<string | null>;
  reload: () => Promise<void>;
}) {
  const tz = useViewerZone();
  const now = useNow(30_000);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const when = (iso: string | null) => (iso && tz && now ? formatWhen(iso, now, tz) : null);

  if (current?.status === "pending") {
    return (
      <div className="ap-state">
        <p><ClipboardCheck size={14} aria-hidden /> Waiting for approval since {relTime(current.submittedAt)}{current.requestedAt ? `, for ${when(current.requestedAt) ?? "the time you chose"}` : ", to go out as soon as it's approved"}.</p>
        <button type="button" className="btn-secondary" disabled={sending} onClick={async () => {
          setSending(true); setError(null);
          const r = await post(`/api/approvals/${current.id}`, { action: "withdraw" });
          setSending(false);
          if (!r.ok) setError(r.error ?? null); else await reload();
        }}>{sending ? <Loader2 size={13} className="cr-spin" /> : <Undo2 size={13} />} Withdraw to edit</button>
        {error && <p className="cr-error" role="alert">{error}</p>}
      </div>
    );
  }
  if (current?.status === "approved") {
    return <div className="ap-state ok"><p><ClipboardCheck size={14} aria-hidden /> Approved{current.decidedAt ? ` ${relTime(current.decidedAt)}` : ""}. It&apos;s scheduled{current.scheduledFor ? ` for ${when(current.scheduledFor) ?? "the chosen time"}` : ""}.</p></div>;
  }

  const submit = async () => {
    setSending(true); setError(null);
    try {
      await saveDraft();
      const id = await ensurePostId();
      if (!id) { setError("Save the post first."); return; }
      const requestedAt = draft.schedule.mode === "now" ? null : draft.schedule.at;
      const r = await post("/api/approvals", { postId: id, requestedAt, note: note.trim() || null });
      if (!r.ok) { setError(r.error ?? null); return; }
      setNote("");
      await reload();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ap-submit">
      <textarea className="cp-input" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the approver (optional)" aria-label="Note for the approver" />
      <button type="button" className="btn-primary" disabled={!canAct || busy || sending} onClick={() => void submit()}>
        {sending ? <><Loader2 size={14} className="cr-spin" /> Submitting…</> : "Submit for approval"}
      </button>
      <small className="cr-note" style={{ marginTop: 0 }}>
        {draft.schedule.mode === "now" ? "It goes out as soon as the owner or an admin approves it." : "The owner or an admin approves it, and it goes out at the time you chose."}
      </small>
      {error && <p className="cr-error" role="alert">{error}</p>}
    </div>
  );
}

/** The state of the latest round, at the top of the composer. */
export function ApprovalBanner({ role, current, reload }: { role: "submit" | "approve" | null; current: ApprovalCurrent | null; reload: () => Promise<void> }) {
  const tz = useViewerZone();
  const now = useNow(30_000);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!role || !current) return null;

  if (role === "submit" && current.mine && current.status === "changes_requested") {
    return (
      <div className="ap-banner warn" role="status">
        <MessageSquareWarning size={16} aria-hidden />
        <div>
          <b>Sent back{current.decidedAt ? ` ${relTime(current.decidedAt)}` : ""}</b>
          <p>{current.reviewNote ? `“${current.reviewNote}”` : "The reviewer asked for changes."} Make the changes, then submit it again.</p>
        </div>
      </div>
    );
  }
  if (role !== "approve" || current.status !== "pending") return null;

  const wants = current.requestedAt ? (tz && now ? formatWhen(current.requestedAt, now, tz) : "the time they chose") : "as soon as it's approved";
  return (
    <div className="ap-banner" role="status">
      <ClipboardCheck size={16} aria-hidden />
      <div className="ap-banner-body">
        <b>Waiting for your approval</b>
        <p>{current.submittedByEmail ?? "A member"} submitted it {relTime(current.submittedAt)} to go out {wants}.{current.submitNote ? ` Their note: “${current.submitNote}”` : ""}</p>
        <p className="ap-hint">Scheduling or publishing it below approves it. Or send it back with a note.</p>
        {open ? (
          <div className="ap-return">
            <textarea className="cp-input" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change?" aria-label="What should change" autoFocus />
            <div className="ap-row">
              <button type="button" className="btn-secondary sm" onClick={() => { setOpen(false); setError(null); }}>Cancel</button>
              <button type="button" className="btn-primary sm" disabled={!note.trim() || sending} onClick={async () => {
                setSending(true); setError(null);
                const r = await post(`/api/approvals/${current.id}`, { action: "return", note });
                setSending(false);
                if (!r.ok) setError(r.error ?? null); else { setOpen(false); await reload(); }
              }}>{sending ? <Loader2 size={13} className="cr-spin" /> : null} Send back</button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn-secondary sm" onClick={() => setOpen(true)}>Send back with a note</button>
        )}
        {error && <p className="cr-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
