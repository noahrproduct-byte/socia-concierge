import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { BrandDetail } from "@/lib/profile";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ profile: null });
    const full = await supabase
      .from("profiles")
      .select("niche, brand_name, goals, platforms, account_connected, brand_detail")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!full.error) return NextResponse.json({ profile: full.data ?? null });
    // brand_detail column may not exist yet — serve the legacy shape.
    const { data } = await supabase
      .from("profiles")
      .select("niche, brand_name, goals, platforms, account_connected")
      .eq("user_id", user.id)
      .maybeSingle();
    return NextResponse.json({ profile: data ?? null });
  } catch {
    return NextResponse.json({ profile: null });
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: {
    niche?: string;
    brand_name?: string;
    goals?: string;
    platforms?: string[];
    account_connected?: boolean;
    brand_detail?: BrandDetail;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const row: Record<string, unknown> = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  // Only touch fields the caller sends, so the brand form, strategist form and
  // connections manager can save independently without wiping each other.
  if ("niche" in body) row.niche = body.niche || null;
  if ("brand_name" in body) row.brand_name = body.brand_name || null;
  if ("goals" in body) row.goals = body.goals || null;
  if (Array.isArray(body.platforms)) row.platforms = body.platforms;
  if (typeof body.account_connected === "boolean") {
    row.account_connected = body.account_connected;
  }

  // brand_detail is a single jsonb shared by two forms — merge, never clobber.
  let brandSaved: boolean | undefined;
  if (body.brand_detail && typeof body.brand_detail === "object") {
    const { data: cur } = await supabase
      .from("profiles")
      .select("brand_detail")
      .eq("user_id", user.id)
      .maybeSingle();
    const existing = (cur?.brand_detail ?? {}) as BrandDetail;
    row.brand_detail = {
      ...existing,
      ...body.brand_detail,
      strategist: { ...(existing.strategist ?? {}), ...(body.brand_detail.strategist ?? {}) },
    };
    brandSaved = true;
  }

  let { error } = await supabase.from("profiles").upsert(row, { onConflict: "user_id" });

  if (error && "brand_detail" in row) {
    // Column may not exist yet — save everything else and tell the client.
    delete row.brand_detail;
    brandSaved = false;
    ({ error } = await supabase.from("profiles").upsert(row, { onConflict: "user_id" }));
  }

  if (error) {
    return NextResponse.json(
      { error: `Couldn't save — is the profiles table created? (${error.message})` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, ...(brandSaved !== undefined ? { brandSaved } : {}) });
}
