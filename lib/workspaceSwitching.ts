"use client";

// While the app switches Brand Workspace the old content stays on screen
// until the refreshed tree arrives. This marks the document so the shell can
// dim the content and show "Switching to <name>…" (app/styles/shell.css,
// html[data-ws-switching]); the sidebar switcher, the command menu and the
// Settings manager all use it, so the feedback is identical wherever the
// switch starts.
export function markSwitching(name: string | null): void {
  if (typeof document === "undefined") return;
  if (name) document.documentElement.setAttribute("data-ws-switching", name);
  else document.documentElement.removeAttribute("data-ws-switching");
}

/** Make a workspace the active one. Returns false when the server refused. */
export async function requestSwitch(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/workspaces/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type WorkspaceRow = { id: string; name: string; isDefault: boolean; suspended: boolean; active: boolean; role?: "owner" | "admin" | "member" };
export type WorkspacesData = { enabled: boolean; workspaces?: WorkspaceRow[]; activeId?: string | null; canCreate?: boolean; limit?: number; used?: number };

/** The person's workspaces, or null when the endpoint is unavailable. */
export async function fetchWorkspaces(): Promise<WorkspacesData | null> {
  try {
    const r = await fetch("/api/workspaces");
    return r.ok ? ((await r.json()) as WorkspacesData) : null;
  } catch {
    return null;
  }
}
