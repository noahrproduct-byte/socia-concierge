import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { perUserLimit } from "@/lib/rateLimit";
import { PLATFORMS, type Platform } from "@/lib/publishing/types";
import { capabilityFor, performPlatformDelete, targetForSyncedPost } from "@/lib/platformDelete/service";
import { outcomeResponse } from "@/lib/platformDelete/http";
import { deleteNoun } from "@/lib/platformDelete/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// One post from the workspace's connected accounts, as Analytics shows it,
// whether or not SOCIA published it: an Instagram post, Reel or carousel, a
// Facebook Page post, a YouTube video or Short. TikTok answers why not.
// GET    /api/platform-posts/:platform/:id   can it be deleted from here, and why not
// DELETE /api/platform-posts/:platform/:id   delete it from the platform (owner or admin)
// Ownership is proven from the workspace's own data (lib/platformDelete/service.ts).

type Params = { params: Promise<{ platform: string; id: string }> };

const asPlatform = (v: string): Platform | null => (PLATFORMS.includes(v as Platform) ? (v as Platform) : null);

export async function GET(_req: Request, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const { platform: p, id } = await params;
  const platform = asPlatform(p);
  if (!platform) return NextResponse.json({ error: "Unknown platform." }, { status: 404 });
  const r = await targetForSyncedPost(ctx, platform, id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  const capability = r.deletedAt ? null : await capabilityFor(ctx, r.target);
  return NextResponse.json({
    canDelete: can(ctx, "delete_on_platform"),
    target: { destinationId: r.target.destinationId, platform, permalink: r.target.permalink, deletedAt: r.deletedAt, noun: deleteNoun(platform, r.format), capability },
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "delete_on_platform")) return NextResponse.json({ error: forbiddenCopy("delete_on_platform") }, { status: 403 });
  const { platform: p, id } = await params;
  const platform = asPlatform(p);
  if (!platform) return NextResponse.json({ error: "Unknown platform." }, { status: 404 });

  const limited = await perUserLimit(ctx.viewerId, "platform-delete", 30, "deleting posts");
  if (limited) return limited;

  const r = await targetForSyncedPost(ctx, platform, id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  if (r.deletedAt) return NextResponse.json({ deletedAt: r.deletedAt, gone: false });

  const outcome = await performPlatformDelete(ctx, r.target, { format: r.format });
  return outcomeResponse(outcome);
}
