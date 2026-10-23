// Page access tokens for a Facebook connect that is waiting for the person to
// choose a Page. They used to sit in facebook_connections.pending_pages, which
// the owner's browser session can read: an Admin connecting Facebook from an
// agency account would have handed the workspace owner a non-expiring token
// for every Page that Admin manages. Now the visible list holds names only,
// and the tokens live in facebook_pending_tokens (RLS on, no policies; server
// role only), kept for an hour. Before supabase/security-hardening.sql has
// run the table is missing and the old storage is used, so connecting keeps
// working during the deploy.
//
// Server only.

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type PendingPage = {
  id: string;
  name?: string;
  username?: string;
  followers_count?: number;
  fan_count?: number;
  picture?: { data?: { url?: string } };
  access_token?: string;
};

const TABLE = "facebook_pending_tokens";
const MAX_AGE_MS = 60 * 60 * 1000;
const wsKey = (workspaceId: string | null | undefined) => workspaceId ?? "none";

/** The list the owner's row may show: everything except the token. */
export const publicPages = (pages: PendingPage[]): PendingPage[] => pages.map(({ access_token: _t, ...rest }) => { void _t; return rest; });

/**
 * Keep the tokens server-side. Returns the pages to store in the visible row:
 * without tokens when the server table took them, with them (legacy) when the
 * table is not there yet.
 */
export async function stashPageTokens(svc: Supa | null, ownerId: string, workspaceId: string | null, pages: PendingPage[]): Promise<PendingPage[]> {
  if (!svc) return pages;
  try {
    const del = await svc.from(TABLE).delete().eq("user_id", ownerId).eq("workspace_key", wsKey(workspaceId));
    if (del.error) throw del.error;
    const rows = pages.filter((p) => p.id && p.access_token).map((p) => ({ user_id: ownerId, workspace_key: wsKey(workspaceId), page_id: p.id, access_token: p.access_token }));
    if (rows.length) {
      const ins = await svc.from(TABLE).insert(rows);
      if (ins.error) throw ins.error;
    }
    return publicPages(pages);
  } catch (e) {
    console.warn("[fb connect] pending tokens table unavailable; using the row:", (e as Error)?.message ?? e);
    return pages;
  }
}

/** The chosen Page's token: from the server table, else (legacy) from the row's list. Consumed once. */
export async function takePageToken(svc: Supa | null, ownerId: string, workspaceId: string | null, pageId: string, legacyPages: PendingPage[]): Promise<string | null> {
  if (svc) {
    try {
      const { data, error } = await svc.from(TABLE).select("access_token, created_at")
        .eq("user_id", ownerId).eq("workspace_key", wsKey(workspaceId)).eq("page_id", pageId).limit(1);
      if (!error) {
        const row = ((data ?? []) as { access_token: string; created_at: string }[])[0];
        await svc.from(TABLE).delete().eq("user_id", ownerId).eq("workspace_key", wsKey(workspaceId));
        if (row && Date.now() - new Date(row.created_at).getTime() <= MAX_AGE_MS) return row.access_token;
        if (row) return null;
      }
    } catch {
      /* table missing: legacy below */
    }
  }
  return legacyPages.find((p) => p.id === pageId)?.access_token ?? null;
}
