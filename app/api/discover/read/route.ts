import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { resolveContext } from "@/lib/context";
import { perUserLimit } from "@/lib/rateLimit";
import { readDiscoverAccounts } from "@/lib/discoverRead";

export const runtime = "nodejs";
export const maxDuration = 120;

// Discover's background read (Noah, 2026-11-14): every tracked competitor and
// the top suggestions on Instagram, then the style of each account's videos.
// The page shows what is saved at once and calls this for what is missing or
// old, so it never waits on Instagram to load.
export async function POST(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const limited = await perUserLimit(ctx.ownerId, "discover_read", 8, "account reads", ctx.ownerId);
  if (limited) return limited;
  try {
    return NextResponse.json(await readDiscoverAccounts(ctx, new Date()));
  } catch {
    return NextResponse.json({ error: "SOCIA couldn't read the accounts just now. Try again in a minute." }, { status: 502 });
  }
}
