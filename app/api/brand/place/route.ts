import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, brandWorkspace, can, forbiddenCopy, type Ctx } from "@/lib/context";
import { anthropic, FAST_MODEL, effortFor, aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { perUserLimit } from "@/lib/rateLimit";
import { updateWorkspace } from "@/lib/workspaces";
import { currentDetail, freshDetail } from "@/lib/intel/understandLoad";
import type { BrandDetail } from "@/lib/profile";
import { PLACE_MAX_BYTES, PLACE_MAX_PHOTOS, PLACE_SCHEMA, PLACE_SYSTEM, sanitizePlace, type Place } from "@/lib/place";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Your place" for the active brand (lib/place.ts).
//   GET            -> { place } what SOCIA saw last, or null
//   POST { photos } -> { place } photos (base64 JPEG/PNG/WebP, resized in the
//                     browser) are read once by the model and dropped; only
//                     the description is saved on the brand
//   DELETE         -> { place: null } forget it
// Saving and forgetting change the brand, so only the owner or an admin may.

type Media = "image/jpeg" | "image/png" | "image/webp";

/** A photo as the model takes it, or null when it isn't a bounded JPEG, PNG or WebP. */
function photoBlock(v: unknown): { type: "image"; source: { type: "base64"; media_type: Media; data: string } } | null {
  if (typeof v !== "string") return null;
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(v.trim());
  if (!m) return null;
  const data = m[2];
  if (Math.floor((data.length * 3) / 4) > PLACE_MAX_BYTES) return null;
  return { type: "image", source: { type: "base64", media_type: m[1] as Media, data } };
}

async function savePlace(ctx: Ctx, place: Place | null): Promise<boolean> {
  const detail = await freshDetail(ctx);
  const { place: _old, ...rest } = detail;
  const next: BrandDetail = place ? { ...rest, place } : rest;
  const ws = brandWorkspace(ctx);
  if (ws) return updateWorkspace(ctx.client, ctx.ownerId, ws.id, { brand_detail: next });
  const { error } = await ctx.client.from("profiles").upsert({ user_id: ctx.ownerId, brand_detail: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return !error;
}

async function signedIn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? resolveContext(supabase, user.id) : null;
}

export async function GET() {
  const ctx = await signedIn();
  if (!ctx) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const d = await currentDetail(ctx).catch(() => ({}) as BrandDetail);
  return NextResponse.json({ place: sanitizePlace(d.place), canEdit: can(ctx, "manage_workspace") });
}

export async function POST(req: Request) {
  const ctx = await signedIn();
  if (!ctx) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { photos?: unknown } | null;
  const sent = Array.isArray(body?.photos) ? body.photos : [];
  if (!sent.length) return NextResponse.json({ error: "Add at least one photo of your place." }, { status: 400 });
  if (sent.length > PLACE_MAX_PHOTOS) return NextResponse.json({ error: `Up to ${PLACE_MAX_PHOTOS} photos at a time.` }, { status: 400 });
  const photos = sent.map(photoBlock);
  if (photos.some((p) => !p)) return NextResponse.json({ error: "Each photo must be a JPEG, PNG or WebP under 1.5 MB." }, { status: 400 });

  // Each scan is a model call on up to PLACE_MAX_PHOTOS photos: an hourly ceiling per account, then the monthly AI ceiling.
  const limited = await perUserLimit(ctx.ownerId, "place_scan", 10, "place scans");
  if (limited) return limited;

  try {
    const params = {
      model: FAST_MODEL, max_tokens: 3000, system: PLACE_SYSTEM,
      output_config: { format: { type: "json_schema", schema: PLACE_SCHEMA }, ...effortFor(FAST_MODEL, "medium") },
      messages: [{ role: "user", content: [...photos, { type: "text", text: `These are ${photos.length} photo${photos.length === 1 ? "" : "s"} of the business. Describe the place for filming.` }] }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anthropic.messages.create(params as any);
    recordAiUsage(ctx.ownerId, "place_scan", res);
    if (res.stop_reason === "refusal") return NextResponse.json({ error: "SOCIA couldn't describe these photos. Try photos of the place itself: the door, the counter, the room." }, { status: 422 });
    const block = res.content.find((b) => b.type === "text");
    const raw = block && "text" in block ? JSON.parse(block.text) : null;
    const place = sanitizePlace({ ...raw, scannedAt: new Date().toISOString(), photos: photos.length });
    if (!place) return NextResponse.json({ error: "SOCIA couldn't make out the place in these photos. Try clearer photos taken inside and at the entrance." }, { status: 422 });
    if (!(await savePlace(ctx, place))) return NextResponse.json({ error: "SOCIA read the photos but couldn't save what it saw. Try again." }, { status: 500 });
    return NextResponse.json({ place });
  } catch (err) {
    const k = aiFailureKind(err);
    console.error("[place]", (err as Error)?.message ?? err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[k], kind: k }, { status: k === "rate_limited" ? 429 : 502 });
  }
}

export async function DELETE() {
  const ctx = await signedIn();
  if (!ctx) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!can(ctx, "manage_workspace")) return NextResponse.json({ error: forbiddenCopy("manage_workspace") }, { status: 403 });
  if (!(await savePlace(ctx, null))) return NextResponse.json({ error: "Couldn't remove it. Try again." }, { status: 500 });
  return NextResponse.json({ place: null });
}
