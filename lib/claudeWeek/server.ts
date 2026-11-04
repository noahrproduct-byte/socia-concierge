// The person's own Claude makes the weekly plan's videos (Growth Profile:
// "Who makes the videos"). Through SOCIA's MCP server it reads the week
// (videosToMake), asks for a one-time upload link (startVideoUpload), uploads
// the finished file from the person's computer, and submits it (submitVideo).
// SOCIA keeps it as a draft at its planned time, marked "waiting" for review;
// the owner or an Admin approves it (reviewVideos), which schedules it.
// Nothing posts before that. Needs supabase/claude-week.sql.
//
// Server only.

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ctx } from "../context";
import { brandWorkspace, can, forbiddenCopy } from "../context";
import { currentDetail } from "../intel/understandLoad";
import type { Entitlements } from "../entitlements";
import { canUseFeature, checkFeature } from "../entitlements";
import type { Deliverable } from "../schema";
import type { PlanItem } from "../planItems";
import { isItemId, platformName, withItemIds } from "../planItems";
import { scopeToWorkspace, isMissingColumnError } from "../workspaces";
import { isOwnPath } from "../storagePaths";
import { isTimeZone } from "../weeklyPlanJob";
import { interactionsTotal } from "../engagement";
import { formatOf } from "../overview";
import { recommendedWindows } from "../publishing/timing";
import { availabilityFor } from "../publishing/capabilities";
import { validateDestination, type Issue } from "../publishing/validate";
import { loadItem, loadPickerAccountsDetailed, refreshParent, saveItem, stampPostWorkspace, updateDestination } from "../publishing/db";
import { PLATFORM_LABEL, type MediaItem, type Platform } from "../publishing/types";
import type { CreatePostPayload } from "../publishing/composer";
import { readPresets } from "../studioClips/styleStore";
import { ApiFailure } from "../api/context";
import { appOrigin } from "../oauth/config";
import { loadSources } from "../api/sources";
import { MEDIA_BUCKET } from "../api/media";
import { cancelPost, pickAccounts, settingsFor } from "../api/write";
import { approvalTime, plannedTime, type DayWindow } from "./schedule";

type Supa = SupabaseClient;

const appLink = (path: string) => `${appOrigin()}${path}`;

/** The largest video Claude may upload. */
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };
/** Instagram's caption limit, the strictest of the platforms SOCIA schedules. */
const CAPTION_MAX = 2200;
/** Platforms an approved video can be scheduled to from the review (YouTube's upload runs in the browser; TikTok can't be scheduled). */
const SCHEDULABLE: Platform[] = ["instagram", "facebook"];
const MIGRATION = "SOCIA needs a database update before Claude can hand in videos (supabase/claude-week.sql). The person can ask SOCIA's support, or run it if they host SOCIA.";

export type VideoStatus = "to_make" | "waiting_for_review" | "changes_requested" | "approved";

type PlanRow = { id: string; data: Deliverable; created_at: string };
type PostRow = { id: string; plan_item_id: string | null; review_status: string | null; review_note: string | null; status: string; scheduled_at: string | null; updated_at: string | null };

const PLATFORM_ID: Record<string, Platform> = { Instagram: "instagram", Facebook: "facebook", YouTube: "youtube", TikTok: "tiktok" };

/** The workspace's newest plan, with an id on every post (saved back once when an older plan had none). */
async function latestPlan(ctx: Ctx): Promise<PlanRow | null> {
  const wsId = ctx.workspace?.id ?? null;
  const { data } = await scopeToWorkspace(ctx.client.from("plans").select("id, data, created_at").eq("user_id", ctx.ownerId), wsId).order("created_at", { ascending: false }).limit(1);
  const row = (data?.[0] as PlanRow | undefined) ?? null;
  if (!row) return null;
  const items = row.data.weeklyPlan ?? [];
  if (items.every((it) => isItemId(it.id))) return row;
  const weeklyPlan = withItemIds(items);
  const next = { ...row.data, weeklyPlan };
  await scopeToWorkspace(ctx.client.from("plans").update({ data: next }).eq("id", row.id).eq("user_id", ctx.ownerId), wsId);
  return { ...row, data: next };
}

/** The owner's time zone (set from their browser), or UTC. */
async function ownerZone(ctx: Ctx): Promise<string> {
  const { data } = await ctx.client.from("profiles").select("brand_detail").eq("user_id", ctx.ownerId).maybeSingle();
  const tz = (data as { brand_detail?: { timezone?: string } } | null)?.brand_detail?.timezone;
  return tz && isTimeZone(tz) ? tz : "UTC";
}

