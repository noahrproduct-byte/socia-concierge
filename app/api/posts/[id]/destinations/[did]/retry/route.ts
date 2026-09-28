import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/planGuard";
import { loadItem, updateDestination, MissingTableError, MIGRATION_MESSAGE } from "@/lib/publishing/db";
import { publishDestination, publishNow } from "@/lib/publishing/runner";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/posts/:id/destinations/:did/retry: run one destination again,
// now, with a clean error and a fresh retry budget. A failed row and an
// upload the browser never finished (uploading, no external id) can be
// retried. A row the platform already holds is never uploaded again: its
// status is refreshed by polling instead. Owner/admin only; the post and its
// accounts are the active Brand Workspace owner's.

const ALREADY_THERE = "This video is already on the platform; SOCIA will confirm it.";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; did: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });
  const { id, did } = await params;

  const item = await loadItem(ctx.client, id, ctx.ownerId);
  if (!item) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const dest = item.destinations.find((d) => d.id === did);
  if (!dest) return NextResponse.json({ error: "Destination not found." }, { status: 404 });

  const g = await requireFeature(ctx.client, ctx.ownerId, "scheduling");
  if (g.denied) return g.denied;

  try {
    if (dest.externalPostId) {
      if (dest.status === "published") return NextResponse.json({ error: ALREADY_THERE, item }, { status: 409 });
      await publishDestination({ supabase: ctx.client, userId: ctx.ownerId, item, destination: dest, budgetMs: 15_000, now: new Date(), interactive: true });
      const after = (await loadItem(ctx.client, id, ctx.ownerId)) ?? item;
      return NextResponse.json({ error: ALREADY_THERE, item: after }, { status: 409 });
    }
    const interrupted = dest.status === "uploading";
    if (dest.status !== "failed" && !interrupted) {
      return NextResponse.json({ error: "Only a failed destination can be retried." }, { status: 409 });
    }

    const nowIso = new Date().toISOString();
    await updateDestination(ctx.client, dest.id, { status: "scheduled", scheduledAt: nowIso, errorCode: null, errorMessage: null, nextRetryAt: null, retryCount: 0 });
    const fresh = { ...dest, status: "scheduled" as const, scheduledAt: nowIso, errorCode: null, errorMessage: null, nextRetryAt: null, retryCount: 0 };
    const { uploads } = await publishNow(ctx.client, ctx.ownerId, item, [fresh], 40_000);
    const after = (await loadItem(ctx.client, id, ctx.ownerId)) ?? item;
    return NextResponse.json({ item: after, uploads });
  } catch (e) {
    if (e instanceof MissingTableError) return NextResponse.json({ error: MIGRATION_MESSAGE }, { status: 409 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "The retry could not start." }, { status: 500 });
  }
}
