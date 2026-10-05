import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { getProfile } from "@/lib/profile";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { syncCommentDrafts, listCommentDrafts } from "@/lib/commentDrafts";
import { brandVoiceFrom } from "@/lib/commentBrand";

export const runtime = "nodejs";
export const maxDuration = 60;

// Read new comments on the workspace's posts and draft replies for them.
// Growth and up; nothing is sent here — drafts wait for approval in the inbox.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const [ent, profile] = await Promise.all([
    getEntitlements(ctx.client, ctx.ownerId),
    getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)),
  ]);
  if (!canUseFeature(ent, "comment_replies")) return NextResponse.json({ error: "AI comment replies are on Growth and up." }, { status: 403 });

  const wsId = ctx.workspace?.id ?? null;
  const result = await syncCommentDrafts(ctx.client, ctx.ownerId, wsId, brandVoiceFrom(profile, ctx.workspace?.name ?? null));
  const drafts = await listCommentDrafts(ctx.client, ctx.ownerId, wsId);
  return NextResponse.json({ ...result, drafts });
}
