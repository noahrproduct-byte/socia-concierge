import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { loadItem } from "@/lib/publishing/db";
import { perUserLimit } from "@/lib/rateLimit";
import { capabilityFor, performPlatformDelete, targetForDestination } from "@/lib/platformDelete/service";
import { outcomeResponse } from "@/lib/platformDelete/http";
import { deleteNoun } from "@/lib/platformDelete/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// Delete a published post from its platform (Instagram, YouTube, Facebook).
// GET  /api/posts/:id/platform-delete   what can be deleted, and why not where it cannot
// POST /api/posts/:id/platform-delete   { destinationId: string | null }   null = the legacy Instagram row
// The post and its accounts are the active Brand Workspace owner's. Any role
// may read the answer; only the owner or an admin may delete. SOCIA keeps the
// post in its record, marked deleted (lib/platformDelete).

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const { id } = await params;
  const item = await loadItem(ctx.client, id, ctx.ownerId).catch(() => null);
  if (!item) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const ids: (string | null)[] = item.destinations.length
    ? item.destinations.filter((d) => d.status === "published" && d.externalPostId).map((d) => d.id)
    : [null];
  const targets = [];
  for (const did of ids) {
    const r = await targetForDestination(ctx, id, did);
    if ("error" in r) continue;
    const capability = r.deletedAt ? null : await capabilityFor(ctx, r.target);
    targets.push({
      destinationId: r.target.destinationId,
      platform: r.target.platform,
      permalink: r.target.permalink,
      deletedAt: r.deletedAt,
      noun: deleteNoun(r.target.platform, r.format),
      capability,
    });
  }
  return NextResponse.json({ canDelete: can(ctx, "delete_on_platform"), targets });
}

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "delete_on_platform")) return NextResponse.json({ error: forbiddenCopy("delete_on_platform") }, { status: 403 });
  const { id } = await params;

  const body = (await req.json().catch(() => null)) as { destinationId?: unknown } | null;
  const destinationId = typeof body?.destinationId === "string" && body.destinationId ? body.destinationId : null;

  const limited = await perUserLimit(ctx.viewerId, "platform-delete", 30, "deleting posts");
  if (limited) return limited;

  const r = await targetForDestination(ctx, id, destinationId);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: r.status });
  if (r.deletedAt) return NextResponse.json({ deletedAt: r.deletedAt, gone: false });

  const outcome = await performPlatformDelete(ctx, r.target, { format: r.format });
  return outcomeResponse(outcome);
}
