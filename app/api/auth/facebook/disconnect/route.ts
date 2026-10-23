import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { clearLiveCache } from "@/lib/liveCache";
import { dropPlatformHistory } from "@/lib/platformSnapshots";
import { isMissingColumnError } from "@/lib/workspaces";

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
  // The Page's daily history goes with it (privacy policy: disconnecting deletes it).
  const pagesOf = async (withWs: boolean) => {
    let q = ctx.client.from("facebook_connections").select("page_id").eq("user_id", ctx.ownerId);
    if (withWs && ctx.workspace) q = q.eq("workspace_id", ctx.workspace.id);
    const { data } = await q;
    return ((data ?? []) as { page_id?: string | null }[]).map((r) => r.page_id);
  };
  if (ctx.workspace) {
    const pages = await pagesOf(true).catch(() => []);
    const { error } = await ctx.client
      .from("facebook_connections")
      .delete()
      .eq("user_id", ctx.ownerId)
      .eq("workspace_id", ctx.workspace.id);
    if (!error) {
      await dropPlatformHistory(ctx.client, ctx.ownerId, "facebook", pages);
      clearLiveCache(ctx.ownerId);
      return NextResponse.json({ ok: true });
    }
    // Only a missing workspace column widens the delete to every brand.
    if (!isMissingColumnError(error)) return NextResponse.json({ error: "Couldn't disconnect right now. Try again." }, { status: 500 });
  }
  const pages = await pagesOf(false).catch(() => []);
  await ctx.client.from("facebook_connections").delete().eq("user_id", ctx.ownerId);
  await dropPlatformHistory(ctx.client, ctx.ownerId, "facebook", pages);
  clearLiveCache(ctx.ownerId);
  return NextResponse.json({ ok: true });
}
