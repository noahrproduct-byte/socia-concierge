import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { requireUsage } from "@/lib/planGuard";
import { perUserLimit } from "@/lib/rateLimit";
import { scopeToWorkspace } from "@/lib/workspaces";
import { readSpec, writeAnimatedSpec, type AnimatedSource } from "@/lib/animated/write";
import { aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/aiStatus";
import type { Deliverable } from "@/lib/schema";

export const runtime = "nodejs";
// Writing a storyboard, the meaning check, and at most one rewrite.
export const maxDuration = 300;

// "Make it with AI", animated style: the scenes for one post of a saved
// content plan, or for a Calendar draft that is waiting for its video (written
// from the draft's own caption). Counts one animated video, its own monthly
// allowance so a daily animated plan fits (given back if writing fails); the person then previews it, edits the words, and renders it
// in the browser.
//   POST { planId, index } | { postId } -> { spec }
//   With { change, current }: the owner's own words for what to change in the version they saw.
//   A change doesn't count as another animated video; it has its own hourly limit.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });
  const raw = await req.text();
  if (raw.length > 40_000) return NextResponse.json({ error: "That request is too long." }, { status: 413 });
  let b: { planId?: unknown; index?: unknown; postId?: unknown; change?: unknown; current?: unknown } | null = null;
  try { b = JSON.parse(raw); } catch { b = null; }
  const change = typeof b?.change === "string" ? b.change.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  // The version they saw, only as context for the change, cleaned like any model answer.
  const current = change && b?.current ? readSpec(b.current, JSON.stringify(b.current).slice(0, 20_000)) : null;
  const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
  const planId = uuid(b?.planId);
  const postId = uuid(b?.postId);
  const index = typeof b?.index === "number" && Number.isInteger(b.index) && b.index >= 0 ? b.index : null;
  if (!postId && (!planId || index == null)) return NextResponse.json({ error: "Say which post to make." }, { status: 400 });
  const limited = change
    ? await perUserLimit(ctx.ownerId, "animated_change", 15, "changes to animated videos")
    : await perUserLimit(ctx.ownerId, "animated_script", 30, "animated videos");
  if (limited) return limited;
  let source: AnimatedSource;
  if (postId) {
    const { data } = await scopeToWorkspace(ctx.client.from("scheduled_posts").select("id, caption, status, media_path").eq("id", postId).eq("user_id", ctx.ownerId), ctx.workspace?.id ?? null).maybeSingle();
    const draft = data as { caption: string | null; status: string; media_path: string | null } | null;
    if (!draft) return NextResponse.json({ error: "That draft no longer exists." }, { status: 404 });
    if (draft.status !== "draft") return NextResponse.json({ error: "Only a draft can get a video made for it." }, { status: 409 });
    if (draft.media_path) return NextResponse.json({ error: "This draft already has its video." }, { status: 409 });
    const text = (draft.caption ?? "").replace(/#[\p{L}\p{N}_]+/gu, "").trim();
    if (!text) return NextResponse.json({ error: "This draft has no text to make a video from. Write its caption first." }, { status: 400 });
    const [first, ...rest] = text.split(/\n+/);
    source = { hook: first.trim(), concept: rest.join(" ").trim() || first.trim() };
  } else {
    const { data } = await scopeToWorkspace(ctx.client.from("plans").select("id, data").eq("id", planId!).eq("user_id", ctx.ownerId), ctx.workspace?.id ?? null).maybeSingle();
    const post = (data as { data: Deliverable } | null)?.data?.weeklyPlan?.[index!];
    if (!post) return NextResponse.json({ error: "That plan post no longer exists." }, { status: 404 });
    if (!post.hook?.trim() && !post.concept?.trim()) return NextResponse.json({ error: "This post has no hook or concept to make a video from." }, { status: 400 });
    source = { title: post.title, hook: post.hook ?? "", concept: post.concept ?? "", direction: post.direction, purpose: post.purpose, audience: post.audience };
  }
  // A change to a video already made doesn't use another animated video; a new one does.
  const u = change ? null : await requireUsage(ctx.client, ctx.ownerId, "animated_videos", { feature: "auto_build" });
  if (u?.denied) return u.denied;
  try {
    const spec = await writeAnimatedSpec(ctx, source, change ? { change, current } : {});
    return NextResponse.json({ spec });
  } catch (e) {
    await u?.release();
    const status = (e as { status?: number }).status;
    if (status && status >= 400 && status < 600) return NextResponse.json({ error: (e as Error).message }, { status });
    console.error("[animated/script]", (e as Error)?.message ?? e);
    const kind = aiFailureKind(e);
    return NextResponse.json({ error: kind === "failed" ? "SOCIA couldn't write that video. Try again." : AI_UNAVAILABLE_COPY[kind] }, { status: 500 });
  }
}
