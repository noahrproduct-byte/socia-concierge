import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveConnection } from "@/lib/instagramSync";
import { readiness, type MediaType, type PostStatus } from "@/lib/scheduling";
import { getEntitlements, canUseFeature, checkFeature, type Entitlements } from "@/lib/entitlements";
import type { PlanError } from "@/lib/planErrors";
import { PLANS, type PlanId } from "@/lib/plans";
import { resolveContext, can, forbiddenCopy, type Ctx } from "@/lib/context";
import { scopeToWorkspace } from "@/lib/workspaces";

export const runtime = "nodejs";

// Scheduled posts: the active Brand Workspace's queue. Rows belong to the
// workspace owner and are read and written as the owner through ctx.client,
// so a team member sees and edits the owner's calendar. A row becomes
// `scheduled` only when it has media, a caption and a future time — the
// server decides that, so the calendar can never show "scheduled" for a post
// that could not actually go out.
//
// Plans and roles: a plan without the scheduling feature (Free) keeps a
// calendar of drafts but never gets a `scheduled` row, whatever the client
// asks for; so does a Member, whose edits stay drafts until the owner or an
// admin schedules them. The response carries `plan` so the Calendar can say
// why a ready post stayed a draft.

type PlanInfo = { canSchedule: boolean; error: PlanError | null };

/** A Member's answer in the shape the Calendar already renders for a plan answer. */
function roleNotice(plan: PlanId): PlanError {
  return {
    error: forbiddenCopy("publish"),
    code: "feature_locked", plan, planName: PLANS[plan].name,
    requiredPlan: null, requiredPlanName: null,
    cta: "Workspace settings", href: "/settings",
  };
}

function planInfo(ent: Entitlements, ctx: Ctx): PlanInfo {
  const check = checkFeature(ent, "scheduling");
  if (!check.ok) return { canSchedule: false, error: check.error };
  const roleOk = can(ctx, "publish");
  return { canSchedule: canUseFeature(ent, "scheduling") && roleOk, error: roleOk ? null : roleNotice(ent.plan) };
}

/** Media lives under its uploader's folder of the bucket: the viewer's, or the
 *  workspace owner's for a file the owner attached. Anything else is not ours. */
const ownsPath = (ctx: Ctx, path: string | null | undefined): boolean =>
  !path || path.startsWith(`${ctx.viewerId}/`) || path.startsWith(`${ctx.ownerId}/`);
const NOT_YOURS = "That media file is not yours.";

type Body = {
  id?: string;
  scheduled_at?: string;
  caption?: string;
  media_type?: MediaType;
  media_path?: string | null;
  media_url?: string | null;
  plan_id?: string | null;
  plan_day?: string | null;
  status?: PostStatus;
  /** Keep the row a draft even when it has everything it needs to publish;
   *  the user schedules it deliberately from the Calendar. */
  keep_draft?: boolean;
  items?: Body[];
};

const MEDIA_TYPES: MediaType[] = ["REELS", "IMAGE"];
const BUCKET = "scheduled-media";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

/** The URL Instagram fetches, derived from the stored path; a client's media_url is never accepted as sent. */
const publicUrlFor = (supabase: Supa, path: string | null | undefined): string | null =>
  path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;

