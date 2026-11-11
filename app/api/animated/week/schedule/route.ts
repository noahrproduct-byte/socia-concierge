import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { requireFeature } from "@/lib/planGuard";
import { getEntitlements, canUseFeature } from "@/lib/entitlements";
import { getActiveConnection } from "@/lib/instagramSync";
import { scopeToWorkspace, isMissingColumnError } from "@/lib/workspaces";
import { isOwnPath } from "@/lib/storagePaths";
import { readiness, type PostStatus } from "@/lib/scheduling";
import { stampPostAuthor } from "@/lib/teamWorkServer";
import { dbErrorResponse } from "@/lib/dbError";

export const runtime = "nodejs";
export const maxDuration = 60;

type Item = { index: number; day: string; path: string; caption: string; scheduledAt: string };

// "Generate animated videos", the last step: the person reviewed the week's
// videos and pressed Schedule all. Each video goes onto its plan day:
// - a draft already on the Calendar for that day with no media gets the video
//   (it keeps its time, and its caption when it has one);
// - a day that already has media, or is scheduled or posted, is left alone;
// - otherwise a new post is made at the time the page worked out.
// Each is scheduled when the plan includes scheduling and the post is ready
// (video, caption, a future time); otherwise it stays a draft.
//   POST { planId, items: [{ index, day, path, caption, scheduledAt }] } -> { scheduled, drafts, skipped }
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });
  const { denied } = await requireFeature(ctx.client, ctx.ownerId, "auto_build");
  if (denied) return denied;
  const b = (await req.json().catch(() => null)) as { planId?: unknown; items?: unknown } | null;
  const planId = typeof b?.planId === "string" && /^[0-9a-f-]{36}$/i.test(b.planId) ? b.planId : null;
  if (!planId) return NextResponse.json({ error: "Say which plan." }, { status: 400 });
  const { data: plan } = await scopeToWorkspace(ctx.client.from("plans").select("id").eq("id", planId).eq("user_id", ctx.ownerId), ctx.workspace?.id ?? null).maybeSingle();
  if (!plan) return NextResponse.json({ error: "That plan no longer exists." }, { status: 404 });
  const items: Item[] = [];
  for (const r of (Array.isArray(b?.items) ? b.items : []).slice(0, 7) as Record<string, unknown>[]) {
    const path = typeof r?.path === "string" ? r.path : "";
    if (!isOwnPath(path, [user.id]) || path.split("/")[1] !== "animated" || !/\.mp4$/.test(path)) return NextResponse.json({ error: "That media file is not yours." }, { status: 403 });
    const at = typeof r.scheduledAt === "string" ? new Date(r.scheduledAt) : null;
    if (!at || Number.isNaN(at.getTime())) return NextResponse.json({ error: "Each video needs a valid time." }, { status: 400 });
    items.push({ index: Number(r.index), day: String(r.day ?? "").slice(0, 20), path, caption: typeof r.caption === "string" ? r.caption.slice(0, 2200) : "", scheduledAt: at.toISOString() });
  }
  if (!items.length) return NextResponse.json({ error: "There are no videos to schedule." }, { status: 400 });

  const [ent, conn] = await Promise.all([
    getEntitlements(ctx.client, ctx.ownerId),
    getActiveConnection(ctx.client, ctx.ownerId, "ig_user_id", ctx.workspace?.id ?? null).catch(() => null) as Promise<{ ig_user_id?: string } | null>,
  ]);
  const canSchedule = canUseFeature(ent, "scheduling");
  const statusFor = (row: { media_url: string | null; scheduled_at: string; caption: string }): PostStatus => (canSchedule && readiness(row).ready ? "scheduled" : "draft");

  const { data: existingRows } = await scopeToWorkspace(
    ctx.client.from("scheduled_posts").select("id, plan_day, status, media_path, caption, scheduled_at").eq("user_id", ctx.ownerId).eq("plan_id", planId).neq("status", "cancelled"),
    ctx.workspace?.id ?? null,
  );
  const existing = (existingRows ?? []) as { id: string; plan_day: string | null; status: string; media_path: string | null; caption: string; scheduled_at: string }[];

  let scheduled = 0, drafts = 0;
  const skipped: string[] = [];
  for (const it of items) {
    const media_url = ctx.client.storage.from("scheduled-media").getPublicUrl(it.path).data.publicUrl as string;
    const same = existing.filter((e) => (e.plan_day ?? "").toLowerCase() === it.day.toLowerCase());
    if (same.some((e) => e.media_path || e.status !== "draft")) { skipped.push(it.day); continue; }
    if (same.length) {
      const cur = same[0];
      const caption = cur.caption?.trim() ? cur.caption : it.caption;
      const status = statusFor({ media_url, scheduled_at: cur.scheduled_at, caption });
      const { error } = await scopeToWorkspace(
        ctx.client.from("scheduled_posts").update({ media_path: it.path, media_url, media_type: "REELS", caption, status, updated_at: new Date().toISOString() }).eq("id", cur.id).eq("user_id", ctx.ownerId).eq("status", "draft"),
        ctx.workspace?.id ?? null,
      );
      if (error) return dbErrorResponse("animated/week/schedule", error);
      if (status === "scheduled") scheduled++; else drafts++;
      continue;
    }
    const row = {
      user_id: ctx.ownerId, ig_user_id: conn?.ig_user_id ?? null, plan_id: planId, plan_day: it.day,
      scheduled_at: it.scheduledAt, caption: it.caption, media_type: "REELS", media_path: it.path, media_url,
      status: statusFor({ media_url, scheduled_at: it.scheduledAt, caption: it.caption }),
    };
    let ins = ctx.workspace
      ? await ctx.client.from("scheduled_posts").insert({ ...row, workspace_id: ctx.workspace.id }).select("id").single()
      : await ctx.client.from("scheduled_posts").insert(row).select("id").single();
    if (ins.error && ctx.workspace && isMissingColumnError(ins.error)) ins = await ctx.client.from("scheduled_posts").insert(row).select("id").single();
    if (ins.error) return dbErrorResponse("animated/week/schedule", ins.error);
    await stampPostAuthor(ctx.client, ctx.ownerId, (ins.data as { id: string }).id, user.id);
    if (row.status === "scheduled") scheduled++; else drafts++;
  }
  return NextResponse.json({ scheduled, drafts, skipped, canSchedule });
}
