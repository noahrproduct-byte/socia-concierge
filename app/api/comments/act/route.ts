import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { getProfile } from "@/lib/profile";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { sendCommentDraft, skipCommentDraft, redraftComment } from "@/lib/commentDrafts";
import { brandVoiceFrom } from "@/lib/commentBrand";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = { id?: string; action?: "send" | "skip" | "redraft"; text?: string };

// Act on one draft: send (approved, possibly edited), skip, or ask for another
// suggestion. Only `send` reaches a platform, and only with the text the
// person approved.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  if (!canUseFeature(ent, "comment_replies")) return NextResponse.json({ error: "AI comment replies are on Growth and up." }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Body;
  if (!body.id || !body.action) return NextResponse.json({ error: "Missing id or action." }, { status: 400 });

  if (body.action === "send") {
    const text = (body.text ?? "").trim();
    if (!text) return NextResponse.json({ error: "The reply is empty." }, { status: 400 });
    if (text.length > 2000) return NextResponse.json({ error: "The reply is too long." }, { status: 400 });
    const r = await sendCommentDraft(ctx.client, ctx.ownerId, body.id, text);
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  }
  if (body.action === "skip") {
    const ok = await skipCommentDraft(ctx.client, ctx.ownerId, body.id);
    return NextResponse.json({ ok });
  }
  // redraft
  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx));
  const draft = await redraftComment(ctx.client, ctx.ownerId, body.id, brandVoiceFrom(profile, ctx.workspace?.name ?? null));
  return NextResponse.json({ ok: Boolean(draft), draft });
}
