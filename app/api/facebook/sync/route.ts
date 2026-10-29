import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { clearLiveCache } from "@/lib/liveCache";
import { syncFacebook } from "@/lib/facebookSync";
import { perUserLimit } from "@/lib/rateLimit";

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
  // Each sync is dozens of platform calls on the owner's token (which
  // publishing also needs): an hourly ceiling per account.
  const limited = await perUserLimit(ctx.ownerId, "manual_sync", 30, "syncs");
  if (limited) return limited;

  // The workspace being viewed, never the owner's currently active one: a
  // guest in one brand must not sync (and be shown) another brand.
  const snap = await syncFacebook(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null);
  if (!snap) {
    return NextResponse.json(
      { error: "Facebook data couldn't be refreshed right now." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, synced_at: snap.last_synced_at });
}
