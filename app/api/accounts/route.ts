import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { activeByPlatform, getEntitlements, getLimit, listConnectedAccountsDetailed } from "@/lib/entitlements";
import { limitError } from "@/lib/planErrors";
import { deny } from "@/lib/planGuard";
import { PLANS, nextPlan } from "@/lib/plans";
import { resolveContext, can, forbiddenCopy, type Ctx } from "@/lib/context";

export const runtime = "nodejs";

// The account switcher's backend: list the connected Instagram accounts of the
// ACTIVE Brand Workspace's owner, and switch which one is active. Every page
// reads through the active account, so a switch changes the whole app on the
// next render.
//
// The rows are the workspace owner's (lib/context), and once the workspaces
// migration has run they are narrowed to the active workspace. Any role may
// list them; switching is a connect-level action (owner and admins).
//
// A row paused by a plan downgrade (plan_suspended_at set) is listed so the
// person can see it, but it cannot become the active account: the app would
// then read through an account the plan does not include. Un-pausing happens
// through the "choose what to keep" flow or a reconnect within the limit.

type IgRow = {
  ig_user_id: string | null;
  username: string | null;
  is_active?: boolean | null;
  plan_suspended_at?: string | null;
  profile?: { profile_picture_url?: string } | null;
};

/** Progressively narrower selects so a pre-migration schema still answers.
 *  With an active workspace the rows are first narrowed to it; a schema
 *  without workspace_id makes that select fail and the unfiltered shapes run. */
async function readRows(client: Ctx["client"], ownerId: string, workspaceId: string | null): Promise<IgRow[]> {
  const cols = [
    "ig_user_id, username, is_active, plan_suspended_at, profile",
    "ig_user_id, username, is_active, profile",
  ];
  const shapes: { cols: string; ws: boolean }[] = [
    ...(workspaceId ? cols.map((c) => ({ cols: c, ws: true })) : []),
    ...cols.map((c) => ({ cols: c, ws: false })),
  ];
  for (const s of shapes) {
    try {
      let q = client.from("instagram_connections").select(s.cols).eq("user_id", ownerId);
      if (s.ws && workspaceId) q = q.eq("workspace_id", workspaceId);
      const { data, error } = await q.order("connected_at", { ascending: true });
      if (!error) return (data ?? []) as unknown as IgRow[];
    } catch {
      /* try the next shape */
    }
  }
  // Oldest schema: no is_active (and no workspace_id) column, at most one row.
  const { data } = await client
    .from("instagram_connections")
    .select("ig_user_id, username, profile")
    .eq("user_id", ownerId)
    .limit(1);
  return ((data ?? []) as unknown as IgRow[]).map((r) => ({ ...r, is_active: true }));
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);

  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  const rows = await readRows(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null);

  const next = nextPlan(ent.plan);
  return NextResponse.json({
    plan: ent.plan,
    planName: ent.config.name,
    nextPlanName: next ? PLANS[next].name : null,
    // One Instagram account per Brand Workspace, so the switcher's cap is the workspaces limit.
    limit: getLimit(ent, "workspaces"),
    accounts: rows.map((r) => ({
      ig_user_id: r.ig_user_id,
      username: r.username,
      is_active: r.is_active ?? true,
      suspended: r.plan_suspended_at != null,
      avatar: r.profile?.profile_picture_url ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "connect")) return NextResponse.json({ error: forbiddenCopy("connect") }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { ig_user_id?: string } | null;
  const igId = body?.ig_user_id;
  if (!igId) return NextResponse.json({ error: "ig_user_id required." }, { status: 400 });

  // Only the workspace owner's rows are reachable (RLS enforces this for the owner's own session).
  let target: { ig_user_id: string; plan_suspended_at?: string | null }[] | null = null;
  try {
    const { data, error } = await ctx.client
      .from("instagram_connections")
      .select("ig_user_id, plan_suspended_at")
      .eq("user_id", ctx.ownerId)
      .eq("ig_user_id", igId)
      .limit(1);
    if (!error) target = data ?? [];
  } catch {
    /* column may not exist yet */
  }
  if (!target) {
    const { data } = await ctx.client
      .from("instagram_connections")
      .select("ig_user_id")
      .eq("user_id", ctx.ownerId)
      .eq("ig_user_id", igId)
      .limit(1);
    target = (data ?? []) as { ig_user_id: string }[];
  }
  if (!target.length) return NextResponse.json({ error: "No such account." }, { status: 404 });

  // A paused row stays paused: it must not become the account the app reads through.
  if (target[0].plan_suspended_at != null) {
    const ent = await getEntitlements(ctx.client, ctx.ownerId);
    const detailed = await listConnectedAccountsDetailed(ctx.client, ctx.ownerId);
    const activeIg = detailed.complete ? activeByPlatform(detailed.accounts).instagram : null;
    return deny(limitError(ent.plan, "workspaces", getLimit(ent, "workspaces"), activeIg));
  }

  // Deactivate first: a partial unique index allows one active row per user.
  const off = await ctx.client
    .from("instagram_connections")
    .update({ is_active: false })
    .eq("user_id", ctx.ownerId);
  if (off.error) return NextResponse.json({ error: off.error.message }, { status: 500 });
  const on = await ctx.client
    .from("instagram_connections")
    .update({ is_active: true })
    .eq("user_id", ctx.ownerId)
    .eq("ig_user_id", igId);
  if (on.error) return NextResponse.json({ error: on.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, active: igId });
}
