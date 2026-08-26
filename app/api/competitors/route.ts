import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Tracked-competitor list management. SOCIA stores handles only — it never
// invents metrics for these accounts (platforms expose none to third parties).

const MAX_TRACKED = 10;
const HANDLE_RE = /^[a-zA-Z0-9._]{1,30}$/;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    const { data, error } = await supabase
      .from("tracked_competitors")
      .select("platform, handle, added_at")
      .eq("user_id", user.id)
      .order("added_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ competitors: data ?? [] });
  } catch {
    // table may not exist yet
    return NextResponse.json({ competitors: [] });
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { handle?: string; platform?: string } | null;
  const handle = (body?.handle ?? "").trim().replace(/^@/, "");
  const platform = body?.platform === "facebook" ? "facebook" : "instagram";
  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json({ error: "That doesn't look like a valid handle." }, { status: 400 });
  }

  const { count } = await supabase
    .from("tracked_competitors")
    .select("handle", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= MAX_TRACKED) {
    return NextResponse.json({ error: `You can track up to ${MAX_TRACKED} competitors.` }, { status: 400 });
  }

  const { error } = await supabase
    .from("tracked_competitors")
    .upsert({ user_id: user.id, platform, handle: handle.toLowerCase() }, { onConflict: "user_id,platform,handle" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { handle?: string; platform?: string } | null;
  const handle = (body?.handle ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!handle) return NextResponse.json({ error: "handle required." }, { status: 400 });

  const { error } = await supabase
    .from("tracked_competitors")
    .delete()
    .eq("user_id", user.id)
    .eq("platform", body?.platform === "facebook" ? "facebook" : "instagram")
    .eq("handle", handle);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
