import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { igCompetitorRows } from "@/lib/igCompetitorData";

export const runtime = "nodejs";
export const maxDuration = 60;

// Real Instagram competitor data, via Business Discovery (lib/igCompetitorData).
// Only works through a Facebook Page linked to the user's Instagram
// Professional account; everything Meta withholds stays absent, never estimated.

export type { IgCompetitor } from "@/lib/igCompetitorData";

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const one = url.searchParams.get("handle");

  let handles: string[] = [];
  if (one) handles = [one];
  else {
    try {
      const { data } = await supabase.from("tracked_competitors").select("handle").eq("user_id", user.id).eq("platform", "instagram");
      handles = (data ?? []).map((r: { handle: string }) => r.handle);
    } catch {
      handles = [];
    }
  }
  return NextResponse.json(await igCompetitorRows(supabase, user.id, handles, refresh));
}
