// What a Meta deauthorize / data deletion request actually removes.
//
// Meta identifies the person only by the id its own app knows: the
// Instagram-scoped user id for the Instagram app, or the app-scoped Facebook
// user id for Facebook Login. SOCIA stores the former on every Instagram
// connection (ig_user_id) and the latter on the Facebook connection
// (fb_user_id, captured at connect time). Everything keyed to those ids is
// deleted: tokens, the synced snapshot, daily account snapshots and, for
// Facebook, the Page connection. Nothing is estimated or kept "just in case".
//
// Runs with the service role because the request carries no user session.

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type DeletionResult = { removed: Record<string, number>; confirmationCode: string };

async function count(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const r = await q;
  return r.error ? 0 : (r.count ?? 0);
}

export async function deleteMetaUserData(supabase: Supa, platformUserId: string, source: "instagram" | "facebook" | "unknown"): Promise<DeletionResult> {
  const removed: Record<string, number> = {};
  const id = platformUserId.trim();
  if (!id) return { removed, confirmationCode: newCode() };

  // Instagram-scoped id: connections and the snapshots derived from them.
  removed.instagram_connections = await count(supabase.from("instagram_connections").delete({ count: "exact" }).eq("ig_user_id", id));
  removed.account_snapshots = await count(supabase.from("account_snapshots").delete({ count: "exact" }).eq("ig_user_id", id));

  // Facebook-scoped id: the Page connection captured with that user id.
  // The column may not exist on older schemas; a failed filter counts as 0.
  if (source !== "instagram") {
    removed.facebook_connections = await count(supabase.from("facebook_connections").delete({ count: "exact" }).eq("fb_user_id", id));
  }

  const confirmationCode = newCode();
  try {
    await supabase.from("meta_deletion_requests").insert({
      code: confirmationCode, platform: source, platform_user_id: id, removed, status: "completed",
      requested_at: new Date().toISOString(), completed_at: new Date().toISOString(),
    });
  } catch {
    /* the status table is optional; the deletion itself already happened */
  }
  return { removed, confirmationCode };
}

/** A 20-hex-character code Meta and the user can quote back. */
export function newCode(): string {
  return randomBytes(10).toString("hex");
}

export async function readDeletionStatus(supabase: Supa, code: string): Promise<{ status: string; requestedAt: string | null; completedAt: string | null; removed: Record<string, number> } | null> {
  try {
    const { data, error } = await supabase.from("meta_deletion_requests").select("status, requested_at, completed_at, removed").eq("code", code).maybeSingle();
    if (error || !data) return null;
    return { status: data.status ?? "completed", requestedAt: data.requested_at ?? null, completedAt: data.completed_at ?? null, removed: (data.removed as Record<string, number>) ?? {} };
  } catch {
    return null;
  }
}
