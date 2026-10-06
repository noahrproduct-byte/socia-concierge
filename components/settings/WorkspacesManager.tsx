"use client";

// Settings -> Workspaces. Create (within the plan limit), rename, switch, and
// delete Brand Workspaces. Deleting a workspace removes the accounts connected
// inside it, so it asks first. Enforcement is server-side (/api/workspaces);
// this is the management surface.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Check, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { markSwitching } from "@/lib/workspaceSwitching";

export type WorkspaceRow = { id: string; name: string; isDefault: boolean; suspended: boolean; active: boolean };

export default function WorkspacesManager({
  workspaces,
  limit,
  used,
  planName,
}: {
  workspaces: WorkspaceRow[];
  limit: number;
  used: number;
  planName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Switching re-renders the whole tree; the document is marked (dimmed
  // content, "Switching to …") until the refreshed tree has rendered.
  const [isPending, startTransition] = useTransition();
  const saving = useRef(false);
  useEffect(() => { if (!isPending && !saving.current) markSwitching(null); }, [isPending]);
  useEffect(() => () => markSwitching(null), []);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const canCreate = used < limit;

  async function call(url: string, init: RequestInit, tag: string): Promise<boolean> {
    setBusy(tag);
    setErr(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErr(j?.error ?? "That didn't work. Please try again.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setErr("That didn't work. Please try again.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    const name = newName.trim();
    if (!name) return;
    setBusy("create");
    setErr(null);
    try {
      const res = await fetch("/api/workspaces", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErr(j?.error ?? "That didn't work. Please try again.");
        return;
      }
      // Drop into the new brand so connecting its accounts happens right here,
      // instead of leaving the person in the previous workspace. Best-effort:
      // the workspace exists even if the switch call fails.
      const { id } = (await res.json().catch(() => ({}))) as { id?: string };
      if (id) {
        saving.current = true;
        markSwitching(name);
        await fetch(`/api/workspaces/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: true }) }).catch(() => null);
        saving.current = false;
      }
      setNewName("");
      setCreating(false);
      startTransition(() => { router.refresh(); });
    } catch {
      setErr("That didn't work. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function rename(id: string) {
    const name = editName.trim();
    if (!name) return;
    if (await call(`/api/workspaces/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }, `rename:${id}`)) {
      setEditing(null);
    }
  }

  async function switchTo(w: WorkspaceRow) {
    saving.current = true;
    markSwitching(w.name);
    setBusy(`switch:${w.id}`);
    setErr(null);
    try {
      const res = await fetch(`/api/workspaces/${w.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ active: true }) });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErr(j?.error ?? "That didn't work. Please try again.");
        markSwitching(null);
        return;
      }
      startTransition(() => { router.refresh(); });
    } catch {
      setErr("That didn't work. Please try again.");
      markSwitching(null);
    } finally {
      saving.current = false;
      setBusy(null);
    }
  }

  async function remove(w: WorkspaceRow) {
    const ok = window.confirm(`Delete "${w.name}"? The social accounts connected inside it are removed too. This cannot be undone.`);
    if (!ok) return;
    await call(`/api/workspaces/${w.id}`, { method: "DELETE" }, `delete:${w.id}`);
  }

  return (
    <div className="ws-mgr">
      <p className="ws-mgr-lead">
        A Brand Workspace is one brand, business, location or client. Each holds up to one account on every platform. {planName} includes{" "}
        <strong>{limit}</strong> {limit === 1 ? "workspace" : "workspaces"}; you are using <strong>{used}</strong>.
      </p>

      <ul className="ws-mgr-list">
        {workspaces.map((w) => (
          <li key={w.id} className={`ws-mgr-item${w.active ? " active" : ""}`}>
            <Briefcase size={16} className="ws-mgr-ico" />
            {editing === w.id ? (
              <input
                className="ws-mgr-input"
                value={editName}
                autoFocus
                maxLength={80}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") rename(w.id); if (e.key === "Escape") setEditing(null); }}
                disabled={busy === `rename:${w.id}`}
              />
            ) : (
              <span className="ws-mgr-name">
                {w.name}
                {w.isDefault && <span className="ws-mgr-badge">Default</span>}
                {w.active && <span className="ws-mgr-badge on">Active</span>}
                {w.suspended && <span className="ws-mgr-badge paused">Paused</span>}
              </span>
            )}

            <div className="ws-mgr-actions">
              {editing === w.id ? (
                <>
                  <button type="button" className="btn-primary sm" onClick={() => rename(w.id)} disabled={busy === `rename:${w.id}`}>Save</button>
                  <button type="button" className="btn-secondary sm" onClick={() => setEditing(null)}>Cancel</button>
                </>
              ) : (
                <>
                  {!w.active && !w.suspended && (
                    <button type="button" className="btn-secondary sm" onClick={() => switchTo(w)} disabled={busy === `switch:${w.id}` || isPending}>
                      {busy === `switch:${w.id}` || (isPending && !busy) ? <Loader2 size={13} className="acsw-spin" /> : <><Check size={13} /> Use</>}
                    </button>
                  )}
                  <button type="button" className="ws-mgr-btn" title="Rename" aria-label="Rename" onClick={() => { setEditing(w.id); setEditName(w.name); }}>
                    <Pencil size={14} />
                  </button>
                  {!(w.isDefault && workspaces.length > 1) && workspaces.length > 1 && (
                    <button type="button" className="ws-mgr-btn danger" title="Delete" aria-label="Delete" onClick={() => remove(w)} disabled={busy === `delete:${w.id}`}>
                      {busy === `delete:${w.id}` ? <Loader2 size={14} className="acsw-spin" /> : <Trash2 size={14} />}
                    </button>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {creating ? (
        <div className="ws-mgr-create">
          <input
            className="ws-mgr-input"
            placeholder="Workspace name (e.g. Salvo's Hermitage)"
            value={newName}
            autoFocus
            maxLength={80}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setCreating(false); }}
            disabled={busy === "create"}
          />
          <button type="button" className="btn-primary sm" onClick={create} disabled={busy === "create" || !newName.trim()}>
            {busy === "create" ? <Loader2 size={13} className="acsw-spin" /> : "Create"}
          </button>
          <button type="button" className="btn-secondary sm" onClick={() => { setCreating(false); setNewName(""); }}>Cancel</button>
        </div>
      ) : canCreate ? (
        <button type="button" className="btn-secondary sm ws-mgr-add" onClick={() => setCreating(true)}>
          <Plus size={14} /> New workspace
        </button>
      ) : (
        <p className="ws-mgr-full">
          You are using all {limit} {limit === 1 ? "workspace" : "workspaces"} on {planName}. <a href="/pricing">Upgrade</a> for more.
        </p>
      )}

      {err && <p className="ws-mgr-err" role="alert">{err}</p>}
    </div>
  );
}
