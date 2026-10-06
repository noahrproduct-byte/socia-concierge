// Plan limits for Build from Clips, checked on the server when a clip is
// registered (before any byte is uploaded). Every number comes from
// lib/plans.ts (or an owner's plan_config_overrides) — nothing here is a
// constant of its own except the per-file cap, which mirrors the Supabase
// project's storage setting (STUDIO_MAX_FILE_MB).
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLimit, type Entitlements } from "@/lib/entitlements";
import { limitError, type PlanError } from "@/lib/planErrors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type ProjectTotals = { clips: number; footageSec: number; bytes: number };

export const maxFileBytes = (): number => (Number(process.env.STUDIO_MAX_FILE_MB) || 500) * 1024 * 1024;

export async function projectTotals(client: Supa, projectId: string): Promise<ProjectTotals> {
  const { data, error } = await client.from("studio_clips").select("duration_s, bytes").eq("project_id", projectId).is("purged_at", null);
  if (error) throw error;
  const rows = (data ?? []) as { duration_s: number | null; bytes: number | null }[];
  return {
    clips: rows.length,
    footageSec: rows.reduce((a, r) => a + (r.duration_s ?? 0), 0),
    bytes: rows.reduce((a, r) => a + (r.bytes ?? 0), 0),
  };
}

/** Bytes of raw footage the owner currently holds across all projects (expired footage is gone). */
export async function ownerStorageBytes(client: Supa, ownerId: string): Promise<number> {
  const { data, error } = await client.from("studio_clips").select("bytes").eq("user_id", ownerId).is("purged_at", null).neq("status", "expired");
  if (error) throw error;
  return ((data ?? []) as { bytes: number | null }[]).reduce((a, r) => a + (r.bytes ?? 0), 0);
}

export type FitResult =
  | { ok: true }
  | { ok: false; plan: PlanError }
  | { ok: false; message: string };

/** Would this clip fit in the project under the owner's plan? */
export function checkClipFits(ent: Entitlements, totals: ProjectTotals, ownerBytes: number, clip: { bytes: number; durationSec: number }): FitResult {
  const maxClips = getLimit(ent, "studio_clips_per_project");
  if (totals.clips + 1 > maxClips) return { ok: false, plan: limitError(ent.plan, "studio_clips_per_project", maxClips, totals.clips) };

  const maxMinutes = getLimit(ent, "studio_footage_minutes");
  if ((totals.footageSec + clip.durationSec) / 60 > maxMinutes) {
    return { ok: false, plan: limitError(ent.plan, "studio_footage_minutes", maxMinutes, Math.round(totals.footageSec / 60)) };
  }

  const maxUploadMb = getLimit(ent, "studio_upload_mb");
  if ((totals.bytes + clip.bytes) / 1024 / 1024 > maxUploadMb) {
    return { ok: false, plan: limitError(ent.plan, "studio_upload_mb", maxUploadMb, Math.round(totals.bytes / 1024 / 1024)) };
  }

  const maxGb = getLimit(ent, "studio_storage_gb");
  if ((ownerBytes + clip.bytes) / 1024 / 1024 / 1024 > maxGb) {
    return { ok: false, plan: limitError(ent.plan, "studio_storage_gb", maxGb, Math.round(ownerBytes / 1024 / 1024 / 1024)) };
  }

  if (clip.bytes > maxFileBytes()) {
    const mb = Math.round(maxFileBytes() / 1024 / 1024);
    return { ok: false, message: `This file is ${Math.round(clip.bytes / 1024 / 1024)} MB; single clips are capped at ${mb} MB. Export a smaller version and add it again.` };
  }
  return { ok: true };
}

/** When the raw footage of a clip registered now will expire. */
export function expiryFor(ent: Entitlements, now: Date = new Date()): string {
  const days = Math.max(1, getLimit(ent, "studio_retention_days"));
  return new Date(now.getTime() + days * 86400000).toISOString();
}
