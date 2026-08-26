import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { accountLimit, getPlan } from "@/lib/plan";

export const runtime = "nodejs";

// The account switcher's backend: list the user's connected Instagram
// accounts, and switch which one is active. Every page reads through the
// active account, so a switch changes the whole app on the next render.

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const plan = await getPlan(supabase, user.id);

  let rows: { ig_user_id: string | null; username: string | null; is_active?: boolean; profile?: { profile_picture_url?: string } | null }[] = [];
  try {
    const { data, error } = await supabase
      .from("instagram_connections")
      .select("ig_user_id, username, is_active, profile")
      .eq("user_id", user.id)
      .order("connected_at", { ascending: true });
    if (error) throw error;
    rows = data ?? [];
  } catch {
    // pre-migration: no is_active column, at most one row
    const { data } = await supabase
      .from("instagram_connections")
      .select("ig_user_id, username, profile")
      .eq("user_id", user.id)
      .limit(1);
    rows = (data ?? []).map((r: Record<string, unknown>) => ({ ...r, is_active: true })) as typeof rows;
  }

  return NextResponse.json({
    plan,
    limit: accountLimit(plan),
    accounts: rows.map((r) => ({
      ig_user_id: r.ig_user_id,
      username: r.username,
      is_active: r.is_active ?? true,
      avatar: r.profile?.profile_picture_url ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { ig_user_id?: string } | null;
  const igId = body?.ig_user_id;
  if (!igId) return NextResponse.json({ error: "ig_user_id required." }, { status: 400 });

  // Only rows the user owns are reachable (RLS also enforces this).
  const { data: target } = await supabase
    .from("instagram_connections")
    .select("ig_user_id")
    .eq("user_id", user.id)
    .eq("ig_user_id", igId)
    .limit(1);
  if (!target?.length) return NextResponse.json({ error: "No such account." }, { status: 404 });

  // Deactivate first: a partial unique index allows one active row per user.
  const off = await supabase
    .from("instagram_connections")
    .update({ is_active: false })
    .eq("user_id", user.id);
  if (off.error) return NextResponse.json({ error: off.error.message }, { status: 500 });
  const on = await supabase
    .from("instagram_connections")
    .update({ is_active: true })
    .eq("user_id", user.id)
    .eq("ig_user_id", igId);
  if (on.error) return NextResponse.json({ error: on.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, active: igId });
}
