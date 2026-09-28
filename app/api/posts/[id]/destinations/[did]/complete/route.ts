import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/planGuard";
import { loadItem, MissingTableError, MIGRATION_MESSAGE } from "@/lib/publishing/db";
import { loadAdapter, persistOutcome } from "@/lib/publishing/runner";
import type { PublishOutcome } from "@/lib/publishing/adapter";
import { CAPABILITIES } from "@/lib/publishing/capabilities";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";

export const runtime = "nodejs";

// POST /api/posts/:id/destinations/:did/complete: the browser finished an
// upload the server handed it (YouTube resumable session) and reports the
// external id, or reports that the upload itself failed. Owner/admin only
// (only they could have started the upload); the post and its accounts are
// the active Brand Workspace owner's.
//
//   { externalPostId }  the adapter confirms the id with the platform and says
//                       what is next. When only the confirmation fails, the id
//                       is kept and the cron polls it: the video exists.
//   { error }           the upload never produced an id; the row is failed and
//                       retryable so a person can start it again.

const NO_UPLOAD = "This destination has no upload in progress.";

/**
 * Confirmation failures that say nothing about the video itself: SOCIA could
 * not reach the platform, or the token could not (auth and scope failures,
 * which the adapter marks non-retryable because a retry needs a reconnect).
 */
const CONFIRMATION_ONLY: string[] = [
  "exception", "network", "no_connection", "needs_scope",
  "authError", "insufficientPermissions", "forbidden", "401",
];
/** Verdicts about the video: it is not there, or not on this channel. */
const GENUINE: string[] = ["not_found", "channel_mismatch"];

function keepsVideo(outcome: PublishOutcome): boolean {
  const code = outcome.errorCode ?? "";
  if (GENUINE.includes(code)) return false;
  return outcome.retryable === true || CONFIRMATION_ONLY.includes(code);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string; did: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });
  const { id, did } = await params;

  const body = (await req.json().catch(() => null)) as { externalPostId?: unknown; error?: unknown } | null;
  const externalPostId = typeof body?.externalPostId === "string" ? body.externalPostId.trim() : "";
  const uploadError = typeof body?.error === "string" ? body.error.trim().slice(0, 500) : "";
  if (!externalPostId && !uploadError) return NextResponse.json({ error: "externalPostId is required." }, { status: 400 });
  if (externalPostId.length > 200) return NextResponse.json({ error: "externalPostId is not valid." }, { status: 400 });

  const item = await loadItem(ctx.client, id, ctx.ownerId);
  if (!item) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const dest = item.destinations.find((d) => d.id === did);
  if (!dest) return NextResponse.json({ error: "Destination not found." }, { status: 404 });
  if (dest.status === "published") return NextResponse.json({ item });
  if (dest.status !== "uploading" && dest.status !== "processing") return NextResponse.json({ error: NO_UPLOAD }, { status: 409 });

  const g = await requireFeature(ctx.client, ctx.ownerId, "scheduling");
  if (g.denied) return g.denied;

  try {
    const now = new Date();

    // The browser could not finish the upload. Only an upload that never
    // produced an id is failed here; anything the platform already holds is
    // confirmed by polling instead.
    if (!externalPostId) {
      if (dest.status === "uploading" && !dest.externalPostId) {
        await persistOutcome(ctx.client, dest, { status: "failed", errorCode: "client_upload_failed", errorMessage: uploadError, retryable: true }, now);
      }
      const after = (await loadItem(ctx.client, id, ctx.ownerId)) ?? item;
      return NextResponse.json({ item: after });
    }

    const adapter = await loadAdapter(dest.platform);
    if (!adapter?.complete) {
      return NextResponse.json({ error: `${CAPABILITIES[dest.platform].label} uploads do not finish in the browser.` }, { status: 400 });
    }
    let outcome: PublishOutcome;
    try {
      outcome = await adapter.complete({ supabase: ctx.client, userId: ctx.ownerId, item, destination: dest, budgetMs: 15_000, now, interactive: true }, { externalPostId });
    } catch (e) {
      outcome = { status: "failed", errorCode: "exception", errorMessage: e instanceof Error ? e.message : "The platform could not be reached.", retryable: true };
    }
    // The video exists on the platform even when SOCIA could not confirm it
    // just now; the reported id is kept and the cron polls it. A genuine
    // verdict (no such video, wrong channel) stays failed.
    if (outcome.status === "failed" && !outcome.externalPostId && keepsVideo(outcome)) {
      outcome = { status: "processing", externalPostId, errorCode: outcome.errorCode ?? null, errorMessage: outcome.errorMessage ?? null };
    }
    await persistOutcome(ctx.client, dest, outcome, now);
    const after = (await loadItem(ctx.client, id, ctx.ownerId)) ?? item;
    return NextResponse.json({ item: after });
  } catch (e) {
    if (e instanceof MissingTableError) return NextResponse.json({ error: MIGRATION_MESSAGE }, { status: 409 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "The upload could not be confirmed." }, { status: 500 });
  }
}
