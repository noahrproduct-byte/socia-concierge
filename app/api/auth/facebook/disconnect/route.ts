import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { clearLiveCache } from "@/lib/liveCache";

export const runtime = "nodejs";

// Removes the stored Facebook connection (tokens included). Touches nothing else.
//
// The person acts inside their active Brand Workspace, which may belong to
// someone who invited them as an Admin: the row removed is the OWNER's, in
// that workspace, through ctx.client. Disconnecting is owner/admin only.
export async function POST() {
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

  // One Page per workspace, so the workspace id names the row. A failed
  // filter (column missing) falls back to the pre-workspaces owner-wide delete.
  if (ctx.workspace) {
    const { error } = await ctx.client
      .from("facebook_connections")
      .delete()
      .eq("user_id", ctx.ownerId)
      .eq("workspace_id", ctx.workspace.id);
    if (!error) {
      clearLiveCache(ctx.ownerId);
      return NextResponse.json({ ok: true });
    }
  }
  await ctx.client.from("facebook_connections").delete().eq("user_id", ctx.ownerId);
  clearLiveCache(ctx.ownerId);
  return NextResponse.json({ ok: true });
}
