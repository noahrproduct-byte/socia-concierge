"use client";

// The Brand Workspace switcher, in the shell. Lists the workspaces the person
// owns, switches which one the whole app reads through (one call to
// /api/workspaces/[id] with { active: true }, then a refresh), and links to
// Settings to create or manage them. Hidden until the workspaces migration has
// run (GET returns { enabled: false }); shown even with a single workspace, so
// the concept is visible and the upgrade path is clear.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Briefcase, Plus, Settings2, Loader2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type WS = { id: string; name: string; isDefault: boolean; suspended: boolean; active: boolean; role?: "owner" | "admin" | "member" };
type Data = { enabled: boolean; workspaces?: WS[]; activeId?: string | null; canCreate?: boolean; limit?: number; used?: number };

export default function WorkspaceSwitcher() {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/workspaces")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Data | null) => alive && setData(j))
      .catch(() => alive && setData({ enabled: false }));
    return () => { alive = false; };
  }, []);

  if (!data?.enabled || !data.workspaces?.length) return null;
  const list = data.workspaces;
  const active = list.find((w) => w.active) ?? list.find((w) => !w.suspended) ?? list[0];

  async function switchTo(w: WS) {
    if (w.active || w.suspended || switching) return;
    setSwitching(w.id);
    try {
      const res = await fetch(`/api/workspaces/${w.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
      if (res.ok) router.refresh();
    } finally {
      setSwitching(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="ws-switch" aria-label="Switch Brand Workspace">
        <Briefcase size={14} className="ws-switch-ico" />
        <span className="ws-switch-name">{active.name}</span>
        <ChevronDown size={14} className="drop-chev" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            Brand Workspaces{typeof data.used === "number" && typeof data.limit === "number" ? ` · ${data.used}/${data.limit}` : ""}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {list.map((w) => (
            <DropdownMenuItem key={w.id} onClick={() => switchTo(w)} disabled={w.suspended} className="gap-2">
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
