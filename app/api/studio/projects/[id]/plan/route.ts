import { NextResponse } from "next/server";
import { checkFeature, getEntitlements } from "@/lib/entitlements";
import { requireFeature } from "@/lib/planGuard";
import { getActiveConnection, getIgSnapshot } from "@/lib/instagramSync";
import { interactionsTotal } from "@/lib/engagement";
import { formatOf } from "@/lib/overview";
import { scopeToWorkspace } from "@/lib/workspaces";
import { can } from "@/lib/context";
import type { TimedPost } from "@/lib/postingTimes";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { clipRows, getProjectRow } from "@/lib/studioClips/server";
import type { CalendarPost, PlanOpportunity } from "@/lib/studioClips/distribute";
import { HORIZON_DAYS } from "@/lib/studioClips/distribute";
import type { Edl } from "@/lib/studioClips/types";

export const runtime = "nodejs";

// Plan These Posts (Phase D).
//   GET  -> what the browser needs to plan in the viewer's own time zone:
//           the project's post ideas (with any build, draft and render), what
//           is already on the calendar for the next two weeks, the account's
//           dated Instagram posts, and whether this plan may place drafts.
//   POST { placements: [{ idx, at }] } -> Growth/Pro: one DRAFT per post in
//           the Calendar at the chosen time (an existing draft for that post
//           is moved, a rendered video is attached). Nothing is scheduled or
//           published here; each draft is reviewed in Create Post.

type BuildLite = { id: string; opportunity_idx: number; post_id: string | null; render_path: string | null; caption: string | null; edl: Edl | null };

