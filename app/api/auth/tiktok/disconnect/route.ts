import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeToken, ttAuthConfigured } from "@/lib/tiktokAuth";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";

export const runtime = "nodejs";

// Remove the stored TikTok connection and revoke the grant at TikTok so it
// disappears from the user's "Manage app permissions" list too.
//
// The person acts inside their active Brand Workspace, which may belong to
// someone who invited them as an Admin: the row removed is the OWNER's, in
// that workspace, through ctx.client (the token is read server-side only and
// never returned). Disconnecting is owner/admin only.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "connect")) return NextResponse.json({ error: forbiddenCopy("connect") }, { status: 403 });
  const db = ctx.client;
  const ownerId = ctx.ownerId;
  const wsId = ctx.workspace?.id ?? null;

  // Best effort revoke of this workspace's token (one account per workspace);
  // a failed filter falls back to the owner-wide read.
  try {
    const read = (withWs: boolean) => {
      let q = db.from("tiktok_connections").select("access_token").eq("user_id", ownerId);
      if (withWs && wsId) q = q.eq("workspace_id", wsId);
      return q.maybeSingle();
    };
    let { data, error } = await read(true);
    if (error && wsId) ({ data, error } = await read(false));
    const token = (data as { access_token?: string } | null)?.access_token;
    if (token && ttAuthConfigured()) await revokeToken(token);
  } catch {
    // revoke is best effort
  }

  // Delete this workspace's row; a failed filter (column missing) falls back
  // to the pre-workspaces owner-wide delete.
  let deleted = false;
  if (wsId) {
    const { error } = await db.from("tiktok_connections").delete().eq("user_id", ownerId).eq("workspace_id", wsId);
    deleted = !error;
  }
  if (!deleted) {
    const { error } = await db.from("tiktok_connections").delete().eq("user_id", ownerId);
    if (error) {
      console.error("TikTok disconnect failed:", error.message);
      return NextResponse.json({ error: "Couldn't disconnect right now." }, { status: 500 });
    }
  }

  // Drop TikTok from the OWNER's profile platform list (best effort).
  try {
    const { data: prof } = await db.from("profiles").select("platforms").eq("user_id", ownerId).maybeSingle();
    const platforms = (prof as { platforms?: string[] } | null)?.platforms;
    if (Array.isArray(platforms) && platforms.includes("TikTok")) {
      await db
        .from("profiles")
        .update({ platforms: platforms.filter((p) => p !== "TikTok"), updated_at: new Date().toISOString() })
        .eq("user_id", ownerId);
    }
  } catch {
    // cosmetic
  }

  return NextResponse.json({ ok: true });
}