/** The account's best posting windows (from its own Instagram history); none when the plan or the history doesn't allow it. */
async function bestWindows(ctx: Ctx, ent: Entitlements, tz: string): Promise<DayWindow[]> {
  if (!canUseFeature(ent, "posting_time_analysis")) return [];
  try {
    const src = await loadSources(ctx, ent, { platforms: ["instagram"] });
    if (!src.ig) return [];
    const timed = src.ig.media.filter((m) => m.timestamp).map((m) => ({ id: m.id ?? m.timestamp!, t: m.timestamp!, e: interactionsTotal(m), format: formatOf(m) }));
    return recommendedWindows(timed, src.now, tz).best.map((w) => ({ day: w.day, block: w.block, rel: w.rel }));
  } catch {
    return [];
  }
}

/** The posts already handed in for this plan, newest first; null before the migration. */
async function handedIn(ctx: Ctx, planId: string): Promise<PostRow[] | null> {
  const { data, error } = await scopeToWorkspace(
    ctx.client.from("scheduled_posts").select("id, plan_item_id, review_status, review_note, status, scheduled_at, updated_at").eq("user_id", ctx.ownerId).eq("plan_id", planId).not("plan_item_id", "is", null),
    ctx.workspace?.id ?? null,
  ).order("updated_at", { ascending: false });
  if (error) {
    if (isMissingColumnError(error)) return null;
    throw error;
  }
  return ((data ?? []) as PostRow[]).filter((p) => p.status !== "cancelled");
}

const statusOf = (p: PostRow | undefined): VideoStatus =>
  !p ? "to_make" : p.review_status === "rejected" ? "changes_requested" : p.review_status === "approved" || p.status === "scheduled" || p.status === "published" ? "approved" : "waiting_for_review";

const forClaude = (it: PlanItem) => it.maker === "claude" && it.decision?.status !== "rejected";

/** The week's posts for the person's Claude to make, with everything it needs. */
export async function videosToMake(ctx: Ctx, ent: Entitlements): Promise<Record<string, unknown>> {
  const plan = await latestPlan(ctx);
  if (!plan) return { plan: null, videos: [], note: "This workspace has no Content Plan yet. It's made in SOCIA (Content Plan), and every Sunday on paid plans.", open_in_socia: appLink("/plan") };
  const items = (plan.data.weeklyPlan ?? []).filter(forClaude);
  if (!items.length) {
    return {
      plan: { id: plan.id, created_at: plan.created_at }, videos: [],
      note: `No post in this week's plan is for Claude to make. The person chooses "My Claude makes them" or "A mix" under Who makes your videos in SOCIA (${appLink("/settings#growth")}); the next plan marks the posts.`,
    };
  }
  const tz = await ownerZone(ctx);
  const [windows, posts, presets] = await Promise.all([bestWindows(ctx, ent, tz), handedIn(ctx, plan.id), readPresets(ctx).catch(() => null)]);
  if (posts === null) throw new ApiFailure("unavailable", MIGRATION);
  // The brand this workspace is: a second brand keeps its own details, the default one the profile's.
  const ws = brandWorkspace(ctx);
  const detail = await currentDetail(ctx);
  const brand = ws ? { brand_name: ws.brand_name, niche: ws.niche } : ((await ctx.client.from("profiles").select("brand_name, niche").eq("user_id", ctx.ownerId).maybeSingle()).data as { brand_name?: string | null; niche?: string | null } | null);
  const growth = detail.growth ?? {};
  const style = presets?.brand?.style ?? null;
  const now = Date.now();
  const videos = items.map((it) => {
    const post = posts.find((p) => p.plan_item_id === it.id);
    const status = statusOf(post);
    const platform = platformName(it.platform) ?? "Instagram";
    const at = plannedTime(new Date(plan.created_at), it.day, tz, windows);
    return {
      item_id: it.id,
      status,
      review_note: status === "changes_requested" ? post?.review_note ?? null : null,
      day: it.day,
      goes_out_at: at,
      already_passed: at ? Date.parse(at) <= now : null,
      platform,
      can_schedule_after_review: SCHEDULABLE.includes(PLATFORM_ID[platform]),
      format: it.format,
      size: /carousel/i.test(it.format) ? { width: 1080, height: 1350 } : { width: 1080, height: 1920 },
      title: it.title ?? null,
      concept: it.concept,
      hook: it.hook,
      direction: it.direction ?? null,
      production: it.production ?? null,
      audience: it.audience ?? null,
      purpose: it.purpose ?? null,
      success_metric: it.successMetric ?? null,
      guide: it.guide ? { length_sec: it.guide.length_sec, structure: it.guide.structure, script: it.guide.script, shots: it.guide.shots, editing: it.guide.editing, caption: it.guide.caption, ctas: it.guide.ctas } : null,
    };
  });
  return {
    plan: { id: plan.id, created_at: plan.created_at, headline: plan.data.headline ?? null },
    time_zone: tz,
    brand: {
      name: brand?.brand_name || ctx.workspace?.name || null,
      niche: brand?.niche ?? null,
      voice: detail.voice ?? null,
      about: detail.description ?? null,
      avoid: detail.avoid ?? null,
      font: style?.font ?? null,
      accent_colour: style?.accent ?? null,
      allowed_styles: growth.resources?.claude_styles?.length ? growth.resources.claude_styles : ["animated", "kinetic_text"],
    },
    videos,
    how_to_hand_in: "For each video with status to_make or changes_requested: make it at the given size (MP4, H.264, 30 fps, at most 200 MB), call start_video_upload, upload the file with an HTTP PUT to upload_url, then call submit_video with the path and a caption. SOCIA keeps it for the person to review; approving schedules it at goes_out_at. Nothing is posted until they approve.",
    open_in_socia: appLink("/plan/calendar"),
  };
}