async function projectBuilds(client: Parameters<typeof clipRows>[0], ownerId: string, projectId: string): Promise<BuildLite[]> {
  const { data, error } = await client.from("studio_builds").select("id, opportunity_idx, post_id, render_path, caption, edl").eq("user_id", ownerId).eq("project_id", projectId);
  if (error) throw error;
  return (data ?? []) as BuildLite[];
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const wsId = ctx.workspace?.id ?? null;
  try {
    const project = await getProjectRow(ctx.client, ctx.ownerId, wsId, id);
    if (!project) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    const opps = project.yield?.opportunities ?? [];
    const now = new Date();
    const until = new Date(now.getTime() + (HORIZON_DAYS + 2) * 86400_000);
    const [rows, builds, ent, snap, cal] = await Promise.all([
      clipRows(ctx.client, project.id),
      projectBuilds(ctx.client, ctx.ownerId, project.id),
      getEntitlements(ctx.client, ctx.ownerId),
      getIgSnapshot(ctx.client, ctx.ownerId, wsId).catch(() => null),
      scopeToWorkspace(ctx.client.from("scheduled_posts").select("id, scheduled_at, caption, status").eq("user_id", ctx.ownerId), wsId)
        .gte("scheduled_at", now.toISOString()).lte("scheduled_at", until.toISOString()).order("scheduled_at", { ascending: true }).limit(200),
    ]);
    const tagsOf = new Map(rows.map((c) => [c.id, c.card?.tags ?? []]));
    const own = new Set(builds.map((b) => b.post_id).filter(Boolean));
    const ownPosts = new Map<string, { status: string; at: string }>();
    const existing: CalendarPost[] = [];
    for (const p of (cal.data ?? []) as { id: string; scheduled_at: string; caption: string | null; status: string }[]) {
      if (own.has(p.id)) { ownPosts.set(p.id, { status: p.status, at: p.scheduled_at }); continue; }
      if (p.status === "cancelled" || p.status === "failed") continue;
      const first = (p.caption ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "Untitled post";
      existing.push({ id: p.id, at: p.scheduled_at, label: first.length > 48 ? `${first.slice(0, 47)}…` : first });
    }
    const opportunities = opps.map((o) => {
      const b = builds.find((x) => x.opportunity_idx === o.idx) ?? null;
      const tags = Array.from(new Set(o.clipIds.flatMap((c) => tagsOf.get(c) ?? []))).slice(0, 20);
      const post = b?.post_id ? ownPosts.get(b.post_id) ?? null : null;
      return {
        idx: o.idx, title: o.title, angle: o.angle, strength: o.strength, clipIds: o.clipIds, tags,
        build: b ? { id: b.id, postId: b.post_id, postStatus: post?.status ?? null, postAt: post?.at ?? null, rendered: Boolean(b.render_path), caption: b.caption ?? b.edl?.caption ?? null } : null,
      } satisfies PlanOpportunity & Record<string, unknown>;
    });
    const history: TimedPost[] | null = snap
      ? (snap.media ?? []).filter((m) => m.timestamp).map((m) => ({ id: m.id ?? m.timestamp!, t: m.timestamp!, e: interactionsTotal(m), format: formatOf(m) }))
      : null;
    const check = checkFeature(ent, "plan_posts");
    return NextResponse.json({
      opportunities, existing, history,
      canPlace: check.ok && can(ctx, "publish"),
      planError: check.ok ? null : check.error,
    });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  const wsId = ctx.workspace?.id ?? null;
  const body = (await req.json().catch(() => null)) as { placements?: { idx?: unknown; at?: unknown }[] } | null;
  const now = Date.now();
  const placements = (Array.isArray(body?.placements) ? body!.placements : [])
    .map((p) => ({ idx: Number(p?.idx), at: typeof p?.at === "string" ? new Date(p.at) : null }))
    .filter((p): p is { idx: number; at: Date } => Number.isInteger(p.idx) && p.idx >= 0 && p.at != null && !Number.isNaN(p.at.getTime()))
    .slice(0, 30);
  if (!placements.length) return NextResponse.json({ error: "Nothing to plan." }, { status: 400 });
  if (placements.some((p) => p.at.getTime() < now + 5 * 60_000 || p.at.getTime() > now + 62 * 86400_000)) {
    return NextResponse.json({ error: "Every post needs a time in the next two months." }, { status: 400 });
  }
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "plan_posts");
    if (denied) return denied;
    const project = await getProjectRow(ctx.client, ctx.ownerId, wsId, id);
    if (!project) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    const known = new Set((project.yield?.opportunities ?? []).map((o) => o.idx));
    const builds = await projectBuilds(ctx.client, ctx.ownerId, project.id);
    const conn = (await getActiveConnection(ctx.client, ctx.ownerId, "ig_user_id", wsId)) as { ig_user_id?: string } | null;

    const results: { idx: number; postId: string | null; status: "created" | "moved" | "kept"; note: string | null }[] = [];
    for (const p of placements) {
      if (!known.has(p.idx)) { results.push({ idx: p.idx, postId: null, status: "kept", note: "That post isn't in this project's results." }); continue; }
      const b = builds.find((x) => x.opportunity_idx === p.idx);
      if (!b) { results.push({ idx: p.idx, postId: null, status: "kept", note: "Its edit guide hasn't been written yet." }); continue; }
      // A draft that already exists for this post moves; anything past draft is left alone.
      if (b.post_id) {
        const { data: cur } = await ctx.client.from("scheduled_posts").select("id, status").eq("id", b.post_id).eq("user_id", ctx.ownerId).maybeSingle();
        const row = cur as { id: string; status: string } | null;
        if (row && row.status !== "draft") { results.push({ idx: p.idx, postId: row.id, status: "kept", note: `Already ${row.status}; left where it is.` }); continue; }
        if (row) {
          const { error } = await ctx.client.from("scheduled_posts").update({ scheduled_at: p.at.toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id).eq("user_id", ctx.ownerId);
          if (error) throw error;
          results.push({ idx: p.idx, postId: row.id, status: "moved", note: null });
          continue;
        }
      }
      const media = b.render_path ? { media_path: b.render_path, media_url: ctx.client.storage.from("scheduled-media").getPublicUrl(b.render_path).data.publicUrl } : {};
      const draft: Record<string, unknown> = {
        user_id: ctx.ownerId,
        ig_user_id: conn?.ig_user_id ?? null,
        scheduled_at: p.at.toISOString(),
        caption: (b.caption ?? b.edl?.caption ?? "").slice(0, 2200),
        media_type: "REELS",
        status: "draft",
        source: "studio",
        ...media,
      };
      let ins = wsId
        ? await ctx.client.from("scheduled_posts").insert({ ...draft, workspace_id: wsId }).select("id").single()
        : await ctx.client.from("scheduled_posts").insert(draft).select("id").single();
      // Older databases may lack `source` (or, before workspaces, workspace_id): drop the
      // optional column first, and the workspace only as a last resort.
      if (ins.error) {
        const { source: _s, ...plain } = draft; void _s;
        ins = wsId ? await ctx.client.from("scheduled_posts").insert({ ...plain, workspace_id: wsId }).select("id").single() : await ctx.client.from("scheduled_posts").insert(plain).select("id").single();
        if (ins.error && wsId) ins = await ctx.client.from("scheduled_posts").insert(plain).select("id").single();
      }
      if (ins.error) throw ins.error;
      const postId = (ins.data as { id: string }).id;
      const { error: linkErr } = await ctx.client.from("studio_builds").update({ post_id: postId }).eq("id", b.id).eq("user_id", ctx.ownerId);
      if (linkErr) throw linkErr;
      results.push({ idx: p.idx, postId, status: "created", note: b.render_path ? null : "No video yet: make it in the builder or add media in Create Post." });
    }
    return NextResponse.json({ results });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
