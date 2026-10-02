import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { clearLiveCache } from "@/lib/liveCache";

export const runtime = "nodejs";

// Remove the stored YouTube connection and revoke the grant at Google so it
// disappears from the user's Google account too.
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
  // Connections or their data are about to change: drop the reused live
  // platform reads so the next page view asks the platforms again.
  clearLiveCache(ctx.ownerId);
  if (!can(ctx, "connect")) return NextResponse.json({ error: forbiddenCopy("connect") }, { status: 403 });
  const db = ctx.client;
  const ownerId = ctx.ownerId;
  const wsId = ctx.workspace?.id ?? null;

  // Best effort revoke: prefer the refresh token (revoking it kills the whole
  // grant), fall back to the access token. Never fatal to the disconnect. The
  // read is this workspace's row when one is known (one channel per
  // workspace); a failed filter falls back to the owner-wide read.
  try {
    const read = (withWs: boolean) => {
      let q = db.from("youtube_connections").select("access_token, refresh_token").eq("user_id", ownerId);
      if (withWs && wsId) q = q.eq("workspace_id", wsId);
      return q.maybeSingle();
    };
    let { data, error } = await read(true);
    if (error && wsId) ({ data, error } = await read(false));
    const row = data as { access_token?: string; refresh_token?: string | null } | null;
    const token = row?.refresh_token || row?.access_token;
    if (token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
    }
  } catch {
    // revoke is best effort
  }

  // Delete this workspace's row; a failed filter (column missing) falls back
  // to the pre-workspaces owner-wide delete.
  let deleted = false;
  if (wsId) {
    const { error } = await db.from("youtube_connections").delete().eq("user_id", ownerId).eq("workspace_id", wsId);
    deleted = !error;
  }
  if (!deleted) {
    const { error } = await db.from("youtube_connections").delete().eq("user_id", ownerId);
    if (error) {
      console.error("YouTube disconnect failed:", error.message);
      return NextResponse.json({ error: "Couldn't disconnect right now." }, { status: 500 });
    }
  }

  // Drop YouTube from the OWNER's profile platform list (best effort).
  try {
    const { data: prof } = await db
      .from("profiles")
      .select("platforms")
      .eq("user_id", ownerId)
      .maybeSingle();
    const platforms = (prof as { platforms?: string[] } | null)?.platforms;
    if (Array.isArray(platforms) && platforms.includes("YouTube")) {
      await db
        .from("profiles")
        .update({ platforms: platforms.filter((p) => p !== "YouTube"), updated_at: new Date().toISOString() })
        .eq("user_id", ownerId);
    }
  } catch {
    // cosmetic
  }

  clearLiveCache(ctx.ownerId);

  return NextResponse.json({ ok: true });
}
