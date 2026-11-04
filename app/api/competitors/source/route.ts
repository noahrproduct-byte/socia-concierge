import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { FB_GRAPH_V } from "@/lib/facebook";
import { igConnection } from "@/lib/igCompetitorData";
import { businessDiscovery } from "@/lib/igBusinessDiscovery";
import { researchConfigured, researchConnection } from "@/lib/igResearch";
import { trendingAudio, resetAudioMemo } from "@/lib/igAudio";
import { connectionWorkspaceId } from "@/lib/workspaces";

export const runtime = "nodejs";

// Where Instagram competitor numbers would come from for this workspace owner,
// and why not when they don't: each connected Facebook Page, the Instagram
// account SOCIA saved for it, what Facebook says is linked right now (or the
// error it gives), and whether SOCIA's research account (lib/igResearch.ts) is
// found, plus one real test lookup with Meta's own error text when it fails.
// Read only; tokens never leave the server. Owner and admins only.

type Row = { page_id?: string | null; page_name?: string | null; ig_business_username?: string | null; ig_business_id?: string | null; access_token?: string | null; connection_status?: string | null };

async function liveLink(pageId: string, token: string): Promise<{ instagram: string | null; error: string | null }> {
  const u = new URL(`https://graph.facebook.com/${FB_GRAPH_V}/${pageId}`);
  u.searchParams.set("fields", "instagram_business_account{id,username}");
  u.searchParams.set("access_token", token);
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(10000) });
    const j = (await res.json()) as { instagram_business_account?: { username?: string }; error?: { message?: string } };
    if (j.error) return { instagram: null, error: (j.error.message ?? "Facebook returned an error.").slice(0, 200) };
    return { instagram: j.instagram_business_account?.username ?? null, error: null };
  } catch {
    return { instagram: null, error: "Facebook couldn't be reached." };
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });

  // The owner sees all their Pages (any of them can ask Business Discovery,
  // like igConnection); an Admin invited to one brand sees only that brand's.
  const wsId = ctx.viewerId === ctx.ownerId ? null : await connectionWorkspaceId(ctx.client, ctx.ownerId, ctx.workspace?.id ?? undefined);
  let q = ctx.client
    .from("facebook_connections")
    .select("page_id, page_name, ig_business_username, ig_business_id, access_token, connection_status")
    .eq("user_id", ctx.ownerId);
  if (wsId) q = q.eq("workspace_id", wsId);
  const { data } = await q.limit(20);
  const pages = await Promise.all(
    ((data ?? []) as Row[]).map(async (r) => ({
      page: r.page_name ?? null,
      status: r.connection_status ?? null,
      savedInstagram: r.ig_business_id ? (r.ig_business_username ?? "(id only)") : null,
      linkedNow: r.page_id && r.access_token ? await liveLink(r.page_id, r.access_token) : null,
    })),
  );

  const conn = await igConnection(ctx.client, ctx.ownerId);
  // One real lookup of a public account (profile and 3 posts, with views when
  // Meta returns them), so a failure shows Meta's own words.
  const probe = conn ? await businessDiscovery(conn.igUserId, conn.pageToken, "instagram", 3) : null;
  return NextResponse.json({
    using: conn?.source ?? null,
    testLookup: probe ? (probe.ok ? { ok: true, followers: probe.account.followers, recentViews: probe.account.media.map((m) => m.views) } : { ok: false, reason: probe.reason, meta: probe.detail ?? null }) : null,
    pages,
    research: { configured: researchConfigured(), found: Boolean(await researchConnection()) },
    // A fresh trending-audio read (cache skipped), with Meta's words on failure.
    audio: await (async () => {
      resetAudioMemo();
      const a = await trendingAudio(ctx.client, ctx.ownerId);
      return a.status === "ok" ? { ok: true, music: a.music.length, sounds: a.sounds.length, first: a.music[0]?.title ?? a.sounds[0]?.title ?? null } : { ok: false, reason: a.reason, meta: a.detail ?? null };
    })(),
  });
}
