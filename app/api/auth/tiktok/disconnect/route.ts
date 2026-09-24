import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeToken, ttAuthConfigured } from "@/lib/tiktokAuth";

export const runtime = "nodejs";

// Remove the stored TikTok connection and revoke the grant at TikTok so it
// disappears from the user's "Manage app permissions" list too.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  try {
    const { data } = await supabase.from("tiktok_connections").select("access_token").eq("user_id", user.id).maybeSingle();
    const token = (data as { access_token?: string } | null)?.access_token;
    if (token && ttAuthConfigured()) await revokeToken(token);
  } catch {
    // revoke is best effort
  }

  const { error } = await supabase.from("tiktok_connections").delete().eq("user_id", user.id);
  if (error) {
    console.error("TikTok disconnect failed:", error.message);
    return NextResponse.json({ error: "Couldn't disconnect right now." }, { status: 500 });
  }

  try {
    const { data: prof } = await supabase.from("profiles").select("platforms").eq("user_id", user.id).maybeSingle();
    const platforms = (prof as { platforms?: string[] } | null)?.platforms;
    if (Array.isArray(platforms) && platforms.includes("TikTok")) {
      await supabase
        .from("profiles")
        .update({ platforms: platforms.filter((p) => p !== "TikTok"), updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
    }
  } catch {
    // cosmetic
  }

  return NextResponse.json({ ok: true });
}
