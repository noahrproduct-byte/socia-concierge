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
  /** The viewer's role in it: "owner" for their own, else what they were invited as. */
  role?: "owner" | "admin" | "member";
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

// Competitors get their own migration (supabase/competitors-workspaces.sql):
// until it runs, competitors stay pooled per user and this stays false, so the
// app can deploy before the SQL without changing anything.
let competitorsScopedSince: number | null = null;

/** Whether the competitors-per-workspace migration has run (tracked_competitors.workspace_id exists). */
export async function competitorsScopedEnabled(supabase: Supa): Promise<boolean> {
  if (competitorsScopedSince != null) return true;
  try {
    const { error } = await supabase.from("tracked_competitors").select("workspace_id", { head: true, count: "exact" }).limit(0);
    if (error) return false;
    competitorsScopedSince = Date.now();
    return true;
  } catch {
    return false;
  }
}

/**
 * The workspace id to scope a competitor read/write to, or null to stay pooled.
 * Null both before the competitors migration (so nothing changes) and when there
 * is no active workspace. This is the single seam every competitor site uses.
 */
export async function competitorScopeId(supabase: Supa, workspaceId: string | null | undefined): Promise<string | null> {
  if (!workspaceId) return null;
  return (await competitorsScopedEnabled(supabase)) ? workspaceId : null;
}

/** Every workspace the person owns, oldest first (the default is normally first). */
export async function listWorkspaces(supabase: Supa, userId: string): Promise<Workspace[]> {
  if (!(await workspacesEnabled(supabase))) return [];
  const { data, error } = await supabase.from("workspaces").select(COLS).eq("owner_id", userId).order("created_at", { ascending: true });
  if (error) return [];
  return ((data ?? []) as Row[]).map((r) => ({ ...toWorkspace(r), role: "owner" as const }));
}

/**
 * Every workspace the person can act in: the ones they own, then the ones
 * they were invited into (with their role). The membership table may not
 * exist yet; then it is just the owned ones.
 */
export async function listAccessibleWorkspaces(supabase: Supa, userId: string): Promise<Workspace[]> {
  // The person's own workspaces and their memberships are independent reads:
  // run them together (this is on the path of every page load).
  type Membership = { workspace_id: string; role: "admin" | "member" };
  const membershipsP: Promise<Membership[]> = (async () => {
    try {
      const { data, error } = await supabase.from("workspace_members").select("workspace_id, role").eq("user_id", userId);
      return error ? [] : ((data ?? []) as Membership[]);
    } catch {
      return []; // pre-migration: no memberships
    }
  })();
  const owned = await listWorkspaces(supabase, userId);
  if (!owned.length && !(await workspacesEnabled(supabase))) return [];
  const memberships = await membershipsP;
  const ids = memberships.map((m) => m.workspace_id).filter((id) => !owned.some((w) => w.id === id));
  if (!ids.length) return owned;
  const { data, error } = await supabase.from("workspaces").select(COLS).in("id", ids).order("created_at", { ascending: true });
  if (error) return owned;
  const roleOf = new Map(memberships.map((m) => [m.workspace_id, m.role]));
  const guest = ((data ?? []) as Row[]).map((r) => ({ ...toWorkspace(r), role: roleOf.get(r.id) ?? ("member" as const) }));
  return [...owned, ...guest];
}

export async function getWorkspace(supabase: Supa, userId: string, workspaceId: string): Promise<Workspace | null> {
  if (!(await workspacesEnabled(supabase))) return null;
  const { data, error } = await supabase.from("workspaces").select(COLS).eq("owner_id", userId).eq("id", workspaceId).maybeSingle();
  if (error || !data) return null;
  return toWorkspace(data as Row);
}

/**
 * The workspace the app currently reads through: profiles.active_workspace_id
 * (which may be a workspace the person was invited into), else their own
 * default, else their oldest. Never a paused one. null when workspaces are not
 * enabled yet, or the person has none (a brand-new account before its first
 * workspace is created by ensureDefaultWorkspace()).
 */
