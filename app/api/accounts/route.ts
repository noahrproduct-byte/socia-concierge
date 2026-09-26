import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { activeByPlatform, getEntitlements, getLimit, listConnectedAccountsDetailed } from "@/lib/entitlements";
import { limitError } from "@/lib/planErrors";
import { deny } from "@/lib/planGuard";
import { PLANS, nextPlan } from "@/lib/plans";

export const runtime = "nodejs";

// The account switcher's backend: list the user's connected Instagram
// accounts, and switch which one is active. Every page reads through the
// active account, so a switch changes the whole app on the next render.
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

/** Progressively narrower selects so a pre-migration schema still answers. */
async function readRows(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<IgRow[]> {
  const shapes: { cols: string; ordered: boolean }[] = [
    { cols: "ig_user_id, username, is_active, plan_suspended_at, profile", ordered: true },
    { cols: "ig_user_id, username, is_active, profile", ordered: true },
  ];
  for (const s of shapes) {
    try {
      const { data, error } = await supabase
        .from("instagram_connections")
        .select(s.cols)
        .eq("user_id", userId)
        .order("connected_at", { ascending: true });
      if (!error) return (data ?? []) as unknown as IgRow[];
    } catch {
      /* try the next shape */
    }
  }
  // Oldest schema: no is_active column, at most one row.
  const { data } = await supabase
    .from("instagram_connections")
    .select("ig_user_id, username, profile")
    .eq("user_id", userId)
    .limit(1);
  return ((data ?? []) as unknown as IgRow[]).map((r) => ({ ...r, is_active: true }));
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const ent = await getEntitlements(supabase, user.id);
  const rows = await readRows(supabase, user.id);

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

  const body = (await req.json().catch(() => null)) as { ig_user_id?: string } | null;
  const igId = body?.ig_user_id;
  if (!igId) return NextResponse.json({ error: "ig_user_id required." }, { status: 400 });

  // Only rows the user owns are reachable (RLS also enforces this).
  let target: { ig_user_id: string; plan_suspended_at?: string | null }[] | null = null;
  try {
    const { data, error } = await supabase
      .from("instagram_connections")
      .select("ig_user_id, plan_suspended_at")
      .eq("user_id", user.id)
      .eq("ig_user_id", igId)
      .limit(1);
    if (!error) target = data ?? [];
  } catch {
    /* column may not exist yet */
  }
  if (!target) {
    const { data } = await supabase
      .from("instagram_connections")
      .select("ig_user_id")
      .eq("user_id", user.id)
      .eq("ig_user_id", igId)
      .limit(1);
    target = (data ?? []) as { ig_user_id: string }[];
  }
  if (!target.length) return NextResponse.json({ error: "No such account." }, { status: 404 });

  // A paused row stays paused: it must not become the account the app reads through.
  if (target[0].plan_suspended_at != null) {
    const ent = await getEntitlements(supabase, user.id);
    const detailed = await listConnectedAccountsDetailed(supabase, user.id);
    const activeIg = detailed.complete ? activeByPlatform(detailed.accounts).instagram : null;
    return deny(limitError(ent.plan, "workspaces", getLimit(ent, "workspaces"), activeIg));
  }

  // Deactivate first: a partial unique index allows one active row per user.
  const off = await supabase
    .from("instagram_connections")
    .update({ is_active: false })
    .eq("user_id", user.id);
  if (off.error) return NextResponse.json({ error: off.error.message }, { status: 500 });
  const on = await supabase
    .from("instagram_connections")
    .update({ is_active: true })
    .eq("user_id", user.id)
    .eq("ig_user_id", igId);
  if (on.error) return NextResponse.json({ error: on.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, active: igId });
}
