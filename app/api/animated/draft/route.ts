import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy } from "@/lib/context";
import { requireFeature } from "@/lib/planGuard";
import { getActiveConnection } from "@/lib/instagramSync";
import { isMissingColumnError, scopeToWorkspace } from "@/lib/workspaces";
import { isOwnPath } from "@/lib/storagePaths";
import { stampPostAuthor } from "@/lib/teamWorkServer";
import { dbErrorResponse } from "@/lib/dbError";

export const runtime = "nodejs";

// POST { path, caption, planId?, planDay?, voice? } | { path, postId, voice? } -> { postId, href, post? }
// An animated "Make it with AI" video this browser rendered and uploaded to
// scheduled-media/<uid>/animated/: save it as a DRAFT post (never scheduled or
// published from here; the person reviews it in Create Post), tied to its plan
// day when it came from one. With postId, the video goes onto that Calendar
// draft instead, which keeps its day, time and caption. `voice` ({ id, name })
// is the voice its voiceover was read in, kept on the post so SOCIA can later
// compare how each voice's videos performed (lib/animated/voicePick.ts).
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });
  const { denied } = await requireFeature(ctx.client, ctx.ownerId, "auto_build");
  if (denied) return denied;
  const b = (await req.json().catch(() => null)) as { path?: unknown; caption?: unknown; planId?: unknown; planDay?: unknown; postId?: unknown; voice?: { id?: unknown; name?: unknown } | null } | null;
  const voiceId = typeof b?.voice?.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(b.voice.id) ? b.voice.id : null;
  const voice = voiceId ? { voice_id: voiceId, voice_name: (typeof b?.voice?.name === "string" ? b.voice.name.replace(/\s+/g, " ").trim().slice(0, 60) : "") || "Voice" } : null;
  // The voice is a note on the post: when its columns aren't there yet (supabase/post-voices.sql), the video is still saved.
  const noteVoice = async (id: string) => {
    if (!voice) return;
    const { error } = await scopeToWorkspace(ctx.client.from("scheduled_posts").update(voice).eq("id", id).eq("user_id", ctx.ownerId), ctx.workspace?.id ?? null);
    if (error && !isMissingColumnError(error)) console.error("[animated/draft] noting the voice failed:", error.message);
  };
  const path = typeof b?.path === "string" ? b.path : "";
  if (!path || !isOwnPath(path, [user.id]) || path.split("/")[1] !== "animated" || !/\.mp4$/.test(path)) return NextResponse.json({ error: "That media file is not yours." }, { status: 403 });
  const postId = typeof b?.postId === "string" && /^[0-9a-f-]{36}$/i.test(b.postId) ? b.postId : null;
  if (postId) {
    const { data } = await scopeToWorkspace(ctx.client.from("scheduled_posts").select("id, status, media_path").eq("id", postId).eq("user_id", ctx.ownerId), ctx.workspace?.id ?? null).maybeSingle();
    const cur = data as { status: string; media_path: string | null } | null;
    if (!cur) return NextResponse.json({ error: "That draft no longer exists." }, { status: 404 });
    if (cur.status !== "draft" || cur.media_path) return NextResponse.json({ error: "That draft changed while the video was being made. Open it in Create Post to add the video." }, { status: 409 });
    const { data: pub } = ctx.client.storage.from("scheduled-media").getPublicUrl(path);
    const { data: post, error } = await scopeToWorkspace(
      ctx.client.from("scheduled_posts").update({ media_path: path, media_url: pub.publicUrl, media_type: "REELS", updated_at: new Date().toISOString() }).eq("id", postId).eq("user_id", ctx.ownerId).eq("status", "draft"),
      ctx.workspace?.id ?? null,
    ).select("*").maybeSingle();
    if (error) return dbErrorResponse("animated/draft", error);
    if (!post) return NextResponse.json({ error: "That draft changed while the video was being made. Open it in Create Post to add the video." }, { status: 409 });
    await noteVoice(postId);
    return NextResponse.json({ postId, post, href: `/create?post=${encodeURIComponent(postId)}&from=ai` });
  }
  const caption = typeof b?.caption === "string" ? b.caption.slice(0, 2200) : "";
  let planId = typeof b?.planId === "string" && /^[0-9a-f-]{36}$/i.test(b.planId) ? b.planId : null;
  const planDay = typeof b?.planDay === "string" ? b.planDay.slice(0, 20) : null;
  if (planId) {
    const { data } = await scopeToWorkspace(ctx.client.from("plans").select("id").eq("id", planId).eq("user_id", ctx.ownerId), ctx.workspace?.id ?? null).maybeSingle();
    if (!data) planId = null;
  }
  const conn = (await getActiveConnection(ctx.client, ctx.ownerId, "ig_user_id", ctx.workspace?.id ?? null).catch(() => null)) as { ig_user_id?: string } | null;
  const { data: pub } = ctx.client.storage.from("scheduled-media").getPublicUrl(path);
  // A placeholder slot a day out, on the hour: the person picks the real time in Create Post.
  const when = new Date(Date.now() + 24 * 3600_000);
  when.setUTCMinutes(0, 0, 0);
  const draft: Record<string, unknown> = {
    user_id: ctx.ownerId, ig_user_id: conn?.ig_user_id ?? null, scheduled_at: when.toISOString(),
    caption, media_type: "REELS", media_path: path, media_url: pub.publicUrl, status: "draft",
    ...(planId ? { plan_id: planId, plan_day: planDay } : {}),
  };
  let ins = ctx.workspace
    ? await ctx.client.from("scheduled_posts").insert({ ...draft, workspace_id: ctx.workspace.id }).select("id").single()
    : await ctx.client.from("scheduled_posts").insert(draft).select("id").single();
  if (ins.error && ctx.workspace && isMissingColumnError(ins.error)) ins = await ctx.client.from("scheduled_posts").insert(draft).select("id").single();
  if (ins.error) return dbErrorResponse("animated/draft", ins.error);
  const newId = (ins.data as { id: string }).id;
  await stampPostAuthor(ctx.client, ctx.ownerId, newId, user.id);
  await noteVoice(newId);
  return NextResponse.json({ postId: newId, href: `/create?post=${encodeURIComponent(newId)}&from=ai` });
}
