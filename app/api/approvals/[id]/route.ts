import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { getEntitlements, checkFeature } from "@/lib/entitlements";
import { requireFeature } from "@/lib/planGuard";
import { createServiceClient } from "@/lib/supabase/service";
import { loadItem, loadPickerAccountsDetailed, refreshParent, updateDestination } from "@/lib/publishing/db";
import { validateDestination, type Issue } from "@/lib/publishing/validate";
import { availabilityFor } from "@/lib/publishing/capabilities";
import { destinationKey } from "@/lib/publishing/types";
import { publishNow } from "@/lib/publishing/runner";
import { approvalsEnabled, closeApproval, getApproval, notifySubmitter, NOTE_MAX } from "@/lib/approvals";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST { action: "approve", at?: ISO | "now" }  owner/admin: schedule it (that is the approval)
// POST { action: "return", note }              owner/admin: send it back with a note
// POST { action: "withdraw" }                  the member who submitted it: take it back to edit

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  const feature = checkFeature(ent, "approval_workflow");
  if (!feature.ok) return NextResponse.json(feature.error, { status: 403 });
  const svc = createServiceClient();
  if (!svc || !(await approvalsEnabled(svc))) return NextResponse.json({ error: "Approvals aren't set up on this server yet." }, { status: 503 });

  const { id } = await params;
  const a = await getApproval(svc, ctx.ownerId, id);
  if (!a || (ctx.workspace && a.workspaceId && a.workspaceId !== ctx.workspace.id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (a.status !== "pending") return NextResponse.json({ error: "This has already been decided." }, { status: 409 });

  const body = (await req.json().catch(() => null)) as { action?: unknown; at?: unknown; note?: unknown } | null;
  const action = body?.action;

  if (action === "withdraw") {
    if (a.submittedBy !== ctx.viewerId) return NextResponse.json({ error: "Only the person who submitted it can withdraw it." }, { status: 403 });
    const done = await closeApproval(svc, ctx.ownerId, a.id, { status: "withdrawn", decidedBy: ctx.viewerId, onlySubmitter: ctx.viewerId });
    return done ? NextResponse.json({ approval: done }) : NextResponse.json({ error: "This has already been decided." }, { status: 409 });
  }

  if (!can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });

  if (action === "return") {
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, NOTE_MAX) : "";
    if (!note) return NextResponse.json({ error: "Say what should change, so the member knows what to fix." }, { status: 400 });
    const done = await closeApproval(svc, ctx.ownerId, a.id, { status: "changes_requested", decidedBy: ctx.viewerId, reviewNote: note });
    if (!done) return NextResponse.json({ error: "This has already been decided." }, { status: 409 });
    await notifySubmitter(svc, done);
    return NextResponse.json({ approval: done });
  }

  if (action !== "approve") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const g = await requireFeature(ctx.client, ctx.ownerId, "scheduling");
  if (g.denied) return g.denied;
  const item = await loadItem(ctx.client, a.postId, ctx.ownerId, ctx.workspace?.id ?? null);
  if (!item) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const pending = item.destinations.filter((d) => d.status !== "published" && d.status !== "cancelled");
  if (!pending.length) return NextResponse.json({ error: "Nothing left to schedule on this post." }, { status: 409 });
  // YouTube's upload runs in the approver's browser: finish there.
  if (pending.some((d) => d.platform === "youtube")) {
    return NextResponse.json({ error: "This post goes to YouTube, whose upload runs in your browser. Open it to approve and schedule.", openComposer: `/create?post=${encodeURIComponent(a.postId)}` }, { status: 409 });
  }

  const now = new Date();
  let at: string | "now";
  if (body?.at === "now") at = "now";
  else {
    const raw = body?.at ?? a.requestedAt;
    const t = raw ? new Date(String(raw)).getTime() : NaN;
    if (!Number.isFinite(t)) return NextResponse.json({ error: "Choose when it should go out." }, { status: 400 });
    if (t <= now.getTime()) return NextResponse.json({ error: "That time has passed. Choose a later time, or publish it now." }, { status: 400 });
    at = new Date(t).toISOString();
  }

  const { accounts, complete } = await loadPickerAccountsDetailed(ctx.client, ctx.ownerId, ctx.workspace?.id);
  if (!complete) return NextResponse.json({ error: "SOCIA could not read the connected accounts just now. Try again in a moment." }, { status: 503 });
  const issues: Record<string, Issue[]> = {};
  let blocked = false;
  for (const d of pending) {
    const acc = accounts.find((x) => x.platform === d.platform && x.accountId === d.accountId) ?? null;
    const av = availabilityFor(d.platform, acc ? { status: acc.status, suspended: acc.suspended, scopes: acc.scopes } : null);
    if (av.state !== "available") return NextResponse.json({ error: av.reason }, { status: 400 });
    const r = validateDestination({ platform: d.platform, media: item.media, masterCaption: item.caption, settings: d.settings, scheduledAt: at === "now" ? null : at, requireFutureTime: at !== "now", now });
    if (r.issues.length) issues[destinationKey(d.platform, d.accountId)] = r.issues;
    if (r.level === "blocked") blocked = true;
  }
  if (blocked) return NextResponse.json({ error: "Some destinations aren't ready to schedule.", issues }, { status: 400 });

  const when = at === "now" ? now.toISOString() : at;
  for (const d of pending) {
    await updateDestination(ctx.client, d.id, { status: "scheduled", scheduledAt: when, errorCode: null, errorMessage: null, nextRetryAt: null, retryCount: 0 });
    d.status = "scheduled"; d.scheduledAt = when;
  }
  await refreshParent(ctx.client, a.postId);
  if (at === "now") await publishNow(ctx.client, ctx.ownerId, item, pending, 40_000).catch(() => null);

  const done = await closeApproval(svc, ctx.ownerId, a.id, { status: "approved", decidedBy: ctx.viewerId, scheduledFor: at === "now" ? null : at });
  if (done) await notifySubmitter(svc, done);
  return NextResponse.json({ approval: done, scheduledFor: at === "now" ? null : at });
}