export async function getActiveWorkspace(supabase: Supa, userId: string): Promise<Workspace | null> {
  if (!(await workspacesEnabled(supabase))) return null;
  // Which workspace is selected, and which ones the person can reach, are
  // independent reads: run them together (every page load resolves this).
  const activeIdP: Promise<string | null> = (async () => {
    try {
      const { data } = await supabase.from("profiles").select("active_workspace_id").eq("user_id", userId).maybeSingle();
      return (data?.active_workspace_id as string | null) ?? null;
    } catch {
      return null; // column may be missing mid-migration
    }
  })();
  const [activeId, all] = await Promise.all([activeIdP, listAccessibleWorkspaces(supabase, userId)]);
  const live = all.filter((w) => !w.suspended);
  const own = live.filter((w) => w.role === "owner");
  return live.find((w) => w.id === activeId) ?? own.find((w) => w.isDefault) ?? own[0] ?? live[0] ?? null;
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
 * Create a workspace within the plan's limit. The atomic, plan-aware path is
 * the service-role function; where no service key is configured (local dev, or
 * a self-host without it) it falls back to a count-then-insert through the
 * caller's own session, exactly like the competitor add. The caller resolves
 * the limit from entitlements; this only carries it through.
 */
export async function createWorkspace(
  supabase: Supa,
  userId: string,
  name: string,
  limit: number,
): Promise<{ ok: true; id: string } | { ok: false; reason: "limit" | "error"; error: string }> {
  const svc = createServiceClient();
  if (svc) {
    const { data, error } = await svc.rpc("socia_create_workspace", { p_user: userId, p_name: name, p_limit: limit });
    if (error) {
      const code = (error as { code?: string }).code;
      if (code === "22023") return { ok: false, reason: "limit", error: "Your plan's workspace limit is reached." };
      return { ok: false, reason: "error", error: error.message };
    }
    return { ok: true, id: String(data) };
  }

  // Fallback: no service client. Count then insert through the owner's session
  // (the RLS insert policy is owner-scoped). Not atomic, but a single user
  // creating their own workspaces does not race meaningfully.
  const { data: existing, error: readErr } = await supabase
    .from("workspaces").select("id, plan_suspended_at").eq("owner_id", userId);
  if (readErr) return { ok: false, reason: "error", error: readErr.message };
  const rows = (existing ?? []) as { id: string; plan_suspended_at: string | null }[];
  if (rows.filter((r) => r.plan_suspended_at == null).length >= limit) {
    return { ok: false, reason: "limit", error: "Your plan's workspace limit is reached." };
  }
  const isFirst = rows.length === 0;
  const { data, error } = await supabase
    .from("workspaces").insert({ owner_id: userId, name: name.trim() || "My brand", is_default: isFirst })
    .select("id").maybeSingle();
  if (error || !data) return { ok: false, reason: "error", error: error?.message ?? "Could not create the workspace." };
  const id = String((data as { id: string }).id);
  if (isFirst) await supabase.from("profiles").update({ active_workspace_id: id }).eq("user_id", userId).then(() => undefined, () => undefined);
  return { ok: true, id };
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

/**
 * Scope a Supabase query to a workspace's rows when one is active. A no-op
 * before the migration (workspaceId null/undefined) so callers keep their
 * per-user behaviour and never hide rows that predate the backfill. Use for
 * tables that carry a workspace_id column (scheduled_posts, plans,
 * post_destinations): `scopeToWorkspace(q.eq("user_id", ownerId), ctx.workspace?.id)`.
 */
export function scopeToWorkspace<T>(query: T, workspaceId: string | null | undefined): T {
  // The Supabase filter builder returns itself from .eq; typed generically so
  // any query builder passes through unchanged when there is no workspace.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return workspaceId ? ((query as any).eq("workspace_id", workspaceId) as T) : query;
}

/**
 * A Postgres "column does not exist" error — e.g. workspace_id before its
 * migration has run. Callers use it to fall back to the pre-migration path only
 * for that specific cause, not on a transient error (which must not widen scope
 * or retry a write).
 */
export function isMissingColumnError(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return false;
  if (err.code === "42703") return true;
  return /column .* does not exist/i.test(err.message ?? "");
}
