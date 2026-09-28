// Team members: other SOCIA users invited into a Brand Workspace as Admin or
// Member. The plan's team_members limit is the OWNER's, counted across all of
// the owner's workspaces (owner included) and enforced atomically at accept
// time by socia_accept_invite(). Invites are links; there is no email provider.
//
// Everything is defensive about the migration (supabase/team.sql): when the
// tables do not exist, reads return empty and writes fail with a clear reason.
//
// Server only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./supabase/service";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type MemberRole = "admin" | "member";
export type WorkspaceRole = "owner" | MemberRole;

export type Member = {
  userId: string;
  role: WorkspaceRole;
  /** Captured at accept time; null for rows from before that column, or for the owner (their own profile is shown separately). */
  email: string | null;
  createdAt: string | null;
};

export type Invite = {
  id: string;
  role: MemberRole;
  token: string;
  email: string | null;
  expiresAt: string;
  createdAt: string;
};

let enabledSince: number | null = null;

/** Whether supabase/team.sql has run. Sticky once seen; a failed probe is re-tried. */
export async function teamEnabled(supabase: Supa): Promise<boolean> {
  if (enabledSince != null) return true;
  try {
    const { error } = await supabase.from("workspace_members").select("workspace_id", { head: true, count: "exact" }).limit(0);
    if (error) return false;
    enabledSince = Date.now();
    return true;
  } catch {
    return false;
  }
}

/** The workspace's members (not the owner), as the RLS lets this session see them. */
export async function listMembers(supabase: Supa, workspaceId: string): Promise<Member[]> {
  if (!(await teamEnabled(supabase))) return [];
  const { data, error } = await supabase
    .from("workspace_members")
    .select("user_id, role, email, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return ((data ?? []) as { user_id: string; role: MemberRole; email: string | null; created_at: string }[]).map((r) => ({
    userId: r.user_id, role: r.role, email: r.email ?? null, createdAt: r.created_at ?? null,
  }));
}

/** Pending invites (not accepted, not revoked, not expired) for a workspace. Owner/admin only, by RLS. */
export async function listInvites(supabase: Supa, workspaceId: string): Promise<Invite[]> {
  if (!(await teamEnabled(supabase))) return [];
  const { data, error } = await supabase
    .from("workspace_invites")
    .select("id, role, token, email, expires_at, created_at")
    .eq("workspace_id", workspaceId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) return [];
  return ((data ?? []) as { id: string; role: MemberRole; token: string; email: string | null; expires_at: string; created_at: string }[]).map((r) => ({
    id: r.id, role: r.role, token: r.token, email: r.email ?? null, expiresAt: r.expires_at, createdAt: r.created_at,
  }));
}

/**
 * Seats in use for an owner: 1 (the owner) + distinct members across the
 * owner's workspaces. Computed from rows the owner can read. null when the
 * table could not be read (unknown is never zero).
 */
export async function seatsUsed(supabase: Supa, ownedWorkspaceIds: string[], ownerId: string): Promise<number | null> {
  if (!(await teamEnabled(supabase))) return 1;
  if (!ownedWorkspaceIds.length) return 1;
  const { data, error } = await supabase.from("workspace_members").select("user_id").in("workspace_id", ownedWorkspaceIds);
  if (error) return null;
  const ids = new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id).filter((id) => id !== ownerId));
  return 1 + ids.size;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Create an invite link for a workspace (RLS: owner or admin). Valid 7 days. */
export async function createInvite(
  supabase: Supa,
  workspaceId: string,
  role: MemberRole,
  createdBy: string,
  email?: string | null,
): Promise<{ ok: true; invite: Invite } | { ok: false; error: string }> {
  if (!(await teamEnabled(supabase))) return { ok: false, error: "SOCIA's database needs the team migration before invites can be created." };
  const token = randomToken();
  const { data, error } = await supabase
    .from("workspace_invites")
    .insert({ workspace_id: workspaceId, role, token, email: email?.trim() || null, created_by: createdBy })
    .select("id, role, token, email, expires_at, created_at")
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't create the invite." };
  const r = data as { id: string; role: MemberRole; token: string; email: string | null; expires_at: string; created_at: string };
  return { ok: true, invite: { id: r.id, role: r.role, token: r.token, email: r.email ?? null, expiresAt: r.expires_at, createdAt: r.created_at } };
}

