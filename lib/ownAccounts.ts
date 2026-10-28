// The accounts a user owns, so SOCIA never offers, picks or tracks the user's
// own account as a competitor. A single exact-handle check used to be the
// only guard, and only during a fresh discovery run, so the user's own
// Instagram could come back from stored discovery, from YouTube, from a
// Facebook-linked Instagram or from a manual add, and then be shown as their
// one competitor.
//
// Every connected identity of the account owner counts, across all of their
// Brand Workspaces: Instagram (username, ig_user_id), the Instagram account
// linked to a Facebook Page (ig_business_username, ig_business_id), the Page
// itself (page_id, page name) and YouTube (channel_id, handle, title).
// Handles match exactly or loosely (case, "@", dots, dashes and underscores
// ignored), so "joes.pizza" and "joespizza" are the same account.

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type OwnAccounts = {
  /** Loose handle and name keys: lowercase letters and digits only. */
  keys: Set<string>;
  /** Platform ids: Instagram user ids, Page ids, YouTube channel ids. */
  ids: Set<string>;
  /** Readable handles, for telling the discovery model what to leave out. */
  handles: string[];
};

/** Lowercase letters and digits only: "@Joes.Pizza_NYC" and "joespizzanyc" match. */
export const looseKey = (s: string | null | undefined): string =>
  (s ?? "").toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");

const EMPTY: OwnAccounts = { keys: new Set(), ids: new Set(), handles: [] };

async function rows(client: Supa, table: string, userId: string): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await client.from(table).select("*").eq("user_id", userId).limit(50);
    return error ? [] : ((data ?? []) as Record<string, unknown>[]);
  } catch {
    return []; // table absent in this environment
  }
}

/** Every account the owner has connected, on any platform and in any workspace. */
export async function ownAccounts(client: Supa, ownerId: string): Promise<OwnAccounts> {
  if (!ownerId) return EMPTY;
  const [ig, fb, yt] = await Promise.all([
    rows(client, "instagram_connections", ownerId),
    rows(client, "facebook_connections", ownerId),
    rows(client, "youtube_connections", ownerId),
  ]);
  const keys = new Set<string>();
  const ids = new Set<string>();
  const handles = new Set<string>();
  const addHandle = (v: unknown) => {
    if (typeof v !== "string" || !v.trim()) return;
    const h = v.trim().replace(/^@/, "");
    handles.add(h);
    const k = looseKey(h);
    if (k.length >= 3) keys.add(k);
  };
  const addName = (v: unknown) => {
    // Display names only count when they are distinctive enough to be safe.
    const k = looseKey(typeof v === "string" ? v : null);
    if (k.length >= 6) keys.add(k);
  };
  const addId = (v: unknown) => {
    if (typeof v === "string" && v.trim()) ids.add(v.trim());
    else if (typeof v === "number") ids.add(String(v));
  };

  for (const r of ig) {
    addHandle(r.username);
    addId(r.ig_user_id);
  }
  for (const r of fb) {
    addHandle(r.ig_business_username);
    addId(r.ig_business_id);
    addId(r.page_id);
    addName(r.page_name);
  }
  for (const r of yt) {
    addHandle(r.handle);
    addId(r.channel_id);
    addName(r.title);
  }
  return { keys, ids, handles: [...handles] };
}

/** True when the account is one of the user's own, by id, handle or a distinctive name. */
export function isOwnAccount(
  own: OwnAccounts,
  a: { handle?: string | null; id?: string | null; name?: string | null },
): boolean {
  if (a.id && own.ids.has(String(a.id))) return true;
  const hk = looseKey(a.handle);
  if (hk && own.keys.has(hk)) return true;
  const nk = looseKey(a.name);
  return nk.length >= 6 && own.keys.has(nk);
}
