// Who an AI assistant (or, later, an API key) is acting for, and in which
// Brand Workspace. A connection may read only the workspaces the person
// chose on the consent screen AND can still open today (owned, or invited
// and not removed), never a paused one.
//
// The data path is the one SOCIA already uses for team members: the server
// reads the workspace owner's data through the service-role client, and every
// existing data helper is called with (ctx.client, ctx.ownerId) and scopes its
// queries to that owner. No assistant ever holds a database token.
//
// Every call is checked against the owner's plan (ai_assistants), the
// per-minute limit for the connection and the monthly request meter, all
// configured per plan in lib/plans.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ctx } from "../context";
import type { Principal } from "../oauth/server";
import { listAccessibleWorkspaces, type Workspace } from "../workspaces";
import { canUseFeature, consumeUsage, getEntitlements, getLimit, type Entitlements } from "../entitlements";
import { rateHit } from "../oauth/runtime";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type ApiErrorCode = "invalid_input" | "forbidden" | "not_found" | "limited" | "unavailable";

/** A refusal the caller can act on; the message is safe to show the person. */
export class ApiFailure extends Error {
  constructor(public code: ApiErrorCode, message: string) {
    super(message);
  }
}

export type ApiWorkspace = { id: string; name: string; yourRole: "owner" | "admin" | "member"; isDefault: boolean };

const toApiWorkspace = (w: Workspace, userId: string): ApiWorkspace => ({
  id: w.id, name: w.name, yourRole: w.ownerId === userId ? "owner" : w.role === "admin" ? "admin" : "member", isDefault: w.isDefault,
});

/** The workspaces this connection may read right now. */
export async function grantedWorkspaces(svc: Supa, p: Principal): Promise<Workspace[]> {
  const all = await listAccessibleWorkspaces(svc, p.userId);
  const granted = all.filter((w) => p.workspaceIds.includes(w.id) && !w.suspended);
  // Someone else's workspace stays open only while its owner's plan includes a
  // team, exactly as in the app (resolveContext): after a downgrade or a lapsed
  // trial, an invited person's assistant loses it too. Unknown means closed.
  const teamOk = new Map<string, Promise<boolean>>();
  const ownerHasTeam = (ownerId: string) => {
    let v = teamOk.get(ownerId);
    if (!v) {
      v = getEntitlements(svc, ownerId).then((e) => canUseFeature(e, "team"), () => false);
      teamOk.set(ownerId, v);
    }
    return v;
  };
  const keep = await Promise.all(granted.map((w) => (w.ownerId === p.userId ? true : ownerHasTeam(w.ownerId))));
  return granted.filter((_, i) => keep[i]);
}

export async function listGranted(svc: Supa, p: Principal): Promise<ApiWorkspace[]> {
  return (await grantedWorkspaces(svc, p)).map((w) => toApiWorkspace(w, p.userId));
}

/** The request context for one granted workspace (the only one, when no id is given and only one is shared). */
export async function apiContext(svc: Supa, p: Principal, workspaceId?: string | null): Promise<Ctx> {
  const ws = await grantedWorkspaces(svc, p);
  let w: Workspace | undefined;
  if (workspaceId) {
    w = ws.find((x) => x.id === workspaceId);
    if (!w) throw new ApiFailure("forbidden", "That Brand Workspace isn't shared with this app, or you no longer have access to it. Use list_workspaces to see the ones you can use.");
  } else if (ws.length === 1) {
    w = ws[0];
  } else if (!ws.length) {
    throw new ApiFailure("forbidden", "No Brand Workspace is shared with this app any more. Reconnect it in SOCIA to choose one.");
  } else {
    throw new ApiFailure("invalid_input", `Several Brand Workspaces are shared (${ws.map((x) => `"${x.name}"`).join(", ")}). Pass workspace_id; list_workspaces shows the ids.`);
  }
  const isOwner = w.ownerId === p.userId;
  return { viewerId: p.userId, ownerId: w.ownerId, workspace: w, role: isOwner ? "owner" : w.role === "admin" ? "admin" : "member", client: svc, isOwner };
}

export type Guarded = { ent: Entitlements; usage: { used: number | null; limit: number } };

/**
 * One assistant request against the plan of the person whose data it reads
 * (the workspace owner): the feature, then the per-minute limit for this
 * connection, then the monthly meter. Refuses when a limit can't be checked.
 */
export async function guardRequest(svc: Supa, p: Principal, ownerId: string): Promise<Guarded> {
  const ent = await getEntitlements(svc, ownerId);
  if (!canUseFeature(ent, "ai_assistants")) throw new ApiFailure("forbidden", "AI assistant access isn't included in this workspace's SOCIA plan.");
  const perMinute = getLimit(ent, "assistant_requests_per_minute");
  const rate = perMinute > 0 ? await rateHit(`mcp:${p.connectionId}`, 60, perMinute) : "limited";
  if (rate === "unavailable") throw new ApiFailure("unavailable", "SOCIA couldn't check this connection's request limit just now. Try again shortly.");
  if (rate === "limited") throw new ApiFailure("limited", `Too many requests: this connection allows ${perMinute} a minute on the ${ent.plan} plan. Wait a minute and try again.`);
  const r = await consumeUsage(svc, ent, "assistant_requests");
  if (r.unavailable) throw new ApiFailure("unavailable", "SOCIA couldn't check this month's usage just now. Try again shortly.");
  if (!r.allowed) throw new ApiFailure("limited", `This month's AI assistant requests are used up (${r.usage.limit} on the ${ent.plan} plan). They reset at the start of next month.`);
  return { ent, usage: { used: r.usage.used, limit: r.usage.limit } };
}
