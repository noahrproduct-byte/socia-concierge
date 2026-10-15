"use client";

// Calendar → Needs approval (owner and Admins) / My submissions (Members).
// Approving schedules the post at the time the member asked for, or at a time
// the approver picks, or right away. A post going to YouTube opens in Create
// post, because YouTube's upload runs in the approver's browser.

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Film, Loader2 } from "lucide-react";
import type { ApprovalItem } from "@/lib/approvals";
import { formatWhen, fromLocalInput, toLocalInput, viewerTimeZone } from "@/lib/publishing/timing";
import { relTime } from "@/lib/overview";

type Role = "approve" | "submit";

const STATUS: Record<ApprovalItem["status"], { label: string; tone: string }> = {
  pending: { label: "Waiting for approval", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  changes_requested: { label: "Sent back", tone: "warning" },
  withdrawn: { label: "Withdrawn", tone: "muted" },
};

async function act(id: string, body: Record<string, unknown>) {
  const r = await fetch(`/api/approvals/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  return { ok: Boolean(r?.ok), error: (j as { error?: string }).error ?? (r ? null : "Check your connection and try again."), openComposer: (j as { openComposer?: string }).openComposer ?? null, scheduledFor: (j as { scheduledFor?: string | null }).scheduledFor ?? null };
}

function ApproveRow({ item, onDone }: { item: ApprovalItem; onDone: (id: string, message: string) => void }) {
  const router = useRouter();
  const [tz, setTz] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [at, setAt] = useState("");
  const [asap, setAsap] = useState(false);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "approve" | "return">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const z = viewerTimeZone() ?? "UTC";
    const n = new Date();
    setTz(z); setNow(n);
    const future = item.requestedAt && new Date(item.requestedAt).getTime() > n.getTime();
    setAt(future ? toLocalInput(item.requestedAt, z) : "");
    setAsap(!item.requestedAt);
  }, [item.requestedAt]);

  const approve = async () => {
    setError(null);
    if (item.hasYouTube) { router.push(`/create?post=${encodeURIComponent(item.postId)}`); return; }
    const iso = asap ? "now" : tz ? fromLocalInput(at, tz) : null;
    if (!iso) { setError("Choose when it should go out, or tick “As soon as I approve”."); return; }
    setBusy("approve");
    const r = await act(item.id, { action: "approve", at: iso });
    setBusy(null);
    if (r.openComposer) { router.push(r.openComposer); return; }
    if (!r.ok) { setError(r.error); return; }
    onDone(item.id, r.scheduledFor && tz && now ? `Approved: “${item.title}” is scheduled for ${formatWhen(r.scheduledFor, new Date(), tz)}.` : `Approved: “${item.title}” is publishing now.`);
  };

  const sendBack = async () => {
    setError(null);
    setBusy("return");
    const r = await act(item.id, { action: "return", note });
    setBusy(null);
    if (!r.ok) { setError(r.error); return; }
    onDone(item.id, `Sent back: “${item.title}”.`);
  };

  const wants = item.requestedAt ? (tz && now ? formatWhen(item.requestedAt, now, tz) : "…") : "As soon as it's approved";

  return (
    <li className="ca-row">
      {item.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumb} alt="" width={56} height={56} className="ca-thumb" />
      ) : <span className="ca-thumb ph"><Film size={16} /></span>}
      <div className="ca-body">
        <b>{item.title}</b>
        {item.excerpt && <p className="ca-excerpt">{item.excerpt}</p>}
        <small>{item.platforms.join(", ") || "No platform"} · From {item.submittedBy ?? "a member"} · {relTime(item.submittedAt)}</small>
        <small>Wants it out: {wants}</small>
        {item.submitNote && <small className="ca-note">Note: “{item.submitNote}”</small>}

        {!returning ? (
          <div className="ca-actions">
            {!item.hasYouTube && (
              <span className="ca-when">
                <input type="datetime-local" className="cp-input" value={at} disabled={asap} onChange={(e) => setAt(e.target.value)} aria-label="When it goes out" />
                <label className="ca-asap"><input type="checkbox" checked={asap} onChange={(e) => setAsap(e.target.checked)} /> As soon as I approve</label>
              </span>
            )}
            <button type="button" className="btn-primary sm" disabled={busy !== null} onClick={() => void approve()}>
              {busy === "approve" ? <Loader2 size={13} className="cr-spin" /> : null} {item.hasYouTube ? "Open to approve" : asap ? "Approve & publish" : "Approve & schedule"}
            </button>
            <button type="button" className="btn-secondary sm" disabled={busy !== null} onClick={() => setReturning(true)}>Send back</button>
            <Link href={`/create?post=${encodeURIComponent(item.postId)}`} className="ca-open">Open</Link>
          </div>
        ) : (
          <div className="ca-return">
            <textarea className="cp-input" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change?" aria-label="What should change" autoFocus />
            <div className="ca-actions">
              <button type="button" className="btn-secondary sm" onClick={() => setReturning(false)}>Cancel</button>
              <button type="button" className="btn-primary sm" disabled={!note.trim() || busy !== null} onClick={() => void sendBack()}>
                {busy === "return" ? <Loader2 size={13} className="cr-spin" /> : null} Send back
              </button>
            </div>
          </div>
        )}
        {item.hasYouTube && <small className="ca-hint">Goes to YouTube: its upload runs in your browser, so approve it in Create post.</small>}
        {error && <p className="ca-err" role="alert">{error}</p>}
      </div>
    </li>
  );
}

function MineRow({ item, onWithdrawn }: { item: ApprovalItem; onWithdrawn: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = STATUS[item.status];
  return (
    <li className="ca-row">
      {item.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumb} alt="" width={56} height={56} className="ca-thumb" />
      ) : <span className="ca-thumb ph"><Film size={16} /></span>}
      <div className="ca-body">
        <b>{item.title} <span className={`ov-chip ${s.tone}`}>{s.label}</span></b>
        <small>{item.platforms.join(", ") || "No platform"} · submitted {relTime(item.submittedAt)}</small>
        {item.status === "changes_requested" && <p className="ca-note warn">{item.reviewNote ? `“${item.reviewNote}”` : "The reviewer asked for changes."}</p>}
        <div className="ca-actions">
          <Link href={`/create?post=${encodeURIComponent(item.postId)}`} className="btn-secondary sm">{item.status === "changes_requested" || item.status === "withdrawn" ? "Edit and resubmit" : "Open"}</Link>
          {item.status === "pending" && (
            <button type="button" className="btn-secondary sm" disabled={busy} onClick={async () => {
              setBusy(true); setError(null);
              const r = await act(item.id, { action: "withdraw" });
              setBusy(false);
              if (!r.ok) setError(r.error); else onWithdrawn(item.id);
            }}>{busy ? <Loader2 size={13} className="cr-spin" /> : null} Withdraw</button>
          )}
        </div>
        {error && <p className="ca-err" role="alert">{error}</p>}
      </div>
    </li>
  );
}

export default function CalendarApprovals({ role, items: initial, initialTab, children }: { role: Role; items: ApprovalItem[]; initialTab: "calendar" | "approvals"; children: ReactNode }) {
  const [tab, setTab] = useState(initialTab);
  const [items, setItems] = useState(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const pending = items.filter((i) => i.status === "pending").length;
  const label = role === "approve" ? `Needs approval${pending ? ` (${pending})` : ""}` : "My submissions";

  return (
    <>
      <div className="ca-tabs" role="tablist" aria-label="Calendar views">
        <button type="button" role="tab" aria-selected={tab === "calendar"} className={tab === "calendar" ? "on" : ""} onClick={() => setTab("calendar")}>Calendar</button>
        <button type="button" role="tab" aria-selected={tab === "approvals"} className={tab === "approvals" ? "on" : ""} onClick={() => setTab("approvals")}>
          <ClipboardCheck size={14} aria-hidden /> {label}
        </button>
      </div>
      {tab === "calendar" ? children : (
        <section className="ov-card ca" aria-label={label}>
          {notice && <p className="ca-notice" role="status">{notice}</p>}
          {!items.length ? (
            <p className="ca-empty">{role === "approve" ? "Nothing is waiting for approval." : "You haven't submitted anything for approval in the last 30 days."}</p>
          ) : (
            <ul className="ca-list">
              {items.map((i) => role === "approve"
                ? <ApproveRow key={i.id} item={i} onDone={(id, msg) => { setItems((xs) => xs.filter((x) => x.id !== id)); setNotice(msg); }} />
                : <MineRow key={i.id} item={i} onWithdrawn={(id) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, status: "withdrawn" } : x)))} />)}
            </ul>
          )}
          {role === "approve" && <p className="ca-foot">Members submit posts here instead of scheduling them. Approving schedules the post; scheduling or publishing it from Create post approves it too.</p>}
        </section>
      )}
    </>
  );
}
