import { NextResponse } from "next/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { perUserLimit } from "@/lib/rateLimit";
import { readScan, startNicheScan } from "@/lib/nicheScan/run";

export const runtime = "nodejs";
// A waiting scan gets its next steps in the background of this request (next/server after()).
export const maxDuration = 300;

// The niche scan for the active brand (lib/nicheScan): GET is what the card
// shows (progress with real counts, then the playbook) and keeps a waiting
// scan moving; POST starts one ("Research again"), for the owner and admins.

async function context(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return { error: crossSite };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  return { ctx: await resolveContext(supabase, user.id) };
}

export async function GET(req: Request) {
  const c = await context(req);
  if (c.error) return c.error;
  return NextResponse.json(await readScan(c.ctx!));
}

export async function POST(req: Request) {
  const c = await context(req);
  if (c.error) return c.error;
  const ctx = c.ctx!;
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  // A scan reads dozens of accounts and calls the model several times: two an hour is plenty.
  const limited = await perUserLimit(ctx.ownerId, "niche_scan", 2, "niche research runs");
  if (limited) return limited;
  const id = await startNicheScan(ctx, "manual", { force: true });
  if (!id) return NextResponse.json({ error: "SOCIA couldn't start the research right now. Try again in a few minutes." }, { status: 503 });
  return NextResponse.json(await readScan(ctx, { continueRun: false }));
}
