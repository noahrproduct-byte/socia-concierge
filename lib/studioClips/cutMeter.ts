// When SOCIA's cut counts as one AI-made video (meter video_builds): the first
// time it is handed over, that is, opened in the video builder, edited,
// regenerated or exported. Once counted, the same cut never counts again.
//
// Counting at export alone let a cut be opened, copied into the person's own
// edit (which counts nothing) and exported from there. The cut itself now
// reaches the browser only through the routes that call handOverCut, and the
// studio_builds table is server only (supabase/studio-cut-meter.sql).
//
// Until that migration has run there is no cut_counted_at column: the cut is
// "untracked" and the export counts it, as before.
//
// Server only.

import type { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUsage } from "@/lib/planGuard";
import { scopeToWorkspace } from "@/lib/workspaces";
import type { UsageSnapshot } from "@/lib/entitlements";
import { isOwnCutIdx } from "./server";

type Supa = SupabaseClient;

const missingColumn = (e: { message?: string; code?: string } | null | undefined) => Boolean(e && (e.code === "42703" || /cut_counted_at|column .* does not exist/i.test(e.message ?? "")));

/** Has this cut been counted? null when the database doesn't track it yet. */
export async function cutCounted(client: Supa, ownerId: string, wsId: string | null, buildId: string): Promise<boolean | null> {
  const { data, error } = await scopeToWorkspace(client.from("studio_builds").select("cut_counted_at").eq("id", buildId).eq("user_id", ownerId), wsId).maybeSingle();
  if (missingColumn(error)) return null;
  if (error) throw error;
  return Boolean((data as { cut_counted_at?: string | null } | null)?.cut_counted_at);
}

export type Handover =
  | { ok: true; usage: UsageSnapshot | null; tracked: boolean }
  | { ok: false; res: NextResponse };

/**
 * Before SOCIA's cut leaves the server: count it once. The person's own edit
 * and single-clip posts never count. Refused when the plan has no Make This
 * Video or no AI-made videos left this month.
 */
export async function handOverCut(client: Supa, ownerId: string, wsId: string | null, build: { id: string; opportunity_idx: number }): Promise<Handover> {
  if (isOwnCutIdx(build.opportunity_idx)) return { ok: true, usage: null, tracked: true };
  const counted = await cutCounted(client, ownerId, wsId, build.id);
  if (counted === null) return { ok: true, usage: null, tracked: false };
  if (counted) return { ok: true, usage: null, tracked: true };
  const u = await requireUsage(client, ownerId, "video_builds", { feature: "auto_build" });
  if (u.denied) return { ok: false, res: u.denied };
  // Only the request that sets the mark keeps its unit: two tabs opening the
  // same cut at once count it once.
  const { data, error } = await scopeToWorkspace(
    client.from("studio_builds").update({ cut_counted_at: new Date().toISOString() }).eq("id", build.id).eq("user_id", ownerId).is("cut_counted_at", null),
    wsId,
  ).select("id");
  if (error || !(data as unknown[] | null)?.length) await u.release();
  if (error) throw error;
  return { ok: true, usage: u.usage, tracked: true };
}