async function claudeItem(ctx: Ctx, itemId: string): Promise<{ plan: PlanRow; item: PlanItem }> {
  if (!isItemId(itemId)) throw new ApiFailure("invalid_input", "item_id isn't one of this week's posts. Use an item_id from get_videos_to_make.");
  const plan = await latestPlan(ctx);
  const item = plan?.data.weeklyPlan?.find((it) => it.id === itemId);
  if (!plan || !item) throw new ApiFailure("not_found", "That post isn't in this workspace's current Content Plan. Call get_videos_to_make for this week's posts.");
  if (!forClaude(item)) throw new ApiFailure("invalid_input", "That post is for the person to make, not Claude.");
  return { plan, item };
}

const folderFor = (ctx: Ctx, planId: string, itemId: string) => `${ctx.ownerId}/claude-week/${planId}/${itemId}`;

/** A one-time link to upload one finished video, valid for two hours. */
export async function startVideoUpload(ctx: Ctx, svc: Supa, input: { item_id: string; mime: string; size_bytes: number }): Promise<Record<string, unknown>> {
  const { plan, item } = await claudeItem(ctx, input.item_id);
  const ext = VIDEO_TYPES[input.mime];
  if (!ext) throw new ApiFailure("invalid_input", "Upload an MP4, MOV or WebM video (mime video/mp4, video/quicktime or video/webm).");
  if (!Number.isFinite(input.size_bytes) || input.size_bytes <= 0) throw new ApiFailure("invalid_input", "size_bytes must be the file's size in bytes.");
  if (input.size_bytes > MAX_VIDEO_BYTES) throw new ApiFailure("invalid_input", `Videos can be at most ${MAX_VIDEO_BYTES / (1024 * 1024)} MB. Export it smaller (a 30-second 1080x1920 H.264 file is usually 10 to 40 MB).`);
  const posts = await handedIn(ctx, plan.id);
  if (posts === null) throw new ApiFailure("unavailable", MIGRATION);
  if (statusOf(posts.find((p) => p.plan_item_id === item.id)) === "approved") throw new ApiFailure("invalid_input", "The person already approved a video for this post.");
  const path = `${folderFor(ctx, plan.id, item.id!)}/${randomUUID()}.${ext}`;
  const { data, error } = await svc.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data?.signedUrl) throw new ApiFailure("unavailable", "SOCIA couldn't prepare the upload just now. Try again in a moment.");
  return {
    item_id: item.id,
    path,
    upload_url: data.signedUrl,
    method: "PUT",
    content_type: input.mime,
    expires_in_seconds: 7200,
    example: `curl -X PUT -H "Content-Type: ${input.mime}" --data-binary @video.${ext} "<upload_url>"`,
    next: "When the upload finishes, call submit_video with this item_id and path.",
  };
}

