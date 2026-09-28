import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEntitlements, getLimit } from "@/lib/entitlements";
import { igCompetitorRows } from "@/lib/igCompetitorData";
import { listTracked } from "@/lib/trackedCompetitors";
import { resolveContext } from "@/lib/context";

export const runtime = "nodejs";
export const maxDuration = 60;

// Real Instagram competitor data, via Business Discovery (lib/igCompetitorData).
// Only works through a Facebook Page linked to the user's Instagram
// Professional account; everything Meta withholds stays absent, never estimated.
//
// Reads are capped by the plan too: only the oldest N tracked handles (N =
// the plan's competitor limit) are ever sent to Business Discovery, so a row
// beyond the cap receives no data even if it still exists.

export type { IgCompetitor } from "@/lib/igCompetitorData";

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // The roster, the cap and the Page token all belong to the active workspace's owner.
  const ctx = await resolveContext(supabase, user.id);

  const url = new URL(req.url);
  const refresh = url.searchParams.get("refresh") === "1";
  const one = url.searchParams.get("handle")?.trim().replace(/^@/, "").toLowerCase() || null;

  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  const limit = getLimit(ent, "competitors");

  let handles: string[] = [];
  try {
    const rows = await listTracked<{ handle: string }>(ctx.client, ctx.ownerId, "handle", { platform: "instagram", limit });
    handles = rows.map((r) => r.handle);
  } catch {
    handles = [];
  }
  // A single handle is served only when it is inside the capped roster.
  if (one) handles = handles.filter((h) => h.toLowerCase() === one);

  return NextResponse.json(await igCompetitorRows(ctx.client, ctx.ownerId, handles, refresh));
}
