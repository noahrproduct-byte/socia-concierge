import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { isTimeZone } from "@/lib/weeklyPlanJob";

export const runtime = "nodejs";

// The browser's time zone, kept on the person's own profile row
// (brand_detail.timezone) so the Sunday plan arrives at 6 PM their time.
// Written only when it changed.
export async function POST(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { tz?: unknown };
  const tz = typeof body.tz === "string" ? body.tz.slice(0, 64) : "";
  if (!isTimeZone(tz)) return NextResponse.json({ error: "Not a time zone." }, { status: 400 });
  const { data } = await supabase.from("profiles").select("brand_detail").eq("user_id", user.id).maybeSingle();
  const detail = ((data as { brand_detail?: Record<string, unknown> } | null)?.brand_detail ?? {}) as Record<string, unknown>;
  if (detail.timezone === tz) return NextResponse.json({ ok: true, changed: false });
  const { error } = await supabase.from("profiles").upsert({ user_id: user.id, brand_detail: { ...detail, timezone: tz }, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Couldn't save the time zone." }, { status: 500 });
  return NextResponse.json({ ok: true, changed: true });
}
