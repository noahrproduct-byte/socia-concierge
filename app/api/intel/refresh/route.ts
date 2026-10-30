import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { perUserLimit } from "@/lib/rateLimit";
import { runInsights } from "@/lib/intel/runIntel";

export const runtime = "nodejs";
export const maxDuration = 60;

// Run the producers for this brand now. No AI call; bounded so platform API
// quotas aren't spent by repeated clicks.
export async function POST(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  const limited = await perUserLimit(ctx.ownerId, "intel_refresh", 12, "insight refreshes");
  if (limited) return limited;
  try {
    const run = await runInsights(ctx, "manual");
    if (!run.tableReady) return NextResponse.json({ error: "The insights store needs SOCIA's database update first." }, { status: 503 });
    return NextResponse.json({ ok: true, run });
  } catch {
    return NextResponse.json({ error: "Couldn't read your accounts just now. Try again in a minute." }, { status: 502 });
  }
}
