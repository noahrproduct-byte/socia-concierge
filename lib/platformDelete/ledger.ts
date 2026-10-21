// The deletion ledger (supabase/platform-deletions.sql): one row per post SOCIA
// deleted from a platform. Light on purpose so any reader can label or skip a
// deleted post without loading the deletion service. Server only.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Platform } from "../publishing/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

// ---------------------------------------------------------------------------

/** false before supabase/platform-deletions.sql has run (or when the table cannot be read). */
export async function ledgerAvailable(client: Supa): Promise<boolean> {
  try {
    const { error } = await client.from("platform_deletions").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

export async function ledgerRow(client: Supa, ownerId: string, platform: Platform, externalId: string): Promise<{ deleted_at: string } | null> {
  try {
    const { data, error } = await client
      .from("platform_deletions")
      .select("deleted_at")
      .eq("user_id", ownerId)
      .eq("platform", platform)
      .eq("external_id", externalId)
      .limit(1);
    if (error) return null;
    return ((data as { deleted_at: string }[] | null) ?? [])[0] ?? null;
  } catch {
    return null;
  }
}

/** external id -> deleted_at for these ids, from the ledger. Empty when the table is missing. */
export async function deletionsByExternalId(client: Supa, ownerId: string, platform: Platform, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  try {
    const { data, error } = await client
      .from("platform_deletions")
      .select("external_id, deleted_at")
      .eq("user_id", ownerId)
      .eq("platform", platform)
      .in("external_id", ids.slice(0, 300));
    if (error || !data) return out;
    for (const r of data as { external_id: string; deleted_at: string }[]) out.set(r.external_id, r.deleted_at);
  } catch {
    // no labels: the posts still render
  }
  return out;
}