/** Hand in an uploaded video: a draft at its planned time, waiting for the person's review. Replaces an earlier one for the same post. */
export async function submitVideo(ctx: Ctx, svc: Supa, ent: Entitlements, input: { item_id: string; path: string; caption: string; title?: string; account_id?: string }): Promise<Record<string, unknown>> {
  const { plan, item } = await claudeItem(ctx, input.item_id);
  const caption = typeof input.caption === "string" ? input.caption.trim() : "";
  if (!caption) throw new ApiFailure("invalid_input", "Write the caption the post should go out with.");
  if (caption.length > CAPTION_MAX) throw new ApiFailure("invalid_input", `The caption is ${caption.length} characters; Instagram allows ${CAPTION_MAX}.`);
  const folder = folderFor(ctx, plan.id, item.id!);
  const path = typeof input.path === "string" ? input.path : "";
  const name = path.slice(folder.length + 1);
  if (!path.startsWith(`${folder}/`) || !isOwnPath(path, [ctx.ownerId]) || !/^[0-9a-f-]{36}\.(mp4|mov|webm)$/.test(name)) {
    throw new ApiFailure("invalid_input", "path must be the one start_video_upload returned for this post.");
  }
  const posts = await handedIn(ctx, plan.id);
  if (posts === null) throw new ApiFailure("unavailable", MIGRATION);
  const earlier = posts.filter((p) => p.plan_item_id === item.id);
  if (earlier.some((p) => statusOf(p) === "approved")) throw new ApiFailure("invalid_input", "The person already approved a video for this post.");

  // The file itself, as stored: it must be there, a video, and within the cap.
  const { data: listed, error: listErr } = await svc.storage.from(MEDIA_BUCKET).list(folder, { search: name, limit: 5 });
  const obj = (listed ?? []).find((o) => o.name === name) as { metadata?: { size?: number; mimetype?: string } } | undefined;
  if (listErr || !obj) throw new ApiFailure("invalid_input", "SOCIA hasn't received that upload. Finish the PUT to upload_url (or start a new upload if it's more than two hours old), then submit again.");
  const size = Number(obj.metadata?.size ?? 0);
  const mime = String(obj.metadata?.mimetype ?? "");
  if (size > MAX_VIDEO_BYTES || !mime.startsWith("video/")) {
    await svc.storage.from(MEDIA_BUCKET).remove([path]).catch(() => undefined);
    throw new ApiFailure("invalid_input", size > MAX_VIDEO_BYTES ? `The upload is over ${MAX_VIDEO_BYTES / (1024 * 1024)} MB and was removed. Export it smaller and upload again.` : "The upload isn't a video and was removed.");
  }

  const platform = PLATFORM_ID[platformName(item.platform) ?? "Instagram"];
  const { accounts } = await loadPickerAccountsDetailed(ctx.client, ctx.ownerId, ctx.workspace?.id);
  let picked;
  try {
    picked = pickAccounts([{ platform, ...(input.account_id ? { account_id: input.account_id } : {}) }], accounts)[0];
  } catch (e) {
    if (e instanceof ApiFailure) throw e;
    throw new ApiFailure("invalid_input", `This post is for ${PLATFORM_LABEL[platform]}, which isn't connected in this workspace. The person can connect it in SOCIA (${appLink("/settings#accounts")}).`);
  }
  const tz = await ownerZone(ctx);
  const at = plannedTime(new Date(plan.created_at), item.day, tz, await bestWindows(ctx, ent, tz));
  const media: MediaItem = { id: randomUUID(), kind: "video", name: item.title ?? item.day, mime, size, width: null, height: null, duration: null, path, url: svc.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl };
  const dest = { platform, ...(platform === "instagram" || platform === "facebook" ? { format: "reel" as const } : {}), ...(platform === "youtube" && input.title ? { title: input.title.slice(0, 100) } : {}) };
  const payload: CreatePostPayload = {
    id: null, caption, media: [media], scheduledAt: at, source: "assistant", planId: plan.id, planDay: item.day,
    customizePerPlatform: false, action: "draft",
    destinations: [{ platform, accountId: picked.account.accountId, settings: settingsFor(dest, [media]), scheduledAt: at }],
  };
  const saved = await saveItem(ctx.client, ctx.ownerId, payload, "draft");
  await stampPostWorkspace(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, saved.id);
  const { error: markErr } = await ctx.client.from("scheduled_posts").update({ plan_item_id: item.id, review_status: "waiting", review_note: null }).eq("id", saved.id).eq("user_id", ctx.ownerId);
  if (markErr) {
    await cancelPost(ctx, saved.id).catch(() => undefined);
    throw isMissingColumnError(markErr) ? new ApiFailure("unavailable", MIGRATION) : markErr;
  }
  // The earlier video for this post is replaced: it never went out (only approved ones are scheduled).
  for (const p of earlier) await cancelPost(ctx, p.id).catch(() => undefined);
  return {
    item_id: item.id,
    post_id: saved.id,
    result: "waiting_for_review",
    goes_out_at: at,
    platform: PLATFORM_LABEL[platform],
    replaced: earlier.length,
    note: "Saved for the person to review. It is scheduled only when they approve it in SOCIA; nothing was posted.",
    open_in_socia: appLink("/plan/calendar"),
  };
}

