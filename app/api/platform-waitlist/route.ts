import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { OFFLINE_PLATFORMS, type OfflinePlatform } from "@/lib/platformStatus";

export const runtime = "nodejs";

// "Notify me when available" for TikTok and Facebook (supabase/platform-waitlist.sql).
//   GET            -> { platforms: ["tiktok", ...], ready }  the ones this person asked about
//   POST {platform, on} -> { platforms, ready }               ask, or stop asking
// Rows are the person's own (row-level security); the address saved is the one
// on their sign-in, never one typed here.

const isPlatform = (v: unknown): v is OfflinePlatform => typeof v === "string" && v in OFFLINE_PLATFORMS;
const missing = (e: { message?: string; code?: string } | null) => Boolean(e && (/relation .* does not exist|Could not find the table/i.test(e.message ?? "") || e.code === "PGRST205" || e.code === "42P01"));
const NOT_READY = "Notifications for this aren't set up yet. Email us instead and we'll tell you when it opens.";

async function mine(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data, error } = await supabase.from("platform_waitlist").select("platform").eq("user_id", userId);
  if (error) return { ready: !missing(error), platforms: [] as string[], error };
  return { ready: true, platforms: (data ?? []).map((r: { platform: string }) => r.platform), error: null };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const m = await mine(supabase, user.id);
  return NextResponse.json({ platforms: m.platforms, ready: m.ready });
}

export async function POST(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { platform?: unknown; on?: unknown } | null;
  if (!isPlatform(body?.platform)) return NextResponse.json({ error: "Unknown platform." }, { status: 400 });
  const { error } = body.on === false
    ? await supabase.from("platform_waitlist").delete().eq("user_id", user.id).eq("platform", body.platform)
    : await supabase.from("platform_waitlist").upsert({ user_id: user.id, platform: body.platform, email: user.email ?? null }, { onConflict: "user_id,platform", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: missing(error) ? NOT_READY : "Couldn't save that. Try again.", ready: !missing(error) }, { status: missing(error) ? 503 : 500 });
  const m = await mine(supabase, user.id);
  return NextResponse.json({ platforms: m.platforms, ready: m.ready });
}
