"use client";

// Settings -> Team, for the ACTIVE workspace. The owner and admins create
// invite links, cancel pending invites and remove people; the owner changes
// roles. A member sees who is in the workspace and can leave. Enforcement is
// server-side (/api/team); this is the management surface.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Link2, Copy, Check, Trash2, Loader2, LogOut } from "lucide-react";

export type TeamMemberRow = { userId: string; role: "owner" | "admin" | "member"; email: string | null; createdAt: string | null; isYou: boolean };
export type TeamInviteRow = { id: string; role: "admin" | "member"; email: string | null; expiresAt: string };

type Props = {
  workspaceName: string;
  role: "owner" | "admin" | "member";
  members: TeamMemberRow[];
  invites: TeamInviteRow[];
  seats: { used: number | null; limit: number };
  canInvite: boolean;
  teamIncluded: boolean;
  planName: string;
  youId: string;
};

const ROLE_LABEL = { owner: "Owner", admin: "Admin", member: "Member" } as const;

export default function TeamManager({ workspaceName, role, members, invites, seats, canInvite, teamIncluded, planName, youId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteEmail, setInviteEmail] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const seatsFull = seats.used != null && seats.used >= seats.limit;
  const isOwner = role === "owner";

  async function call(url: string, init: RequestInit, tag: string): Promise<Response | null> {
    setBusy(tag);
    setErr(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErr(j?.error ?? "That didn't work. Please try again.");
        return null;
      }
      return res;
    } catch {
      setErr("That didn't work. Please try again.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function makeLink() {
    const res = await call("/api/team", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: inviteRole, email: inviteEmail.trim() || undefined }),
    }, "invite");
    if (!res) return;
    const j = (await res.json()) as { invite?: { url?: string } };
    setLink(j.invite?.url ?? null);
    setCopied(false);
    setInviteEmail("");
    router.refresh();
  }

  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* the field is selectable */ }
  }

  async function revoke(id: string) {
    if (await call(`/api/team/invites/${id}`, { method: "DELETE" }, `revoke:${id}`)) router.refresh();
  }

  async function remove(m: TeamMemberRow) {
    const label = m.isYou ? "Leave this workspace?" : `Remove ${m.email ?? "this person"} from ${workspaceName}?`;
    if (!window.confirm(label)) return;
    if (await call(`/api/team/${m.userId}`, { method: "DELETE" }, `remove:${m.userId}`)) {
      if (m.isYou) { router.push("/dashboard"); }
      router.refresh();
    }
  }

  async function changeRole(m: TeamMemberRow, next: "admin" | "member") {
    if (await call(`/api/team/${m.userId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: next }) }, `role:${m.userId}`)) router.refresh();
  }

  return (
    <div className="tm">
      <p className="tm-lead">
        People with access to <strong>{workspaceName}</strong>.
        {isOwner && seats.used != null && (
          <> {planName} includes <strong>{seats.limit}</strong> {seats.limit === 1 ? "team member" : "team members"} (you included); <strong>{seats.used}</strong> in use across your workspaces.</>
        )}
      </p>

      <ul className="tm-list">
        {members.map((m) => (
          <li key={m.userId} className="tm-item">
            <Users size={15} className="tm-ico" />
            <span className="tm-name">
              {m.email ?? (m.role === "owner" ? "Workspace owner" : "Member")}
              {m.isYou && <span className="ws-mgr-badge on">You</span>}
            </span>
            {isOwner && m.role !== "owner" ? (
              <select className="tm-role" value={m.role} disabled={busy === `role:${m.userId}`} onChange={(e) => changeRole(m, e.target.value as "admin" | "member")} aria-label="Role">
                <option value="admin">Admin</option>
                <option value="member">Member</option>
              </select>
            ) : (
              <span className="ws-mgr-badge">{ROLE_LABEL[m.role]}</span>
            )}
            {m.role !== "owner" && (m.isYou || isOwner || (role === "admin" && m.role === "member")) && (
              <button type="button" className={`ws-mgr-btn${m.isYou ? "" : " danger"}`} title={m.isYou ? "Leave" : "Remove"} aria-label={m.isYou ? "Leave" : "Remove"} onClick={() => remove(m)} disabled={busy === `remove:${m.userId}`}>
                {busy === `remove:${m.userId}` ? <Loader2 size={14} className="acsw-spin" /> : m.isYou ? <LogOut size={14} /> : <Trash2 size={14} />}
              </button>
            )}
          </li>
        ))}
      </ul>

      {canInvite && (
        <div className="tm-invite">
          <h4>Invite someone</h4>
          {!teamIncluded ? (
            <p className="ws-mgr-full">Inviting people is available on Starter and up. <a href="/pricing">See plans</a>.</p>
          ) : seatsFull ? (
            <p className="ws-mgr-full">All {seats.limit} team {seats.limit === 1 ? "member" : "members"} on {planName} are in use. <a href="/pricing">Upgrade</a> for more.</p>
          ) : (
            <>
              <div className="tm-invite-row">
                <input className="ws-mgr-input" placeholder="Email (optional, for your reference)" value={inviteEmail} maxLength={200} onChange={(e) => setInviteEmail(e.target.value)} disabled={busy === "invite"} />
                <select className="tm-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "admin" | "member")} aria-label="Invite as">
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <button type="button" className="btn-primary sm" onClick={makeLink} disabled={busy === "invite"}>
                  {busy === "invite" ? <Loader2 size={13} className="acsw-spin" /> : <><Link2 size={13} /> Create invite link</>}
                </button>
              </div>
              {link && (
                <div className="tm-link">
                  <input className="ws-mgr-input" value={link} readOnly onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className="btn-secondary sm" onClick={copy}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button>
                </div>
              )}
              <p className="tm-fine">Anyone signed in to SOCIA who opens the link joins as the role you chose. Links expire in 7 days and can be cancelled below.</p>
            </>
          )}

          {invites.length > 0 && (
            <ul className="tm-list tm-pending">
              {invites.map((i) => (
                <li key={i.id} className="tm-item">
                  <Link2 size={14} className="tm-ico" />
                  <span className="tm-name">{i.email ?? "Invite link"} <span className="ws-mgr-badge">{ROLE_LABEL[i.role]}</span> <span className="tm-exp">expires {new Date(i.expiresAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}</span></span>
                  <button type="button" className="ws-mgr-btn danger" title="Cancel invite" aria-label="Cancel invite" onClick={() => revoke(i.id)} disabled={busy === `revoke:${i.id}`}>
                    {busy === `revoke:${i.id}` ? <Loader2 size={14} className="acsw-spin" /> : <Trash2 size={14} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {err && <p className="ws-mgr-err" role="alert">{err}</p>}
      <span hidden data-you={youId} />
    </div>
  );
}
