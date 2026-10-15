import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getEntitlements, checkFeature } from "@/lib/entitlements";
import { createServiceClient } from "@/lib/supabase/service";
import { loadItem, loadPickerAccountsDetailed } from "@/lib/publishing/db";
import { validateDestination, type Issue } from "@/lib/publishing/validate";
import { availabilityFor } from "@/lib/publishing/capabilities";
import { destinationKey } from "@/lib/publishing/types";
import { approvalRole, approvalsEnabled, insertApproval, latestForPost, memberEmails, notifyApprovers, NOTE_MAX } from "@/lib/approvals";

export const runtime = "nodejs";

// GET ?post=<id>  the viewer's part in approvals and the post's latest round.
// POST            a Member submits a post for approval (Pro).

async function setup() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) } as const;
  const ctx = await resolveContext(supabase, user.id);
  const ent = await getEntitlements(ctx.client, ctx.ownerId);
  const feature = checkFeature(ent, "approval_workflow");
  const svc = createServiceClient();
  return { ctx, ent, feature, svc } as const;
}

export async function GET(req: Request) {
  const s = await setup();
  if ("error" in s) return s.error;
  const { ctx, feature, svc } = s;
  const role = approvalRole(ctx, feature.ok);
  const postId = new URL(req.url).searchParams.get("post");
  if (!role || !svc || !(await approvalsEnabled(svc))) return NextResponse.json({ role: null, current: null });
  if (!postId) return NextResponse.json({ role, current: null });
  const current = await latestForPost(svc, ctx.ownerId, postId);
  if (current && ctx.workspace && current.workspaceId && current.workspaceId !== ctx.workspace.id) return NextResponse.json({ role, current: null });
  const emails = current ? await memberEmails(svc, current.workspaceId) : new Map<string, string>();
  return NextResponse.json({
    role,
    current: current ? { ...current, submittedByEmail: emails.get(current.submittedBy) ?? null, mine: current.submittedBy === ctx.viewerId } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const s = await setup();
  if ("error" in s) return s.error;
  const { ctx, feature, svc } = s;
  if (!feature.ok) return NextResponse.json(feature.error, { status: 403 });
  if (ctx.role !== "member") return NextResponse.json({ error: "Owners and admins publish directly; approval is for members." }, { status: 400 });
  if (!svc || !(await approvalsEnabled(svc))) return NextResponse.json({ error: "Approvals aren't set up on this server yet." }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { postId?: unknown; requestedAt?: unknown; note?: unknown } | null;
  const postId = typeof body?.postId === "string" ? body.postId : "";
  if (!postId) return NextResponse.json({ error: "Save the post first." }, { status: 400 });
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, NOTE_MAX) || null : null;
  let requestedAt: string | null = null;
  if (body?.requestedAt != null) {
    const t = new Date(String(body.requestedAt)).getTime();
    if (!Number.isFinite(t)) return NextResponse.json({ error: "The requested time isn't valid." }, { status: 400 });
    if (t <= Date.now()) return NextResponse.json({ error: "The requested time is in the past. Pick a later time, or ask for it to go out as soon as it's approved." }, { status: 400 });
    requestedAt = new Date(t).toISOString();
  }

  const item = await loadItem(ctx.client, postId, ctx.ownerId);
  if (!item) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const dests = item.destinations.filter((d) => d.status !== "cancelled" && d.status !== "published");
  if (!dests.length) return NextResponse.json({ error: "Choose at least one place to post it." }, { status: 400 });
  if (item.destinations.some((d) => ["scheduled", "uploading", "processing", "published"].includes(d.status))) {
    return NextResponse.json({ error: "This post is already scheduled or published." }, { status: 409 });
  }

  // The same checks scheduling runs, so an approver isn't the first to find a problem.
  const { accounts, complete } = await loadPickerAccountsDetailed(ctx.client, ctx.ownerId, ctx.workspace?.id);
  if (!complete) return NextResponse.json({ error: "SOCIA could not read the connected accounts just now. Try again in a moment." }, { status: 503 });
  const now = new Date();
  const issues: Record<string, Issue[]> = {};
  let blocked = false;
  for (const d of dests) {
    const a = accounts.find((x) => x.platform === d.platform && x.accountId === d.accountId) ?? null;
    const av = availabilityFor(d.platform, a ? { status: a.status, suspended: a.suspended, scopes: a.scopes } : null);
    if (av.state !== "available") return NextResponse.json({ error: av.reason }, { status: 400 });
    const r = validateDestination({ platform: d.platform, media: item.media, masterCaption: item.caption, settings: d.settings, scheduledAt: requestedAt, requireFutureTime: Boolean(requestedAt), now });
    if (r.issues.length) issues[destinationKey(d.platform, d.accountId)] = r.issues;
    if (r.level === "blocked") blocked = true;
  }
  if (blocked) return NextResponse.json({ error: "Some destinations aren't ready yet.", issues }, { status: 400 });

  const ins = await insertApproval(svc, { postId, workspaceId: ctx.workspace?.id ?? null, ownerId: ctx.ownerId, submittedBy: ctx.viewerId, requestedAt, submitNote: note });
  if (!ins.ok) return NextResponse.json({ error: ins.pending ? "This post is already waiting for approval." : "SOCIA couldn't submit it. Try again." }, { status: ins.pending ? 409 : 500 });
  await notifyApprovers(svc, ins.approval);
  return NextResponse.json({ approval: ins.approval });
}