export type ReviewResult = { post_id: string; ok: boolean; status?: "approved" | "rejected"; scheduled_for?: string; error?: string; issues?: Record<string, Issue[]>; open?: string };

/** The owner or an Admin approves (schedules) or sends back videos Claude handed in. */
export async function reviewVideos(ctx: Ctx, ent: Entitlements, input: { post_ids: string[]; action: "approve" | "reject"; note?: string | null }, now = new Date()): Promise<ReviewResult[]> {
  if (!can(ctx, "publish")) throw new ApiFailure("forbidden", forbiddenCopy("publish"));
  if (input.action === "approve") {
    const sched = checkFeature(ent, "scheduling");
    if (!sched.ok) throw new ApiFailure("forbidden", sched.error.error);
  }
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().replace(/\u2014/g, ",").slice(0, 500) : null;
  const ids = [...new Set(input.post_ids)].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 21);
  if (!ids.length) throw new ApiFailure("invalid_input", "Choose at least one video.");
  const { data: rows, error } = await scopeToWorkspace(
    ctx.client.from("scheduled_posts").select("id, review_status").eq("user_id", ctx.ownerId).in("id", ids),
    ctx.workspace?.id ?? null,
  );
  if (error) {
    if (isMissingColumnError(error)) throw new ApiFailure("unavailable", MIGRATION);
    throw error;
  }
  const waiting = new Set(((rows ?? []) as { id: string; review_status: string | null }[]).filter((r) => r.review_status === "waiting").map((r) => r.id));
  const accountsP = input.action === "approve" ? loadPickerAccountsDetailed(ctx.client, ctx.ownerId, ctx.workspace?.id) : null;
  const out: ReviewResult[] = [];
  for (const id of ids) {
    if (!waiting.has(id)) { out.push({ post_id: id, ok: false, error: "This video isn't waiting for review." }); continue; }
    if (input.action === "reject") {
      await ctx.client.from("scheduled_posts").update({ review_status: "rejected", review_note: note }).eq("id", id).eq("user_id", ctx.ownerId);
      out.push({ post_id: id, ok: true, status: "rejected" });
      continue;
    }
    const item = await loadItem(ctx.client, id, ctx.ownerId, ctx.workspace?.id ?? null);
    if (!item) { out.push({ post_id: id, ok: false, error: "Post not found." }); continue; }
    const pending = item.destinations.filter((d) => d.status !== "published" && d.status !== "cancelled");
    if (!pending.length) { out.push({ post_id: id, ok: false, error: "Nothing left to schedule on this post." }); continue; }
    const manual = pending.find((d) => !SCHEDULABLE.includes(d.platform));
    if (manual) {
      out.push({ post_id: id, ok: false, error: `${PLATFORM_LABEL[manual.platform]} posts are finished in Create post.`, open: `/create?post=${encodeURIComponent(id)}` });
      continue;
    }
    const { accounts, complete } = await accountsP!;
    if (!complete) { out.push({ post_id: id, ok: false, error: "SOCIA could not read the connected accounts just now. Try again in a moment." }); continue; }
    const at = approvalTime(item.scheduledAt, now);
    const issues: Record<string, Issue[]> = {};
    let blocked: string | null = null;
    for (const d of pending) {
      const acc = accounts.find((x) => x.platform === d.platform && x.accountId === d.accountId) ?? null;
      const av = availabilityFor(d.platform, acc ? { status: acc.status, suspended: acc.suspended, scopes: acc.scopes } : null);
      if (av.state !== "available") { blocked = "reason" in av ? av.reason : `${PLATFORM_LABEL[d.platform]} can't post right now.`; break; }
      const r = validateDestination({ platform: d.platform, media: item.media, masterCaption: item.caption, settings: d.settings, scheduledAt: at, requireFutureTime: true, now });
      if (r.issues.length) issues[`${d.platform}:${d.accountId}`] = r.issues;
      if (r.level === "blocked") blocked = "This video isn't ready to schedule.";
    }
    if (blocked) { out.push({ post_id: id, ok: false, error: blocked, ...(Object.keys(issues).length ? { issues } : {}) }); continue; }
    for (const d of pending) await updateDestination(ctx.client, d.id, { status: "scheduled", scheduledAt: at, errorCode: null, errorMessage: null, nextRetryAt: null, retryCount: 0 });
    await refreshParent(ctx.client, id);
    await ctx.client.from("scheduled_posts").update({ review_status: "approved", review_note: null }).eq("id", id).eq("user_id", ctx.ownerId);
    out.push({ post_id: id, ok: true, status: "approved", scheduled_for: at });
  }
  return out;
}
