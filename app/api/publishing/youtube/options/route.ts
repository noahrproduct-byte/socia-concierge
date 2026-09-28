import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { youtubeAccessToken } from "@/lib/youtubeData";
import { YT_WRITE_SCOPES } from "@/lib/publishing/capabilities";
import { resolveContext } from "@/lib/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The composer's YouTube options: the active Brand Workspace's channel's own
// playlists and the video categories YouTube lets a video be assigned to. The
// token is the workspace owner's, used here and never returned. Read live on
// every call; nothing is cached, so a playlist made a minute ago shows up.

const DATA = "https://www.googleapis.com/youtube/v3";

async function get(url: string, token: string): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; status: number; message: string }> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000), cache: "no-store" }).catch(() => null);
  if (!res) return { ok: false, status: 502, message: "YouTube could not be reached." };
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const e = (json as { error?: { message?: string } } | null)?.error;
    return { ok: false, status: res.status, message: e?.message || `YouTube returned ${res.status}.` };
  }
  return { ok: true, json: json ?? {} };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);

  const auth = await youtubeAccessToken(ctx.client, ctx.ownerId);
  if (!auth) return NextResponse.json({ error: "YouTube is not connected." }, { status: 404 });
  if (!auth.scopes || !auth.scopes.some((s) => YT_WRITE_SCOPES.includes(s))) {
    return NextResponse.json({ error: "Reconnect YouTube to allow uploads.", code: "needs_scope" }, { status: 409 });
  }

  const [pl, cat] = await Promise.all([
    get(`${DATA}/playlists?part=snippet&mine=true&maxResults=50`, auth.token),
    get(`${DATA}/videoCategories?part=snippet&regionCode=US`, auth.token),
  ]);
  if (!pl.ok) {
    if (pl.status === 401 || pl.status === 403) return NextResponse.json({ error: "Reconnect YouTube to allow uploads.", code: "needs_scope", detail: pl.message }, { status: 409 });
    return NextResponse.json({ error: pl.message }, { status: 502 });
  }

  type Item = { id?: string; snippet?: { title?: string; assignable?: boolean } };
  const playlists = ((pl.json.items as Item[] | undefined) ?? [])
    .filter((p) => p.id && p.snippet?.title)
    .map((p) => ({ id: p.id as string, title: p.snippet!.title as string }));
  // Categories are secondary: when that call fails the playlists still come back.
  const categories = cat.ok
    ? ((cat.json.items as Item[] | undefined) ?? [])
        .filter((c) => c.id && c.snippet?.title && c.snippet.assignable !== false)
        .map((c) => ({ id: c.id as string, title: c.snippet!.title as string }))
    : null;

  return NextResponse.json({ playlists, categories: categories ?? [], categoriesNote: cat.ok ? null : cat.message }, { headers: { "cache-control": "no-store" } });
}
