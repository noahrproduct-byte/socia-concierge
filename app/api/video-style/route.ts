import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refuseCrossSite } from "@/lib/crossSite";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { perUserLimit } from "@/lib/rateLimit";
import { animatedAllowed } from "@/lib/planMixLoad";
import { readVideoStyle, saveVideoStyle, savedVideoStyle } from "@/lib/videoStyleLoad";
import { applyStyleEdits } from "@/lib/videoStyle";

export const runtime = "nodejs";
// Downloading and measuring up to 14 Reels, then one model call.
export const maxDuration = 300;

// The brand's video style (lib/videoStyle.ts): what is saved (GET), reading it
// again from the Reels (POST), and the person's corrections (PATCH).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  return NextResponse.json({ style: await savedVideoStyle(ctx) });
}

export async function POST(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  // Only plans with animated videos read a video style; it feeds nothing else.
  if (!(await animatedAllowed(ctx.client, ctx.ownerId))) return NextResponse.json({ error: "Your video style is read for animated videos, which aren't on your plan." }, { status: 403 });
  // A few reads an hour at most, and only under the month's AI ceiling.
  const limited = await perUserLimit(ctx.ownerId, "video_style", 3, "reading your video style");
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { fresh?: boolean };
  try {
    const r = await readVideoStyle(ctx, { fresh: body.fresh === true });
    if (!r.style) return NextResponse.json({ error: r.reason ?? "SOCIA couldn't read your style just now." }, { status: 422 });
    return NextResponse.json({ style: r.style });
  } catch (e) {
    console.error("[video-style] read failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "SOCIA couldn't read your Reels just now. Try again in a minute." }, { status: 502 });
  }
}

export async function PATCH(req: Request) {
  const crossSite = refuseCrossSite(req);
  if (crossSite) return crossSite;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  const base = await savedVideoStyle(ctx);
  if (!base) return NextResponse.json({ error: "Read your style first." }, { status: 409 });
  const raw = await req.text();
  if (raw.length > 20_000) return NextResponse.json({ error: "Those changes are too long." }, { status: 413 });
  let edits: unknown = null;
  try { edits = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const next = applyStyleEdits(base, edits, new Date());
  if (!(await saveVideoStyle(ctx, next))) return NextResponse.json({ error: "Couldn't save. Try again." }, { status: 500 });
  return NextResponse.json({ style: next });
}
