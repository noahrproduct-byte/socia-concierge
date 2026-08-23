import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncFacebook } from "@/lib/facebookSync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Step 3 (multi-Page managers): the user picked which Page to connect.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let pageId: string;
  try {
    ({ page_id: pageId } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { data: row } = await supabase
    .from("facebook_connections")
    .select("pending_pages")
    .eq("user_id", user.id)
    .maybeSingle();
  type PageEntry = {
    id: string; name?: string; username?: string; followers_count?: number;
    fan_count?: number; picture?: { data?: { url?: string } }; access_token?: string;
  };
  const pages: PageEntry[] = Array.isArray(row?.pending_pages) ? row!.pending_pages : [];
  const p = pages.find((x) => x.id === pageId);
  if (!p?.access_token) {
    return NextResponse.json({ error: "That Page isn't in your pending list — reconnect Facebook." }, { status: 400 });
  }

  const { error } = await supabase.from("facebook_connections").upsert(
    {
      user_id: user.id,
      page_id: p.id,
      page_name: p.name ?? null,
      username: p.username ?? null,
      followers_count: p.followers_count ?? p.fan_count ?? null,
      picture_url: p.picture?.data?.url ?? null,
      access_token: p.access_token,
      connection_status: "connected",
      pending_pages: null,
    },
    { onConflict: "user_id" },
  );
  if (error) return NextResponse.json({ error: "Couldn't save the connection." }, { status: 500 });

  await syncFacebook(supabase, user.id).catch(() => null);
  return NextResponse.json({ ok: true });
}
