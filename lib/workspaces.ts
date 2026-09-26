// Brand Workspaces: one creator, business, location, brand or client. Inside a
// workspace a person connects up to one account on each platform; the plan
// caps how many workspaces they have (lib/plans.ts, limit "workspaces").
//
// This module is the only place the app asks "which workspace am I in?".
// Everything is defensive about the migration (supabase/workspaces.sql): when
// the table does not exist yet, workspacesEnabled() is false and callers keep
// their per-user behaviour, so deploying before the SQL has run changes nothing.
//
// Server only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./supabase/service";
import type { BrandDetail } from "./profile";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type Workspace = {
  id: string;
  ownerId: string;
  name: string;
  isDefault: boolean;
  /** Paused by a plan downgrade: kept, not read. */
  suspended: boolean;
  niche: string | null;
  brand_name: string | null;
  goals: string | null;
  brand_detail: BrandDetail | null;
  niche_detail: Record<string, unknown> | null;
  niche_analyzed_at: string | null;
  createdAt: string;
};

const COLS = "id, owner_id, name, is_default, plan_suspended_at, niche, brand_name, goals, brand_detail, niche_detail, niche_analyzed_at, created_at";

type Row = {
  id: string; owner_id: string; name: string; is_default: boolean | null; plan_suspended_at: string | null;
  niche: string | null; brand_name: string | null; goals: string | null; brand_detail: BrandDetail | null;
  niche_detail: Record<string, unknown> | null; niche_analyzed_at: string | null; created_at: string;
};

const toWorkspace = (r: Row): Workspace => ({
  id: r.id,
  ownerId: r.owner_id,
  name: r.name,
  isDefault: Boolean(r.is_default),
  suspended: r.plan_suspended_at != null,
  niche: r.niche ?? null,
  brand_name: r.brand_name ?? null,
  goals: r.goals ?? null,
  brand_detail: r.brand_detail ?? null,
  niche_detail: r.niche_detail ?? null,
  niche_analyzed_at: r.niche_analyzed_at ?? null,
  createdAt: r.created_at,
});

// Once the table has been seen it stays enabled (a migration is never undone);
// a failed probe is re-tried on the next call rather than cached, so a passing
// database blip can never flip the app back to per-user paths.
let enabledSince: number | null = null;

/** Whether supabase/workspaces.sql has run. */
export async function workspacesEnabled(supabase: Supa): Promise<boolean> {
  if (enabledSince != null) return true;
  try {
    const { error } = await supabase.from("workspaces").select("id", { head: true, count: "exact" }).limit(0);
    if (error) return false;
    enabledSince = Date.now();
    return true;
  } catch {
    return false;
  }
}

/** Every workspace the person owns, oldest first (the default is normally first). */
export async function listWorkspaces(supabase: Supa, userId: string): Promise<Workspace[]> {
  if (!(await workspacesEnabled(supabase))) return [];
  const { data, error } = await supabase.from("workspaces").select(COLS).eq("owner_id", userId).order("created_at", { ascending: true });
  if (error) return [];
  return ((data ?? []) as Row[]).map(toWorkspace);
}

export async function getWorkspace(supabase: Supa, userId: string, workspaceId: string): Promise<Workspace | null> {
  if (!(await workspacesEnabled(supabase))) return null;
  const { data, error } = await supabase.from("workspaces").select(COLS).eq("owner_id", userId).eq("id", workspaceId).maybeSingle();
  if (error || !data) return null;
  return toWorkspace(data as Row);
}

/**
 * The workspace the app currently reads through: profiles.active_workspace_id,
 * else the default, else the oldest. Never a paused one. null when workspaces
 * are not enabled yet, or the person has none (a brand-new account before its
 * first workspace is created by ensureDefaultWorkspace()).
 */
export async function getActiveWorkspace(supabase: Supa, userId: string): Promise<Workspace | null> {
  if (!(await workspacesEnabled(supabase))) return null;
  let activeId: string | null = null;
  try {
    const { data } = await supabase.from("profiles").select("active_workspace_id").eq("user_id", userId).maybeSingle();
    activeId = (data?.active_workspace_id as string | null) ?? null;
  } catch {
    /* column may be missing mid-migration */
  }
  const all = await listWorkspaces(supabase, userId);
  const live = all.filter((w) => !w.suspended);
  return live.find((w) => w.id === activeId) ?? live.find((w) => w.isDefault) ?? live[0] ?? null;
}

