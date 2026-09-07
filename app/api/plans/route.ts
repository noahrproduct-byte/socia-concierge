import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Returns the signed-in user's saved plans (newest first).
// Row Level Security guarantees a user only ever sees their own rows.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ plans: [] });

    const { data, error } = await supabase
      .from("plans")
      .select("id, client_handle, niche, platform, data, created_at")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) return NextResponse.json({ plans: [] });
    return NextResponse.json({ plans: data ?? [] });
  } catch {
    // table may not exist yet — return empty history rather than erroring
    return NextResponse.json({ plans: [] });
  }
}

// Apply a change to one saved plan (the Content Plan's "Apply change" from a
// SOCIA proposal). Only the weekly plan is editable; the audit stays as built.
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  let body: { id?: string; weeklyPlan?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.id || !Array.isArray(body.weeklyPlan)) return NextResponse.json({ error: "id and weeklyPlan required." }, { status: 400 });
  const { data: cur, error: readErr } = await supabase.from("plans").select("id, data").eq("id", body.id).eq("user_id", user.id).maybeSingle();
  if (readErr || !cur) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  const data = { ...(cur.data as Record<string, unknown>), weeklyPlan: body.weeklyPlan };
  const { data: rows, error } = await supabase.from("plans").update({ data }).eq("id", body.id).eq("user_id", user.id).select("id, client_handle, niche, platform, data, created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows?.length) return NextResponse.json({ error: "The change was applied on screen but could not be saved to the plan. Run the latest supabase/schema.sql (plans update policy) to enable saving." }, { status: 403 });
  return NextResponse.json({ plan: rows[0] });
}
