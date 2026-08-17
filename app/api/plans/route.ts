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
