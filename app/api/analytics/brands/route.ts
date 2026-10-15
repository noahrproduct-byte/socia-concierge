import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements, checkFeature } from "@/lib/entitlements";
import { loadCrossBrand } from "@/lib/crossBrandLoad";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET ?days=30 — Analytics → All brands: every Brand Workspace the signed-in
// person owns, side by side (Pro). Only their own workspaces, read through
// their own session; never a workspace they were invited into.
export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ent = await getEntitlements(supabase, user.id);
  const check = checkFeature(ent, "cross_brand_analytics");
  if (!check.ok) return NextResponse.json(check.error, { status: 403 });
  const raw = Number(new URL(req.url).searchParams.get("days"));
  const days = Number.isFinite(raw) && raw > 0 ? raw : undefined;
  try {
    const data = await loadCrossBrand(supabase, user.id, ent, days);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[cross-brand]", (e as Error)?.message ?? e);
    return NextResponse.json({ error: "SOCIA couldn't load your brands just now. Try again in a moment." }, { status: 502 });
  }
}
