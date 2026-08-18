import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ profile: null });
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
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const row: Record<string, unknown> = {
    user_id: user.id,
    niche: body.niche || null,
    brand_name: body.brand_name || null,
    goals: body.goals || null,
    updated_at: new Date().toISOString(),
  };
  // Only touch platforms / account_connected when the caller sends them, so the
  // profile form (niche/goal) and the connections manager can save independently
  // without wiping each other.
  if (Array.isArray(body.platforms)) row.platforms = body.platforms;
  if (typeof body.account_connected === "boolean") {
    row.account_connected = body.account_connected;
  }

  const { error } = await supabase.from("profiles").upsert(row, { onConflict: "user_id" });

  if (error) {
    return NextResponse.json(
      { error: `Couldn't save — is the profiles table created? (${error.message})` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
