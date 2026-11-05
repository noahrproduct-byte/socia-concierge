"use client";

// Ready for review in Create post (lib/teamWorkServer), on every plan with a
// team. A Member marks a saved draft ready and the owner and Admins get a
// bell; they can keep editing it. The owner or an Admin sees who marked it
// and their note; scheduling or publishing it clears the mark. On a plan with
// approvals (Pro) Members submit for approval instead (ApprovalControls).

import { useCallback, useEffect, useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button, Field, Textarea } from "@/components/system";
import { relTime } from "@/lib/overview";
import { READY_NOTE_MAX } from "@/lib/teamWork";
import "../teamwork.css";

export type ReadyCurrent = { at: string; byLabel: string | null; mine: boolean; note: string | null };

export function useReady(postId: string | null, enabled: boolean) {
  const [ready, setReady] = useState<ReadyCurrent | null>(null);
  const reload = useCallback(async () => {
    if (!enabled || !postId) { setReady(null); return; }
    const r = await fetch(`/api/posts/ready?post=${encodeURIComponent(postId)}`).catch(() => null);
    const j = r?.ok ? ((await r.json().catch(() => null)) as { ready?: ReadyCurrent | null } | null) : null;
    setReady(j?.ready ?? null);
  }, [postId, enabled]);
  useEffect(() => { void reload(); }, [reload]);
  return { ready, setReady, reload };
}

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; ready?: ReadyCurrent | null; error?: string }> {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const j = r ? ((await r.json().catch(() => ({}))) as { ready?: ReadyCurrent | null; error?: string }) : {};
  return r?.ok ? { ok: true, ready: j.ready ?? null } : { ok: false, error: j.error ?? "SOCIA couldn't do that just now. Try again." };
}

/** A Member's primary action in the review card. */
export function ReadySubmit({ canAct, busy, ready, setReady, saveDraft, ensurePostId }: {
  canAct: boolean;
  busy: boolean;
  ready: ReadyCurrent | null;
  setReady: (r: ReadyCurrent | null) => void;
  saveDraft: () => Promise<void>;
  ensurePostId: () => Promise<string | null>;
}) {
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (ready) {
    return (
      <div className="tw-ready">
        <p><ClipboardCheck size={14} aria-hidden /> Marked ready for review {relTime(ready.at)}{ready.mine ? "" : ` by ${ready.byLabel ?? "a member"}`}. The owner and admins were told. You can keep editing it.</p>
        <div className="tw-actions">
          <Button size="sm" busy={sending} onClick={async () => {
            setSending(true); setError(null);
            const id = await ensurePostId();
            const r = id ? await call(`/api/posts/ready?post=${encodeURIComponent(id)}`, "DELETE") : { ok: false, error: "Save the post first." };
            setSending(false);
            if (!r.ok) setError(r.error ?? null); else setReady(null);
          }}>Not ready yet</Button>
        </div>
        {error && <p className="tw-err" role="alert">{error}</p>}
      </div>
    );
  }

  const mark = async () => {
    setSending(true); setError(null);
    try {
      await saveDraft();
      const id = await ensurePostId();
      if (!id) { setError("Save the post first."); return; }
      const r = await call("/api/posts/ready", "POST", { postId: id, note: note.trim() || null });
      if (!r.ok) { setError(r.error ?? null); return; }
      setNote("");
      setReady(r.ready ?? null);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="tw-ready">
      <Field label="Note for the owner" optional>
        <Textarea rows={2} maxLength={READY_NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything to check, like the price in the caption" />
      </Field>
      <Button variant="primary" busy={sending} disabled={!canAct || busy || sending} onClick={() => void mark()}>Mark ready for review</Button>
      <p>The owner and admins get a notice, then they schedule it.</p>
      {error && <p className="tw-err" role="alert">{error}</p>}
    </div>
  );
}

/** For the owner and Admins: who marked this draft ready, at the top of the composer. */
export function ReadyBanner({ ready, setReady, postId }: { ready: ReadyCurrent | null; setReady: (r: ReadyCurrent | null) => void; postId: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!ready || !postId) return null;
  return (
    <div className="tw-ready-banner" role="status">
      <ClipboardCheck size={16} aria-hidden />
      <div>
        <b>Ready for your review</b>
        <p>{ready.mine ? "You" : ready.byLabel ?? "A member"} marked it ready {relTime(ready.at)}.{ready.note ? ` Their note: “${ready.note}”.` : ""} Scheduling or publishing it below clears this.</p>
        <div className="tw-actions">
          <Button size="sm" variant="ghost" busy={busy} onClick={async () => {
            setBusy(true); setError(null);
            const r = await call(`/api/posts/ready?post=${encodeURIComponent(postId)}`, "DELETE");
            setBusy(false);
            if (!r.ok) setError(r.error ?? null); else setReady(null);
          }}>Clear the mark</Button>
        </div>
        {error && <p className="tw-err" role="alert">{error}</p>}
      </div>
    </div>
  );
}
