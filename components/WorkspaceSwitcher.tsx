"use client";

// The Brand Workspace switcher at the top of the sidebar. Its panel lists the
// workspaces the person can use, switches which one the whole app reads
// through (one PATCH, then a refresh), and shows the active workspace's
// connected accounts with a Connect link for each platform that is not.
//
// A switch re-renders the whole server tree for the new workspace, which
// takes a second or two; the trigger shows the new name at once and the
// document is marked (lib/workspaceSwitching.ts → dimmed content and
// "Switching to …") until the refreshed tree has rendered. AppShell keys the
// shell by workspace id, so that render remounts every client component.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Check, ChevronDown, Loader2, Plus, Settings2 } from "lucide-react";
import { Menu, MenuContent, MenuGroup, MenuItem, MenuSeparator, MenuTrigger, PlatformMark, StatusPill, type Platform } from "@/components/system";
import { fetchWorkspaces, markSwitching, requestSwitch, type WorkspaceRow, type WorkspacesData } from "@/lib/workspaceSwitching";

export type ShellAccount = { platform: Platform; label: string; connected: boolean; href: string };

export default function WorkspaceSwitcher({ initial, accounts }: { initial?: { id: string; name: string } | null; accounts: ShellAccount[] }) {
  const router = useRouter();
  const [data, setData] = useState<WorkspacesData | null>(() =>
    initial ? { enabled: true, activeId: initial.id, workspaces: [{ id: initial.id, name: initial.name, isDefault: false, suspended: false, active: true }] } : null,
  );
  const [switching, setSwitching] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const saving = useRef(false);

  useEffect(() => {
    let alive = true;
    fetchWorkspaces().then((j) => {
      if (!alive) return;
      if (j) setData(j);
      else if (!initial) setData({ enabled: false });
    });
    return () => {
      alive = false;
      markSwitching(null);
    };
  }, [initial]);

  // The refresh rendered without remounting us, or never started: clear the state.
  useEffect(() => {
    if (isPending || saving.current) return;
    markSwitching(null);
  }, [isPending]);

  const enabled = Boolean(data?.enabled && data.workspaces?.length);
  const list = enabled ? (data?.workspaces ?? []) : [];
  const active = list.find((w) => w.active) ?? list.find((w) => !w.suspended) ?? list[0];
  const busy = Boolean(switching) || isPending;

  async function switchTo(w: WorkspaceRow) {
    if (w.active || w.suspended || busy) return;
    const previous = data;
    saving.current = true;
    setSwitching(w.id);
    markSwitching(w.name);
    setData((d) => (d ? { ...d, activeId: w.id, workspaces: d.workspaces?.map((x) => ({ ...x, active: x.id === w.id })) } : d));
    const ok = await requestSwitch(w.id);
    if (!ok) {
      setData(previous);
      markSwitching(null);
    } else {
      startTransition(() => router.refresh());
    }
    saving.current = false;
    setSwitching(null);
  }

  const used = typeof data?.used === "number" && typeof data?.limit === "number" ? ` ${data.used} of ${data.limit}` : "";

  return (
    <Menu>
      <MenuTrigger className="s-btn s-btn--secondary s-ws" aria-label="Brand Workspace and connected accounts" aria-busy={busy || undefined}>
        <Briefcase aria-hidden />
        <span className="s-ws-name">{active?.name ?? "Brand Workspace"}</span>
        {busy ? <Loader2 className="s-spin" aria-hidden /> : <ChevronDown aria-hidden />}
      </MenuTrigger>
      <MenuContent align="start" style={{ minWidth: 260 }}>
        {enabled && (
          <>
            <MenuGroup label={`Brand Workspaces${used}`}>
              {list.map((w) => (
                <MenuItem
                  key={w.id}
                  onClick={() => void switchTo(w)}
                  disabled={w.suspended || busy}
                  why={w.suspended ? "Paused" : undefined}
                  end={switching === w.id ? <Loader2 className="s-spin" aria-hidden /> : w.active ? <Check aria-label="Active" /> : w.role && w.role !== "owner" ? (w.role === "admin" ? "Admin" : "Member") : undefined}
                >
                  <Briefcase aria-hidden />
                  <span>{w.name}</span>
                </MenuItem>
              ))}
              <MenuItem href="/settings#workspaces">
                {data?.canCreate ? <Plus aria-hidden /> : <Settings2 aria-hidden />}
                <span>{data?.canCreate ? "New workspace" : "Manage workspaces"}</span>
              </MenuItem>
            </MenuGroup>
            <MenuSeparator />
          </>
        )}
        <MenuGroup label="Connected accounts">
          {accounts.map((a) => (
            <MenuItem key={a.platform} href={a.href} end={a.connected ? <StatusPill tone="positive" dot>Connected</StatusPill> : <span className="s-link">Connect</span>}>
              <PlatformMark platform={a.platform} brand={a.connected} />
              <span>{a.label}</span>
            </MenuItem>
          ))}
        </MenuGroup>
      </MenuContent>
    </Menu>
  );
}