export async function revokeInvite(supabase: Supa, workspaceId: string, inviteId: string): Promise<boolean> {
  const { error } = await supabase
    .from("workspace_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", inviteId);
  return !error;
}

export type AcceptFailure = "invite_invalid" | "invite_revoked" | "invite_used" | "invite_expired" | "invite_owner" | "seat_limit" | "not_configured" | "error";

/** Look up an invite by token through the service role (for the accept page). */
export async function inviteByToken(token: string): Promise<{
  workspaceId: string; workspaceName: string; ownerId: string; role: MemberRole;
  status: "open" | "revoked" | "used" | "expired";
} | null> {
  const svc = createServiceClient();
  if (!svc) return null;
  const { data, error } = await svc
    .from("workspace_invites")
    .select("workspace_id, role, expires_at, accepted_at, revoked_at, workspaces(name, owner_id)")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as unknown as {
    workspace_id: string; role: MemberRole; expires_at: string; accepted_at: string | null; revoked_at: string | null;
    workspaces: { name: string; owner_id: string } | { name: string; owner_id: string }[] | null;
  };
  const w = Array.isArray(r.workspaces) ? r.workspaces[0] : r.workspaces;
  if (!w) return null;
  const status = r.revoked_at ? "revoked" : r.accepted_at ? "used" : new Date(r.expires_at).getTime() < Date.now() ? "expired" : "open";
  return { workspaceId: r.workspace_id, workspaceName: w.name, ownerId: w.owner_id, role: r.role, status };
}

/** Accept an invite as `userId`, within the owner's seat limit. Atomic in the database. */
export async function acceptInvite(
  token: string,
  userId: string,
  limit: number,
): Promise<{ ok: true; workspaceId: string; role: MemberRole } | { ok: false; reason: AcceptFailure; error: string }> {
  const svc = createServiceClient();
  if (!svc) return { ok: false, reason: "not_configured", error: "SOCIA is not configured to accept invites on this server." };
  const { data, error } = await svc.rpc("socia_accept_invite", { p_token: token, p_user: userId, p_limit: limit });
  if (error) {
    const msg = error.message ?? "";
    const known: AcceptFailure[] = ["invite_invalid", "invite_revoked", "invite_used", "invite_expired", "invite_owner", "seat_limit"];
    const reason = known.find((k) => msg.includes(k)) ?? "error";
    return { ok: false, reason, error: msg };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { workspace_id: string; role: MemberRole } | null;
  if (!row) return { ok: false, reason: "error", error: "The invite could not be accepted." };
  return { ok: true, workspaceId: row.workspace_id, role: row.role };
}

/** Remove a member. Uses the caller's session (owner, or the person themselves) unless `viaService` (an admin removing a member). */
export async function removeMember(supabase: Supa, workspaceId: string, userId: string, viaService = false): Promise<boolean> {
  const client = viaService ? createServiceClient() ?? supabase : supabase;
  const { error } = await client.from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", userId);
  return !error;
}

/** Change a member's role. Owner only (RLS). */
export async function setMemberRole(supabase: Supa, workspaceId: string, userId: string, role: MemberRole): Promise<boolean> {
  const { error } = await supabase.from("workspace_members").update({ role }).eq("workspace_id", workspaceId).eq("user_id", userId);
  return !error;
}

/** Copy for an accept failure. */
export const ACCEPT_FAILURE_COPY: Record<AcceptFailure, string> = {
  invite_invalid: "This invite link is not valid.",
  invite_revoked: "This invite was cancelled by the workspace owner.",
  invite_used: "This invite has already been used.",
  invite_expired: "This invite has expired. Ask for a new link.",
  invite_owner: "You own this workspace, so you are already in it.",
  seat_limit: "This workspace's plan has no team seats left. The owner can upgrade for more.",
  not_configured: "SOCIA is not configured to accept invites on this server.",
  error: "The invite could not be accepted. Please try again.",
};
