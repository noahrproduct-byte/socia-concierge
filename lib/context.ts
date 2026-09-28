// Request context: who is looking, and whose workspace they are looking at.
//
// A person always acts inside their ACTIVE Brand Workspace. When that
// workspace is their own, everything reads and writes as before through
// their session. When it belongs to someone else (they were invited as an
// Admin or Member), the server acts AS THE OWNER through the service-role
// client: every data helper is called with (ctx.client, ctx.ownerId), and
// because those helpers already scope every query to the user id they are
// given, a member sees exactly the owner's workspace and nothing else. No RLS
// policy on any data table is widened, and tokens never reach a member's
// browser because the same server code paths run.
//
// Roles:
//   owner   everything
//   admin   everything in the workspace except plan/billing, deleting the
//           workspace, and changing roles or removing admins
//   member  view everything, use AI (charged to the owner), create drafts;
//           cannot publish, connect/disconnect accounts, or manage members
//
// Server only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./supabase/service";
import { getActiveWorkspace, type Workspace } from "./workspaces";
import type { WorkspaceRole } from "./team";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type Ctx = {
  /** The signed-in person. */
  viewerId: string;
  /** Whose data the app reads: the workspace owner (the viewer, unless they are a guest). */
  ownerId: string;
  workspace: Workspace | null;
  role: WorkspaceRole;
  /** The client every data helper should be called with. */
  client: Supa;
  isOwner: boolean;
};

export async function resolveContext(supabase: Supa, viewerId: string): Promise<Ctx> {
  const ws = await getActiveWorkspace(supabase, viewerId);
  const asSelf = (workspace: Workspace | null): Ctx => ({ viewerId, ownerId: viewerId, workspace, role: "owner", client: supabase, isOwner: true });
  if (!ws) return asSelf(null);
  if (ws.ownerId === viewerId) return asSelf(ws);
  // A guest in someone else's workspace. Without a service client the server
  // cannot read the owner's data, so the person falls back to their own.
  const svc = createServiceClient();
  if (!svc) return asSelf(null);
  return { viewerId, ownerId: ws.ownerId, workspace: ws, role: ws.role === "admin" ? "admin" : "member", client: svc, isOwner: false };
}

export type Action =
  | "publish"          // schedule / publish content
  | "connect"          // connect or disconnect a social account
  | "invite"           // create invite links, revoke invites
  | "remove_member"    // remove a Member (admins can); removing an Admin is owner-only
  | "change_role"      // owner only
  | "billing"          // plan & billing
  | "delete_workspace" // owner only
  | "manage_workspace";// rename, brand profile

const ROLE_ACTIONS: Record<WorkspaceRole, Set<Action>> = {
  owner: new Set(["publish", "connect", "invite", "remove_member", "change_role", "billing", "delete_workspace", "manage_workspace"]),
  admin: new Set(["publish", "connect", "invite", "remove_member", "manage_workspace"]),
  member: new Set([]),
};

export function can(ctx: Pick<Ctx, "role">, action: Action): boolean {
  return ROLE_ACTIONS[ctx.role].has(action);
}

/** Plain sentence for a refused action, for a 403 body. */
export function forbiddenCopy(action: Action): string {
  switch (action) {
    case "publish": return "Only the workspace owner or an admin can publish.";
    case "connect": return "Only the workspace owner or an admin can connect or disconnect accounts.";
    case "invite": return "Only the workspace owner or an admin can invite people.";
    case "remove_member": return "Only the workspace owner or an admin can remove members.";
    case "change_role": return "Only the workspace owner can change roles.";
    case "billing": return "Only the workspace owner can change the plan.";
    case "delete_workspace": return "Only the workspace owner can delete a workspace.";
    case "manage_workspace": return "Only the workspace owner or an admin can change workspace settings.";
  }
}
