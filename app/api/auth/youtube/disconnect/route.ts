import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Remove the stored YouTube connection and revoke the grant at Google so it
// disappears from the user's Google account too.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // Best effort revoke: prefer the refresh token (revoking it kills the whole
  // grant), fall back to the access token. Never fatal to the disconnect.
  try {
    const { data } = await supabase
      .from("youtube_connections")
      .select("access_token, refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();
    const row = data as { access_token?: string; refresh_token?: string | null } | null;
    const token = row?.refresh_token || row?.access_token;
    if (token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
        signal: AbortSignal.timeout(8000),
      }).catch(() => null);
    }
  } catch {
    // revoke is best effort
  }

  const { error } = await supabase.from("youtube_connections").delete().eq("user_id", user.id);
  if (error) {
    console.error("YouTube disconnect failed:", error.message);
    return NextResponse.json({ error: "Couldn't disconnect right now." }, { status: 500 });
  }

  // Drop YouTube from the profile platform list (best effort).
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("platforms")
      .eq("user_id", user.id)
      .maybeSingle();
    const platforms = (prof as { platforms?: string[] } | null)?.platforms;
    if (Array.isArray(platforms) && platforms.includes("YouTube")) {
      await supabase
        .from("profiles")
        .update({ platforms: platforms.filter((p) => p !== "YouTube"), updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
    }
  } catch {
    // cosmetic
  }

  return NextResponse.json({ ok: true });
}
