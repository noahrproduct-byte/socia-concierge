import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncInstagram } from "@/lib/instagramSync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Re-pull the connected Instagram's profile + posts on demand.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const snap = await syncInstagram(supabase, user.id);
  if (!snap) {
    return NextResponse.json(
      { error: "No Instagram connection to sync, or Instagram didn't respond." },
      { status: 400 },
    );
  }
  return NextResponse.json({
    ok: true,
    synced_at: snap.last_synced_at,
    username: snap.username,
    followers: snap.followers_count,
  });
}
