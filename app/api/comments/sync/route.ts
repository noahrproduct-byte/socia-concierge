import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { getProfile } from "@/lib/profile";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { syncCommentDrafts, listCommentDrafts } from "@/lib/commentDrafts";
import { brandVoiceFrom } from "@/lib/commentBrand";
import { perUserLimit } from "@/lib/rateLimit";
import { readAutoSetting } from "@/lib/commentAuto";

export const runtime = "nodejs";
export const maxDuration = 60;

// Read new comments on the workspace's posts and draft replies for them.
// Growth and up; nothing is sent here. Drafts wait for approval in the inbox,
// or, with automatic replies on, the ones it can answer on its own for the next job run.
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

  // A sync drafts up to 20 replies with AI: an hourly ceiling per account.
  const limited = await perUserLimit(ctx.ownerId, "comment_sync", 20, "comment syncs");
  if (limited) return limited;

  const wsId = ctx.workspace?.id ?? null;
  // With automatic replies on, drafts are also judged for sending on their own (the job sends them).
  const auto = await readAutoSetting(ctx.client, ctx.ownerId, wsId).catch(() => null);
  const result = await syncCommentDrafts(ctx.client, ctx.ownerId, wsId, brandVoiceFrom(profile, ctx.workspace?.name ?? null), { classify: Boolean(auto?.enabled) });
  const drafts = await listCommentDrafts(ctx.client, ctx.ownerId, wsId);
  return NextResponse.json({ ...result, drafts });
}