/**
 * Make sure the person has a default workspace (created on first use, seeded
 * from the profile's brand fields), and return the active one. Creation uses
 * the owner's own session: the insert policy allows it, and a first workspace
 * never needs a plan check (every plan includes at least one).
 */
export async function ensureDefaultWorkspace(
  supabase: Supa,
  userId: string,
  seed?: { name?: string | null; niche?: string | null; goals?: string | null },
): Promise<Workspace | null> {
  if (!(await workspacesEnabled(supabase))) return null;
  const existing = await getActiveWorkspace(supabase, userId);
  if (existing) return existing;
  const name = seed?.name?.trim() || "My brand";
  const { data, error } = await supabase
    .from("workspaces")
    .insert({ owner_id: userId, name, is_default: true, brand_name: seed?.name ?? null, niche: seed?.niche ?? null, goals: seed?.goals ?? null })
    .select(COLS)
    .maybeSingle();
  if (error || !data) return getActiveWorkspace(supabase, userId);
  const ws = toWorkspace(data as Row);
  await supabase.from("profiles").update({ active_workspace_id: ws.id }).eq("user_id", userId).then(() => undefined, () => undefined);
  return ws;
}

/**
 * The active workspace's id, or null (workspaces not enabled, or none yet).
 * The seam the connection readers use to scope Facebook/YouTube/TikTok rows to
 * the current workspace without changing their public signatures.
 */
export async function activeWorkspaceId(supabase: Supa, userId: string): Promise<string | null> {
  const ws = await getActiveWorkspace(supabase, userId);
  return ws?.id ?? null;
}

/** Switch which workspace the app reads through. Atomic in the database (also re-points Instagram's is_active). */
export async function setActiveWorkspace(supabase: Supa, workspaceId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("socia_set_active_workspace", { p_workspace: workspaceId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Create a workspace within the plan's limit, atomically (service role). The
 * caller resolves the limit from entitlements; this only carries it through.
 */
export async function createWorkspace(
  userId: string,
  name: string,
  limit: number,
): Promise<{ ok: true; id: string } | { ok: false; reason: "limit" | "not_configured" | "error"; error: string }> {
  const svc = createServiceClient();
  if (!svc) return { ok: false, reason: "not_configured", error: "SOCIA is not configured to create workspaces on this server." };
  const { data, error } = await svc.rpc("socia_create_workspace", { p_user: userId, p_name: name, p_limit: limit });
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "22023") return { ok: false, reason: "limit", error: "Your plan's workspace limit is reached." };
    return { ok: false, reason: "error", error: error.message };
  }
  return { ok: true, id: String(data) };
}

export type WorkspacePatch = Partial<Pick<Workspace, "name" | "niche" | "brand_name" | "goals" | "brand_detail" | "niche_detail" | "niche_analyzed_at">>;

/** Rename or edit the brand profile of one of the person's workspaces. */
export async function updateWorkspace(supabase: Supa, userId: string, workspaceId: string, patch: WorkspacePatch): Promise<boolean> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name?.trim() || "My brand";
  for (const k of ["niche", "brand_name", "goals", "brand_detail", "niche_detail", "niche_analyzed_at"] as const) {
    if (patch[k] !== undefined) row[k] = patch[k];
  }
  const { error } = await supabase.from("workspaces").update(row).eq("owner_id", userId).eq("id", workspaceId);
  return !error;
}

/**
 * Delete a workspace and, by cascade, the accounts connected inside it. This
 * is the person's explicit choice (never a side effect of a plan change). The
 * default workspace cannot be deleted while others exist; if the deleted one
 * was active, the default becomes active.
 */
export async function deleteWorkspace(supabase: Supa, userId: string, workspaceId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const all = await listWorkspaces(supabase, userId);
  const target = all.find((w) => w.id === workspaceId);
  if (!target) return { ok: false, error: "That workspace does not exist." };
  if (target.isDefault && all.length > 1) return { ok: false, error: "Delete the other workspaces first, or make another one the default." };
  const fallback = all.find((w) => w.id !== workspaceId && !w.suspended);
  if (fallback) {
    const active = await getActiveWorkspace(supabase, userId);
    if (active?.id === workspaceId) await setActiveWorkspace(supabase, fallback.id);
  }
  const { error } = await supabase.from("workspaces").delete().eq("owner_id", userId).eq("id", workspaceId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Active (not paused) workspaces, for the plan meter. */
export const activeWorkspaces = (list: Workspace[]): Workspace[] => list.filter((w) => !w.suspended);
