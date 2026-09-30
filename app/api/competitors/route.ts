import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEntitlements, getLimit, countActiveCompetitors, canAddCompetitor } from "@/lib/entitlements";
import { deny, recordEvent } from "@/lib/planGuard";
import { listTracked, trackedState } from "@/lib/trackedCompetitors";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { competitorScopeId, competitorsScopedEnabled, ensureDefaultWorkspace } from "@/lib/workspaces";

export const runtime = "nodejs";

// Tracked-competitor list management. SOCIA stores handles only; it never
// invents metrics for these accounts (platforms expose none to third parties).
//
// The roster cap is the plan's "competitors" limit (lib/plans.ts), enforced
// here. Rows beyond the cap after a downgrade carry is_active = false and are
// excluded from every read; only an explicit removal deletes a row.
//
// Adding goes through socia_add_competitor() with the service role: the
// function checks the cap and inserts under one per-user lock, and the
// browser insert policy is gone post-migration. Without a service key (local
// dev) or before the migration, the legacy check-then-upsert runs instead.
//
// The roster belongs to the ACTIVE Brand Workspace: every read and write is
// scoped to its owner (lib/context). Any role may read it; adding and removing
// is for the owner and admins.

const HANDLE_RE = /^[a-zA-Z0-9._]{1,30}$/;
// YouTube handles/ids allow hyphens and are longer than Instagram's.
const YT_HANDLE_RE = /^[a-zA-Z0-9._-]{1,60}$/;

type Platform = "instagram" | "facebook" | "youtube";
const platformOf = (v: unknown): Platform => (v === "facebook" ? "facebook" : v === "youtube" ? "youtube" : "instagram");

const UNREADABLE_MESSAGE = "SOCIA could not read your competitor list. Try again.";

/** The add function is not installed yet (pre-migration database). */
function isMissingFunction(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  if (!err) return false;
  if (err.code === "42883" || err.code === "PGRST202") return true;
  const m = err.message ?? "";
  return /function .* does not exist/i.test(m) || /could not find .* function/i.test(m) || /schema cache/i.test(m);
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);

  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  const limit = getLimit(ent, "competitors");
  try {
    // The list is this workspace's competitors; `active` is the POOLED usage
    // (the plan limit is shared across brands), so the meter reads correctly.
    const cwid = await competitorScopeId(ctx.client, ctx.workspace?.id);
    const competitors = await listTracked(ctx.client, ctx.ownerId, "platform, handle, added_at", { byAdded: true, workspaceId: cwid });
    const pooled = await countActiveCompetitors(ctx.client, ctx.ownerId);
    return NextResponse.json({ competitors, limit, active: pooled ?? competitors.length });
  } catch {
    // Table may not exist yet. The count is unknown, not zero.
    return NextResponse.json({ competitors: [], limit, active: null });
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { handle?: string; platform?: string } | null;
  const handle = (body?.handle ?? "").trim().replace(/^@/, "");
  const platform = platformOf(body?.platform);
  const valid = platform === "youtube" ? YT_HANDLE_RE.test(handle) : HANDLE_RE.test(handle);
  if (!valid) {
    return NextResponse.json({ error: "That doesn't look like a valid handle." }, { status: 400 });
  }
  const key = handle.toLowerCase();

  // The workspace this competitor is added to, once the competitors migration
  // has run; null keeps the pooled, pre-migration behaviour. When isolation is
  // on but the person has no workspace yet, create their default one.
  const scoped = await competitorsScopedEnabled(ctx.client);
  const wsId = scoped ? (ctx.workspace?.id ?? (await ensureDefaultWorkspace(ctx.client, ctx.ownerId))?.id ?? null) : null;

  // The cap is the workspace owner's plan.
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  const limit = getLimit(ent, "competitors");

  // Unknown is not zero: a list that cannot be read is neither full nor empty.
  const active = await countActiveCompetitors(ctx.client, ctx.ownerId);
  if (active == null) return NextResponse.json({ error: UNREADABLE_MESSAGE }, { status: 503 });

  const limitReached = (count: number) => {
    const c = canAddCompetitor(ent, count);
    // The function refused but the count it reported is under the cap: a race
    // it could not resolve, not a plan decision. Say so plainly.
    if (c.ok) return NextResponse.json({ error: UNREADABLE_MESSAGE }, { status: 503 });
    // Attributed to the person who pressed the button, not the workspace owner.
    recordEvent(supabase, user.id, "competitor_limit_reached", { plan: ent.plan, limit });
    return deny(c.error);
  };

  // ---- Atomic path: cap check and insert in one privileged call -----------
  const svc = createServiceClient();
  if (svc) {
    // Post-migration the workspace-aware overload owns the insert (its onConflict
    // matches the new per-workspace primary key); pre-migration the 4-arg form.
    const { data, error } = await svc.rpc("socia_add_competitor", wsId
      ? { p_user: ctx.ownerId, p_workspace: wsId, p_platform: platform, p_handle: key, p_limit: limit }
      : { p_user: ctx.ownerId, p_platform: platform, p_handle: key, p_limit: limit });
    if (error && !isMissingFunction(error)) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!error) {
      const row = (Array.isArray(data) ? data[0] : data) as { added?: boolean; already?: boolean; active_count?: number } | null;
      if (row?.already || row?.added) return NextResponse.json({ ok: true });
      return limitReached(typeof row?.active_count === "number" ? row.active_count : active);
    }
    // Function missing: the database is pre-migration, so the legacy path is right.
  }

  // ---- Legacy path: no service key, or the migration has not run ----------
  // Idempotent: re-adding a handle that is already counted never hits the cap.
  let state: Awaited<ReturnType<typeof trackedState>> = { exists: false };
  try {
    state = await trackedState(ctx.client, ctx.ownerId, platform, key, wsId);
  } catch {
    /* table may not exist yet; the upsert below reports that */
  }
  if (state.exists && state.active) return NextResponse.json({ ok: true });

  const c = canAddCompetitor(ent, active);
  if (!c.ok) return limitReached(active);

  // The conflict target matches the primary key in force: per-workspace once the
  // migration has run, per-user before it.
  const onConflict = wsId ? "user_id,workspace_id,platform,handle" : "user_id,platform,handle";
  const row: Record<string, unknown> = wsId
    ? { user_id: ctx.ownerId, workspace_id: wsId, platform, handle: key }
    : { user_id: ctx.ownerId, platform, handle: key };
  const { error } = await ctx.client
    .from("tracked_competitors")
    .upsert({ ...row, is_active: true }, { onConflict });
  if (error) {
    // Pre-migration schema: no is_active column, and no inactive rows either.
    const { error: e2 } = await ctx.client.from("tracked_competitors").upsert(row, { onConflict });
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { handle?: string; platform?: string } | null;
  const handle = (body?.handle ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!handle) return NextResponse.json({ error: "handle required." }, { status: 400 });

  // An explicit removal is a hard delete, active or not. Scoped to THIS
  // workspace: without the workspace_id filter a removal would drop the handle
  // from every brand that tracks it.
  const cwid = await competitorScopeId(ctx.client, ctx.workspace?.id);
  let del = ctx.client
    .from("tracked_competitors")
    .delete()
    .eq("user_id", ctx.ownerId)
    .eq("platform", platformOf(body?.platform))
    .eq("handle", handle);
  if (cwid) del = del.eq("workspace_id", cwid);
  const { error } = await del;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
