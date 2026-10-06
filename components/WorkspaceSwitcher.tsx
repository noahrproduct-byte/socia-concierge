"use client";

// The Brand Workspace switcher, in the shell. Lists the workspaces the person
// owns, switches which one the whole app reads through (one call to
// /api/workspaces/[id] with { active: true }, then a refresh), and links to
// Settings to create or manage them. Hidden until the workspaces migration has
// run (GET returns { enabled: false }); shown even with a single workspace, so
// the concept is visible and the upgrade path is clear.
//
// A switch re-renders the whole server tree (shell + page) for the new
// workspace, which takes a second or two; a refresh shows no route skeleton.
// So the switcher shows the new name at once, keeps a spinner and marks the
// document (lib/workspaceSwitching.ts → dimmed content + "Switching to …")
// until the refreshed tree has actually rendered. AppShell keys the whole
// shell by workspace id, so that render remounts every client component with
// the new workspace's data (a plain refresh would keep their old state).

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Briefcase, Plus, Settings2, Loader2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { markSwitching } from "@/lib/workspaceSwitching";

type WS = { id: string; name: string; isDefault: boolean; suspended: boolean; active: boolean; role?: "owner" | "admin" | "member" };
type Data = { enabled: boolean; workspaces?: WS[]; activeId?: string | null; canCreate?: boolean; limit?: number; used?: number };

/**
 * `initial` is the server-resolved active workspace (AppShell): the trigger
 * renders with the right name at once, and the full list follows from
 * /api/workspaces. The shell is keyed by workspace id, so after a successful
 * switch this component remounts with the new `initial` — which is also what
 * clears the switching state (see the unmount cleanup).
 */
export default function WorkspaceSwitcher({ initial }: { initial?: { id: string; name: string } | null }) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(() =>
    initial ? { enabled: true, activeId: initial.id, workspaces: [{ id: initial.id, name: initial.name, isDefault: false, suspended: false, active: true }] } : null,
  );
  const [switching, setSwitching] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const saving = useRef(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/workspaces")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Data | null) => alive && j && setData(j))
      .catch(() => alive && !initial && setData({ enabled: false }));
    return () => { alive = false; markSwitching(null); };
  }, [initial]);

  // The refresh rendered without remounting us (nothing changed), or never
  // started: clear the switching state.
  useEffect(() => {
    if (isPending || saving.current) return;
    markSwitching(null);
  }, [isPending]);

  if (!data?.enabled || !data.workspaces?.length) return null;
  const list = data.workspaces;
  const active = list.find((w) => w.active) ?? list.find((w) => !w.suspended) ?? list[0];
  const busy = Boolean(switching) || isPending;

  async function switchTo(w: WS) {
    if (w.active || w.suspended || busy) return;
    const previous = data;
    saving.current = true;
    setSwitching(w.id);
    markSwitching(w.name);
    // Optimistic: the trigger reads the new name while the server catches up.
    setData((d) => (d ? { ...d, activeId: w.id, workspaces: d.workspaces?.map((x) => ({ ...x, active: x.id === w.id })) } : d));
    try {
      const res = await fetch(`/api/workspaces/${w.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      if (!res.ok) { setData(previous); markSwitching(null); return; }
      startTransition(() => { router.refresh(); });
    } catch {
      setData(previous);
      markSwitching(null);
    } finally {
      saving.current = false;
      setSwitching(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="ws-switch" aria-label="Switch Brand Workspace" aria-busy={busy || undefined}>
        <Briefcase size={14} className="ws-switch-ico" />
        <span className="ws-switch-name">{active.name}</span>
        {busy ? <Loader2 size={14} className="acsw-spin drop-chev" /> : <ChevronDown size={14} className="drop-chev" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            Brand Workspaces{typeof data.used === "number" && typeof data.limit === "number" ? ` · ${data.used}/${data.limit}` : ""}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {list.map((w) => (
            <DropdownMenuItem key={w.id} onClick={() => switchTo(w)} disabled={w.suspended || busy} className="gap-2">
              <Briefcase size={14} />
              <span className="flex-1">{w.name}</span>
              {w.role && w.role !== "owner" && <span className="ws-tag muted">{w.role === "admin" ? "Admin" : "Member"}</span>}
              {w.suspended ? (
                <span className="ws-tag">Paused</span>
              ) : switching === w.id ? (
                <Loader2 size={14} className="acsw-spin" />
              ) : (
                w.active && <Check size={14} />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2" onClick={() => { window.location.href = "/settings#workspaces"; }}>
            {data.canCreate ? <Plus size={14} /> : <Settings2 size={14} />}
            <span className="flex-1">{data.canCreate ? "New workspace" : "Manage workspaces"}</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
