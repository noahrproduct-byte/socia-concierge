import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/planGuard";
import { destinationKey } from "@/lib/publishing/types";
import { validateDestination, type Issue } from "@/lib/publishing/validate";
import { loadItem, updateDestination, MissingTableError, MIGRATION_MESSAGE } from "@/lib/publishing/db";
import { publishNow } from "@/lib/publishing/runner";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/posts/:id/publish: publish every destination that is not yet
// published, now. Drafts are validated server-side first; a blocked one is
// answered with its issues and nothing is started. Owner/admin only; the post
// and its accounts are the active Brand Workspace owner's.

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });
  const { id } = await params;

  const item = await loadItem(ctx.client, id, ctx.ownerId);
  if (!item) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (!item.destinations.length) {
    return NextResponse.json({ error: "This post has no destinations; publish it from the Calendar." }, { status: 409 });
  }
  const g = await requireFeature(ctx.client, ctx.ownerId, "scheduling");
  if (g.denied) return g.denied;

  const pending = item.destinations.filter((d) => d.status !== "published" && d.status !== "cancelled");
  if (!pending.length) return NextResponse.json({ error: "Already published." }, { status: 409 });

  const now = new Date();
  const issues: Record<string, Issue[]> = {};
  let blocked = false;
  for (const d of pending) {
    if (d.status === "uploading" || d.status === "processing") continue; // the platform holds it; polled below
    const r = validateDestination({
      platform: d.platform, media: item.media, masterCaption: item.caption, settings: d.settings,
      scheduledAt: d.scheduledAt, requireFutureTime: false, now,
    });
    if (r.issues.length) issues[destinationKey(d.platform, d.accountId)] = r.issues;
    if (r.level === "blocked") blocked = true;
  }
  if (blocked) return NextResponse.json({ error: "Some destinations are not ready to publish.", issues }, { status: 400 });

  try {
    const nowIso = now.toISOString();
    for (const d of pending) {
      if (d.status === "uploading" || d.status === "processing") continue;
      // A YouTube row already uploaded keeps its external id and is polled, not re-uploaded.
      await updateDestination(ctx.client, d.id, { status: "scheduled", scheduledAt: nowIso, errorCode: null, errorMessage: null, nextRetryAt: null, retryCount: 0 });
      d.status = "scheduled"; d.scheduledAt = nowIso; d.errorCode = null; d.errorMessage = null; d.nextRetryAt = null; d.retryCount = 0;
    }
    const { uploads } = await publishNow(ctx.client, ctx.ownerId, item, pending, 40_000);
    const after = (await loadItem(ctx.client, id, ctx.ownerId)) ?? item;
    return NextResponse.json({ item: after, uploads });
  } catch (e) {
    if (e instanceof MissingTableError) return NextResponse.json({ error: MIGRATION_MESSAGE }, { status: 409 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Publishing could not start." }, { status: 500 });
  }
}
