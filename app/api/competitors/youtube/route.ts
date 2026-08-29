import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { channelStats, ytConfigured } from "@/lib/youtube";

export const runtime = "nodejs";
export const maxDuration = 30;

// Public YouTube stats for the user's tracked channels. Genuinely public data
// from YouTube's official API — the same numbers any visitor sees. Fields
// Google omits come back null so the UI can render "—" instead of a guess.

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!ytConfigured()) return NextResponse.json({ configured: false, channels: [] });

  const one = new URL(req.url).searchParams.get("handle");
  let handles: string[] = [];
  if (one) {
    handles = [one];
  } else {
    try {
      const { data } = await supabase
        .from("tracked_competitors")
        .select("handle")
        .eq("user_id", user.id)
        .eq("platform", "youtube");
      handles = (data ?? []).map((r: { handle: string }) => r.handle);
    } catch {
      handles = [];
    }
  }
  if (!handles.length) return NextResponse.json({ configured: true, channels: [] });

  const channels = await Promise.all(handles.slice(0, 10).map((h) => channelStats(h)));

  return NextResponse.json({ configured: true, channels });
}