function promote(
  row: { media_url: string | null; scheduled_at: string; caption: string; status: PostStatus },
  canSchedule: boolean,
): PostStatus {
  // Terminal / in-flight states are never rewritten by an edit.
  if (row.status === "published" || row.status === "publishing" || row.status === "cancelled") return row.status;
  // A plan without scheduling never writes "scheduled", ready or not.
  if (!canSchedule) return "draft";
  return readiness(row).ready ? "scheduled" : "draft";
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);

  const u = new URL(req.url);
  const from = u.searchParams.get("from");
  const to = u.searchParams.get("to");
  let q = scopeToWorkspace(
    ctx.client
      .from("scheduled_posts")
      .select("*")
      .eq("user_id", ctx.ownerId)
      .neq("status", "cancelled"),
    ctx.workspace?.id,
  )
    .order("scheduled_at", { ascending: true })
    .limit(400);
  if (from) q = q.gte("scheduled_at", from);
  if (to) q = q.lt("scheduled_at", to);
  const { data, error } = await q;
  if (error) {
    // Table may not exist yet — the calendar renders its empty state.
    return NextResponse.json({ posts: [], unavailable: true });
  }
  return NextResponse.json({ posts: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const ctx = await resolveContext(supabase, user.id);

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const [conn, ent] = await Promise.all([
    getActiveConnection(ctx.client, ctx.ownerId, "ig_user_id", ctx.workspace?.id ?? null) as Promise<{ ig_user_id?: string } | null>,
    getEntitlements(ctx.client, ctx.ownerId),
  ]);
  const igUserId = conn?.ig_user_id ?? null;
  const plan = planInfo(ent, ctx);

  const items = body.items?.length ? body.items : [body];
  const rows = [];
  for (const it of items) {
    const when = it.scheduled_at ? new Date(it.scheduled_at) : null;
    if (!when || Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: "Each post needs a valid scheduled_at." }, { status: 400 });
    }
    if (!ownsPath(ctx, it.media_path)) return NextResponse.json({ error: NOT_YOURS }, { status: 403 });
    const mediaType: MediaType = MEDIA_TYPES.includes(it.media_type as MediaType) ? (it.media_type as MediaType) : "REELS";
    const draft = {
      user_id: ctx.ownerId,
      ig_user_id: igUserId,
      plan_id: it.plan_id ?? null,
      plan_day: it.plan_day ?? null,
      scheduled_at: when.toISOString(),
      caption: (it.caption ?? "").slice(0, 2200),
      media_type: mediaType,
      media_path: it.media_path ?? null,
      media_url: publicUrlFor(supabase, it.media_path),
      status: "draft" as PostStatus,
    };
    draft.status = it.keep_draft || body.keep_draft ? "draft" : promote({ ...draft, status: "draft" }, plan.canSchedule);
    rows.push(draft);
  }

  // A plan's day is placed once per time slot: re-running "Schedule this week"
  // on the same plan adds nothing and says so, instead of duplicating drafts.
  let skipped = 0;
  const planIds = [...new Set(rows.map((r) => r.plan_id).filter((x): x is string => Boolean(x)))];
  if (planIds.length) {
    const { data: existing } = await scopeToWorkspace(
      ctx.client
        .from("scheduled_posts")
        .select("plan_id, plan_day, scheduled_at")
        .eq("user_id", ctx.ownerId)
        .in("plan_id", planIds)
        .neq("status", "cancelled"),
      ctx.workspace?.id,
    );
    const taken = new Set(((existing ?? []) as { plan_id: string | null; plan_day: string | null; scheduled_at: string }[]).map((e) => `${e.plan_id}|${(e.plan_day ?? "").toLowerCase()}|${new Date(e.scheduled_at).toISOString()}`));
    const before = rows.length;
    const kept = rows.filter((r) => !r.plan_id || !taken.has(`${r.plan_id}|${(r.plan_day ?? "").toLowerCase()}|${r.scheduled_at}`));
    skipped = before - kept.length;
    rows.length = 0;
    rows.push(...kept);
  }
  if (!rows.length) return NextResponse.json({ posts: [], skipped, plan });

  // Tagged with the workspace they were made in. Best-effort: when the
  // `workspace_id` column is missing (workspaces migration not run yet) the
  // rows are saved without it, as before.
  let { data, error } = ctx.workspace
    ? await ctx.client.from("scheduled_posts").insert(rows.map((r) => ({ ...r, workspace_id: ctx.workspace!.id }))).select("*")
    : await ctx.client.from("scheduled_posts").insert(rows).select("*");
  if (error && ctx.workspace) ({ data, error } = await ctx.client.from("scheduled_posts").insert(rows).select("*"));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data ?? [], skipped, plan });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const ctx = await resolveContext(supabase, user.id);

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.id) return NextResponse.json({ error: "id required." }, { status: 400 });

  const { data: cur, error: readErr } = await scopeToWorkspace(
    ctx.client
      .from("scheduled_posts")
      .select("*")
      .eq("id", body.id)
      .eq("user_id", ctx.ownerId),
    ctx.workspace?.id,
  ).maybeSingle();
  if (readErr || !cur) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (cur.status === "published") return NextResponse.json({ error: "Published posts can't be edited." }, { status: 409 });

  const plan = planInfo(await getEntitlements(ctx.client, ctx.ownerId), ctx);

  const next: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.scheduled_at) {
    const when = new Date(body.scheduled_at);
    if (Number.isNaN(when.getTime())) return NextResponse.json({ error: "Invalid time." }, { status: 400 });
    next.scheduled_at = when.toISOString();
  }
  if (typeof body.caption === "string") next.caption = body.caption.slice(0, 2200);
  if (body.media_type && MEDIA_TYPES.includes(body.media_type)) next.media_type = body.media_type;
  if (body.media_path !== undefined) {
    if (!ownsPath(ctx, body.media_path)) return NextResponse.json({ error: NOT_YOURS }, { status: 403 });
    next.media_path = body.media_path;
    next.media_url = publicUrlFor(supabase, body.media_path);
  }
  if (body.status === "cancelled") next.status = "cancelled";

  // Re-derive status from the facts; a failed post that gets new media or a
  // new time goes back to scheduled with a clean slate.
  if (next.status !== "cancelled" && body.keep_draft && (cur.status === "draft" || cur.status === "failed")) {
    next.status = "draft";
    if (cur.status === "failed") { next.error = null; next.container_id = null; }
  } else if (next.status !== "cancelled") {
    const merged = {
      media_url: (next.media_url as string | null | undefined) ?? cur.media_url,
      scheduled_at: (next.scheduled_at as string | undefined) ?? cur.scheduled_at,
      caption: (next.caption as string | undefined) ?? cur.caption,
      status: (cur.status === "failed" ? "draft" : cur.status) as PostStatus,
    };
    next.status = promote(merged, plan.canSchedule);
    if (cur.status === "failed") { next.error = null; next.container_id = null; }
    // A draft the publisher demoted for plan reasons carries that sentence in
    // `error`; once it can be scheduled again the note has served its purpose.
    if (cur.status === "draft" && next.status === "scheduled" && cur.error) next.error = null;
  }

  const { data, error } = await scopeToWorkspace(
    ctx.client
      .from("scheduled_posts")
      .update(next)
      .eq("id", body.id)
      .eq("user_id", ctx.ownerId),
    ctx.workspace?.id,
  )
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data, plan });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);

  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  if (!body?.id) return NextResponse.json({ error: "id required." }, { status: 400 });

  // Remove the media object too, so the bucket doesn't accumulate orphans.
  // Only a file under the viewer's or the owner's folder is ever removed.
  const { data: cur } = await scopeToWorkspace(
    ctx.client
      .from("scheduled_posts")
      .select("media_path, status")
      .eq("id", body.id)
      .eq("user_id", ctx.ownerId),
    ctx.workspace?.id,
  ).maybeSingle();
  if (cur?.status === "published") return NextResponse.json({ error: "Published posts stay in the record." }, { status: 409 });
  if (cur?.media_path && ownsPath(ctx, cur.media_path)) {
    await ctx.client.storage.from("scheduled-media").remove([cur.media_path]).catch(() => null);
  }

  const { error } = await scopeToWorkspace(
    ctx.client.from("scheduled_posts").delete().eq("id", body.id).eq("user_id", ctx.ownerId),
    ctx.workspace?.id,
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
