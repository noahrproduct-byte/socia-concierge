import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadDiscoverData } from "@/lib/discoverData";
import { pickViral } from "@/lib/viralPick";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The Dashboard's "Going viral in your niche": the same Reels Discover shows
// (lib/discoverData.ts), cut to the few that took off by their own published
// numbers, competitors' first. Read only; nothing is fetched from Instagram here.
//   GET -> { access, upgrade, reels, readAt, niche, now }
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const d = await loadDiscoverData(supabase, user);
    return NextResponse.json(pickViral(d), { headers: { "cache-control": "private, max-age=300" } });
  } catch (e) {
    console.error("[dashboard/viral]", (e as Error)?.message ?? e);
    return NextResponse.json({ error: "The videos couldn't be read right now." }, { status: 500 });
  }
}
