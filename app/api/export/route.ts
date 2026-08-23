import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Exports the signed-in user's SOCIA data as a JSON download.
// Never includes secrets — the Instagram access token is explicitly excluded.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const out: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email },
  };

  // Every table is best-effort: missing tables/columns just export as null.
  try {
    const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    out.profile = data ?? null;
  } catch {
    out.profile = null;
  }
  try {
    const { data } = await supabase
      .from("instagram_connections")
      .select("username, profile, media, followers_count, media_count, last_synced_at")
      .eq("user_id", user.id)
      .maybeSingle();
    out.instagram = data ?? null;
  } catch {
    out.instagram = null;
  }
  try {
    const { data } = await supabase
      .from("plans")
      .select("id, client_handle, niche, platform, data, created_at")
      .order("created_at", { ascending: false });
    out.plans = data ?? [];
  } catch {
    out.plans = [];
  }
  try {
    const { data } = await supabase
      .from("conversations")
      .select("id, title, messages, updated_at")
      .order("updated_at", { ascending: false });
    out.conversations = data ?? [];
  } catch {
    out.conversations = [];
  }

  return new NextResponse(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="socia-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
