import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { resolveContext, can, forbiddenCopy, brandWorkspace } from "@/lib/context";
import { updateWorkspace } from "@/lib/workspaces";
import { freshDetail } from "@/lib/intel/understandLoad";
import { pinsOf } from "@/lib/intel/rankLoad";
import { MAX_PINS, keyOf } from "@/lib/intel/rank";
import type { BrandDetail } from "@/lib/profile";

export const runtime = "nodejs";

// A competitor the person marks as a priority (lib/intel/rank.ts): it comes
// first wherever SOCIA ranks the accounts it learns from (Discover, the niche
// read, plans). Kept on the brand (brand_detail.competitorPins), owners and
// admins only, at most MAX_PINS.
//   POST { platform, handle, on } -> { pins }

export async function POST(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { platform?: unknown; handle?: unknown; on?: unknown } | null;
  const platform = body?.platform === "youtube" ? "youtube" : body?.platform === "instagram" ? "instagram" : null;
  const handle = typeof body?.handle === "string" ? body.handle.trim().replace(/^@/, "") : "";
  if (!platform || !/^[a-zA-Z0-9._-]{1,60}$/.test(handle)) return NextResponse.json({ error: "Unknown account." }, { status: 400 });
  const key = keyOf(platform, handle);
  const detail = await freshDetail(ctx);
  const cur = pinsOf(detail);
  const on = body?.on !== false;
  if (on && !cur.includes(key) && cur.length >= MAX_PINS) {
    return NextResponse.json({ error: `You can mark up to ${MAX_PINS} accounts as a priority. Unmark one first.`, pins: cur }, { status: 409 });
  }
  const pins = on ? [...new Set([...cur, key])] : cur.filter((k) => k !== key);
  const next = { ...detail, competitorPins: pins } as BrandDetail;
  const ws = brandWorkspace(ctx);
  const ok = ws
    ? await updateWorkspace(ctx.client, ctx.ownerId, ws.id, { brand_detail: next })
    : !(await ctx.client.from("profiles").upsert({ user_id: ctx.ownerId, brand_detail: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" })).error;
  if (!ok) return NextResponse.json({ error: "Couldn't save that. Try again." }, { status: 500 });
  return NextResponse.json({ pins });
}
