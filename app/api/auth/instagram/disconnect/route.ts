import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { clearLiveCache } from "@/lib/liveCache";

export const runtime = "nodejs";

// Remove a stored Instagram connection. With no ig_user_id in the body the
// account in the ACTIVE workspace is removed (pre-workspaces: the active
// account). If another account remains, it is promoted to active so the app
// never points nowhere.
//
// The person acts inside their active Brand Workspace, which may belong to
// someone who invited them as an Admin: the row removed is the OWNER's, in
// that workspace, through ctx.client. Disconnecting is owner/admin only.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const ctx = await resolveContext(supabase, user.id);
  // Connections or their data are about to change: drop the reused live
  // platform reads so the next page view asks the platforms again.
  clearLiveCache(ctx.ownerId);
  if (!can(ctx, "connect")) return NextResponse.json({ error: forbiddenCopy("connect") }, { status: 403 });
  const db = ctx.client;
  const ownerId = ctx.ownerId;
  const wsId = ctx.workspace?.id ?? null;

  const body = (await req.json().catch(() => null)) as { ig_user_id?: string } | null;

  // Which account ids are about to go, so their daily snapshots go with them
  // (the Privacy Policy promises exactly that). Read before deleting. The
  // read is scoped to the active workspace when one is known; if that filter
  // fails (column missing) it falls back to the owner's rows as a whole.
  const gone: string[] = [];
  try {
    const read = (withWs: boolean) => {
      let q = db.from("instagram_connections").select("ig_user_id, is_active").eq("user_id", ownerId);
      if (withWs && wsId) q = q.eq("workspace_id", wsId);
      if (body?.ig_user_id) q = q.eq("ig_user_id", body.ig_user_id);
      return q;
    };
    let scoped = Boolean(wsId);
    let { data, error } = await read(true);
    if (error && scoped) {
      scoped = false;
      ({ data, error } = await read(false));
    }
    const rows = (data ?? []) as { ig_user_id: string | null; is_active?: boolean | null }[];
    // A given id, or a workspace's (single) row, names the target exactly;
    // otherwise it is the active row, else every row (single-row world).
    const target = body?.ig_user_id || scoped ? rows : rows.some((r) => r.is_active) ? rows.filter((r) => r.is_active) : rows;
    for (const r of target) if (r.ig_user_id) gone.push(r.ig_user_id);
  } catch {
    /* older schema without is_active: the deletes below still run */
  }
  const dropSnapshots = async () => {
    for (const id of gone) {
      await db.from("account_snapshots").delete().eq("user_id", ownerId).eq("ig_user_id", id).then(() => null, () => null);
    }
  };
  const finish = async () => {
    await dropSnapshots();
    await promoteRemaining(db, ownerId, wsId);
    clearLiveCache(ctx.ownerId);
    return NextResponse.json({ ok: true });
  };

  if (body?.ig_user_id) {
    // A named account, in the active workspace when one is known. A failed
    // workspace filter (column missing) falls back to the owner-wide delete.
    if (wsId) {
      const scopedDel = await db
        .from("instagram_connections")
        .delete()
        .eq("user_id", ownerId)
        .eq("workspace_id", wsId)
        .eq("ig_user_id", body.ig_user_id);
      if (!scopedDel.error) return finish();
    }
    const { error } = await db.from("instagram_connections").delete().eq("user_id", ownerId).eq("ig_user_id", body.ig_user_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return finish();
  }

  // No id: the account in the active workspace. One Instagram row per
  // workspace, so workspace_id alone names it (is_active follows the OWNER's
  // own active workspace, which may differ from the one an invited admin is
  // acting in). A failed filter falls through to the pre-workspaces paths.
  if (wsId) {
    const wsDel = await db.from("instagram_connections").delete().eq("user_id", ownerId).eq("workspace_id", wsId);
    if (!wsDel.error) return finish();
  }
  // Delete only the active row when the column exists; a failed filter
  // falls through to the single-row world below.
  const activeDel = await db
    .from("instagram_connections")
    .delete()
    .eq("user_id", ownerId)
    .eq("is_active", true);
  if (!activeDel.error) return finish();

  const { error } = await db.from("instagram_connections").delete().eq("user_id", ownerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return finish();
}

// If no row is active afterwards, promote one — but only one that belongs to
// the SAME workspace. A workspace whose account was just removed has none
// left, and must read as "not connected"; promoting another workspace's row
// would make this workspace show that workspace's Instagram account (the bug
// where a new workspace kept showing the original account and could not
// disconnect it). Pre-workspaces (no wsId) the owner's rows are one pool.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function promoteRemaining(supabase: any, userId: string, workspaceId: string | null) {
  try {
    let q = supabase
      .from("instagram_connections")
      .select("ig_user_id, is_active")
      .eq("user_id", userId);
    if (workspaceId) q = q.eq("workspace_id", workspaceId);
    const { data, error } = await q;
    if (error) return;
    const rows = (data ?? []) as { ig_user_id: string | null; is_active?: boolean }[];
    if (!rows.length || rows.some((r) => r.is_active)) return;
    const first = rows[0]?.ig_user_id;
    if (first) {
      await supabase
        .from("instagram_connections")
        .update({ is_active: true })
        .eq("user_id", userId)
        .eq("ig_user_id", first);
    }
  } catch {
    // pre-migration: nothing to promote
  }
}
