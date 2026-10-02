import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { clearLiveCache } from "@/lib/liveCache";
import { syncFacebook } from "@/lib/facebookSync";

export const runtime = "nodejs";
export const maxDuration = 60;

// Manual "Sync now" for the connected Facebook Page. A sync is a read refresh
// of the ACTIVE Brand Workspace's Page, so every role may trigger it; the rows
// it writes belong to the workspace owner.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  // Connections or their data are about to change: drop the reused live
  // platform reads so the next page view asks the platforms again.
  clearLiveCache(ctx.ownerId);

  const snap = await syncFacebook(ctx.client, ctx.ownerId);
  if (!snap) {
    return NextResponse.json(
      { error: "Facebook data couldn't be refreshed right now." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, synced_at: snap.last_synced_at });
}
