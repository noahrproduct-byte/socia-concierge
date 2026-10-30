import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { resolveContext, brandWorkspace, can, forbiddenCopy } from "@/lib/context";
import { getProfile } from "@/lib/profile";
import { runUnderstanding } from "@/lib/intel/understandLoad";

export const runtime = "nodejs";
export const maxDuration = 120;

// What SOCIA inferred about this brand from its connected accounts (GET), and
// running that analysis again (POST, one account audit).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  return NextResponse.json({ understanding: profile?.brand_detail?.growth?.understanding ?? null });
}

export async function POST(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  const r = await runUnderstanding(ctx);
  if (r.status === "denied") return r.response;
  if (r.status === "failed") return NextResponse.json({ error: r.reason }, { status: 502 });
  if (r.status === "no_accounts") return NextResponse.json({ status: r.status, understanding: null });
  if (r.status === "too_little") return NextResponse.json({ status: r.status, posts: r.posts, understanding: r.understanding });
  return NextResponse.json({ status: "done", understanding: r.understanding });
}
