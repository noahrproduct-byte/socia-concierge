import { NextResponse } from "next/server";
import { checkFeature, getEntitlements } from "@/lib/entitlements";
import { getIgSnapshot } from "@/lib/instagramSync";
import { interactionsTotal } from "@/lib/engagement";
import { formatOf } from "@/lib/overview";
import { scopeToWorkspace } from "@/lib/workspaces";
import { can } from "@/lib/context";
import type { TimedPost } from "@/lib/postingTimes";
import { loadPickerAccountsDetailed } from "@/lib/publishing/db";
import { studioRequest, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { getProjectRow } from "@/lib/studioClips/server";
import type { CalendarPost } from "@/lib/studioClips/distribute";
import { BATCH_HORIZON_DAYS } from "@/lib/studioClips/batch";

export const runtime = "nodejs";

// Make and schedule (Growth/Pro): what the browser needs to make every video
// in a project and spread them over the coming days in the viewer's own time
// zone. Read only: the videos are made in the browser and each one is
// scheduled through POST /api/posts after the person reviews the list.
//   GET -> { existing, history, builds, accounts, accountsComplete, canSchedule, planError, roleBlocked }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const wsId = ctx.workspace?.id ?? null;
  try {
    const project = await getProjectRow(ctx.client, ctx.ownerId, wsId, id);
    if (!project) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    const now = new Date();
    const until = new Date(now.getTime() + (BATCH_HORIZON_DAYS + 2) * 86400_000);
    const [ent, snap, cal, picker, builds] = await Promise.all([
      getEntitlements(ctx.client, ctx.ownerId),
      getIgSnapshot(ctx.client, ctx.ownerId, wsId).catch(() => null),
      scopeToWorkspace(ctx.client.from("scheduled_posts").select("id, scheduled_at, caption, status").eq("user_id", ctx.ownerId), wsId)
        .gte("scheduled_at", now.toISOString()).lte("scheduled_at", until.toISOString()).order("scheduled_at", { ascending: true }).limit(500),
      loadPickerAccountsDetailed(ctx.client, ctx.ownerId, wsId ?? undefined),
      scopeToWorkspace(ctx.client.from("studio_builds").select("id, opportunity_idx, render_path, post_id").eq("user_id", ctx.ownerId).eq("project_id", project.id), wsId),
    ]);
    // Each cut already made, with the state of its post: a scheduled or published one is left alone.
    const buildRows = (builds.data ?? []) as { id: string; opportunity_idx: number; render_path: string | null; post_id: string | null }[];
    const postIds = buildRows.map((b) => b.post_id).filter((x): x is string => Boolean(x));
    const statuses = new Map<string, string>();
    if (postIds.length) {
      const { data: rows } = await scopeToWorkspace(ctx.client.from("scheduled_posts").select("id, status").eq("user_id", ctx.ownerId).in("id", postIds), wsId);
      for (const p of (rows ?? []) as { id: string; status: string }[]) statuses.set(p.id, p.status);
    }
    // Scheduled and published posts hold their slot; drafts don't (they publish nothing).
    const existing: CalendarPost[] = ((cal.data ?? []) as { id: string; scheduled_at: string; caption: string | null; status: string }[])
      .filter((p) => p.status === "scheduled" || p.status === "publishing" || p.status === "published")
      .map((p) => {
        const first = (p.caption ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "Untitled post";
        return { id: p.id, at: p.scheduled_at, label: first.length > 48 ? `${first.slice(0, 47)}…` : first };
      });
    const history: TimedPost[] | null = snap
      ? (snap.media ?? []).filter((m) => m.timestamp).map((m) => ({ id: m.id ?? m.timestamp!, t: m.timestamp!, e: interactionsTotal(m), format: formatOf(m) }))
      : null;
    // The first gate that fails is the one the person is told about.
    const gate = [checkFeature(ent, "auto_build"), checkFeature(ent, "scheduling")].find((c) => !c.ok);
    return NextResponse.json({
      existing, history,
      builds: buildRows.map((b) => ({ idx: b.opportunity_idx, id: b.id, renderPath: b.render_path, postId: b.post_id, postStatus: b.post_id ? statuses.get(b.post_id) ?? null : null })),
      accounts: picker.accounts, accountsComplete: picker.complete,
      canSchedule: !gate && can(ctx, "publish"),
      planError: gate && !gate.ok ? gate.error : null,
      roleBlocked: !can(ctx, "publish"),
    });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
