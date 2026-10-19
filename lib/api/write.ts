// Posts an AI assistant creates, schedules or publishes (MCP create_post and
// cancel_post). The same enforcement as the composer's POST /api/posts, in
// the same order, so an assistant can never do what the person couldn't do in
// SOCIA themselves:
//
//   the account is this workspace's and can publish now -> the person's role
//   (a Member's post is saved and, on Pro, sent for approval; it never goes
//   out on its own) -> the owner's plan includes scheduling -> every
//   destination passes validateDestination -> saved -> published by the same
//   runner, or left scheduled for the publisher.
//
// What an assistant can't do, by design:
//   YouTube and TikTok go out only from SOCIA's own Create post: a YouTube
//   upload streams from the browser that starts it, and TikTok requires its
//   own posting screen (creator, privacy, disclosures) before every post.
//   Assistants save drafts there instead.
//   Nothing is ever deleted. cancel_post only withdraws what hasn't started
//   going out.
import type { Ctx } from "../context";
import { can, forbiddenCopy } from "../context";
import type { Entitlements } from "../entitlements";
import { checkFeature } from "../entitlements";
import { defaultSettings, PLATFORM_LABEL, type DestinationSettings, type InstagramFormat, type MediaItem, type Platform, type YouTubePrivacy } from "../publishing/types";
import { availabilityFor } from "../publishing/capabilities";
import { suggestInstagramFormat, type CreatePostPayload, type PickerAccount } from "../publishing/composer";
import { validateDestination, type Issue } from "../publishing/validate";
import { loadItem, loadPickerAccountsDetailed, refreshParent, saveItem, stampPostWorkspace, MissingTableError, MIGRATION_MESSAGE } from "../publishing/db";
import { publishNow } from "../publishing/runner";
import { approvalsEnabled, approveOnSchedule, insertApproval, memberEditBlock, notifyApprovers } from "../approvals";
import { scopeToWorkspace } from "../workspaces";
import { ApiFailure } from "./context";
import { copyWorkspaceMedia, importLinkedMedia, MEDIA_BUCKET, type LinkDeps } from "./media";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

/** Platforms an assistant may schedule or publish to. The others take drafts only (see the header). */
export const ASSISTANT_PUBLISH_PLATFORMS: Platform[] = ["instagram", "facebook"];
const DRAFT_ONLY_REASON: Partial<Record<Platform, string>> = {
  youtube: "YouTube uploads run from the browser that starts them, so they're published from SOCIA's Create post.",
  tiktok: "TikTok requires its own posting screen before every post, so TikTok posts are published from SOCIA's Create post.",
};

export type MediaRef = { media_id?: string; url?: string };
export type DestinationInput = {
  platform: Platform;
  account_id?: string;
  format?: string;
  share_to_feed?: boolean;
  alt_text?: string;
  ai_generated?: boolean;
  title?: string;
  made_for_kids?: boolean;
  privacy?: string;
};
export type CreatePostInput = { caption: string; media: MediaRef[]; platforms: DestinationInput[]; when: string };

export type When = { mode: "draft" } | { mode: "now" } | { mode: "schedule"; at: string };

const MAX_AHEAD_MS = 365 * 24 * 60 * 60 * 1000;

/** "draft", "now", or a future time WITH its UTC offset (an assistant must not guess the person's time zone). */
export function parseWhen(raw: string, now: Date): When {
  const v = raw.trim().toLowerCase();
  if (v === "draft") return { mode: "draft" };
  if (v === "now") return { mode: "now" };
  if (!/(z|[+-]\d\d:?\d\d)$/i.test(raw.trim())) {
    throw new ApiFailure("invalid_input", `"${raw}" has no time zone. Give the time with its UTC offset, for example 2026-10-24T18:00:00-05:00, or use "now" or "draft".`);
  }
  const t = new Date(raw).getTime();
  if (!Number.isFinite(t)) throw new ApiFailure("invalid_input", `"${raw}" isn't a valid time.`);
  if (t <= now.getTime() + 60_000) throw new ApiFailure("invalid_input", `${new Date(t).toISOString()} is not in the future. Use "now" to publish right away.`);
  if (t > now.getTime() + MAX_AHEAD_MS) throw new ApiFailure("invalid_input", "Posts can be scheduled up to a year ahead.");
  return { mode: "schedule", at: new Date(t).toISOString() };
}

/** The account each destination goes to: the one named, or the workspace's only account on that platform. */
export function pickAccounts(inputs: DestinationInput[], accounts: PickerAccount[]): { input: DestinationInput; account: PickerAccount }[] {
  const out: { input: DestinationInput; account: PickerAccount }[] = [];
  for (const input of inputs) {
    const label = PLATFORM_LABEL[input.platform];
    const mine = accounts.filter((a) => a.platform === input.platform);
    let account: PickerAccount | undefined;
    if (input.account_id) {
      account = mine.find((a) => a.accountId === input.account_id);
      if (!account) throw new ApiFailure("invalid_input", `That ${label} account isn't connected in this Brand Workspace. list_connected_accounts shows the accounts and their ids.`);
    } else if (mine.length === 1) {
      account = mine[0];
    } else if (!mine.length) {
      throw new ApiFailure("invalid_input", `No ${label} account is connected in this Brand Workspace. Connect one in SOCIA's Settings first.`);
    } else {
      throw new ApiFailure("invalid_input", `Several ${label} accounts are connected (${mine.map((a) => a.handle ? `@${a.handle}` : a.label).join(", ")}). Pass account_id; list_connected_accounts shows the ids.`);
    }
    if (out.some((o) => o.account.platform === account!.platform && o.account.accountId === account!.accountId)) {
      throw new ApiFailure("invalid_input", `${label} ${account.handle ? `@${account.handle}` : account.label} is listed twice.`);
    }
    out.push({ input, account });
  }
  return out;
}

const IG_FORMATS: InstagramFormat[] = ["reel", "image", "carousel"];
const YT_PRIVACY: YouTubePrivacy[] = ["public", "unlisted", "private"];

/** Platform settings from an assistant's few options; everything else stays at SOCIA's defaults. */
export function settingsFor(input: DestinationInput, media: MediaItem[]): DestinationSettings {
  switch (input.platform) {
    case "instagram": {
      const s = defaultSettings("instagram");
      const format = input.format && IG_FORMATS.includes(input.format as InstagramFormat) ? (input.format as InstagramFormat) : suggestInstagramFormat(media);
      return {
        ...s, format,
        shareToFeed: input.share_to_feed ?? s.shareToFeed,
        altText: input.alt_text?.slice(0, 1000) ?? null,
        aiGenerated: input.ai_generated ?? false,
      };
    }
    case "facebook": {
      const s = defaultSettings("facebook");
      return { ...s, format: input.format === "reel" ? "reel" : "feed" };
    }
    case "youtube": {
      const s = defaultSettings("youtube");
      return {
        ...s, title: (input.title ?? "").slice(0, 100),
        madeForKids: typeof input.made_for_kids === "boolean" ? input.made_for_kids : null,
        privacy: YT_PRIVACY.includes(input.privacy as YouTubePrivacy) ? (input.privacy as YouTubePrivacy) : s.privacy,
        syntheticMedia: input.ai_generated ?? false,
      };
    }
    case "tiktok": {
      const s = defaultSettings("tiktok");
      return { ...s, privacy: input.privacy ?? null, aiGenerated: input.ai_generated ?? false };
    }
  }
}

const issueText = (issues: Record<string, Issue[]>) =>
  Object.entries(issues).map(([k, list]) => `${PLATFORM_LABEL[k.split(":")[0] as Platform] ?? k}: ${list.filter((i) => i.severity === "block").map((i) => i.message).join(" ")}`).join(" ");

type Deps = { svc: Supa; origin: string; deadline: number; link?: LinkDeps };

export type CreatePostResult = Record<string, unknown>;

export async function createPost(ctx: Ctx, ent: Entitlements, input: CreatePostInput, deps: Deps): Promise<CreatePostResult> {
  const now = new Date();
  const when = parseWhen(input.when, now);
  if (typeof input.caption !== "string") throw new ApiFailure("invalid_input", "caption must be text (it can be empty for a draft).");
  if (!Array.isArray(input.platforms) || !input.platforms.length || input.platforms.length > 4) throw new ApiFailure("invalid_input", "Choose 1 to 4 platforms.");
  if (!Array.isArray(input.media) || input.media.length > 10) throw new ApiFailure("invalid_input", "Attach at most 10 media files.");
  for (const m of input.media) {
    if (Boolean(m?.media_id) === Boolean(m?.url)) throw new ApiFailure("invalid_input", "Each media item needs either a media_id (from list_media) or a url, not both.");
  }

  if (when.mode !== "draft") {
    const blocked = input.platforms.find((p) => !ASSISTANT_PUBLISH_PLATFORMS.includes(p.platform));
    if (blocked) throw new ApiFailure("invalid_input", `${DRAFT_ONLY_REASON[blocked.platform] ?? `${PLATFORM_LABEL[blocked.platform]} isn't available here.`} Leave ${PLATFORM_LABEL[blocked.platform]} out, or use when: "draft" to save it for the person to finish in SOCIA.`);
  }

  const { accounts, complete } = await loadPickerAccountsDetailed(ctx.client, ctx.ownerId, ctx.workspace?.id);
  if (when.mode !== "draft" && !complete) throw new ApiFailure("unavailable", "SOCIA could not read the connected accounts just now. Try again in a moment.");
  const picked = pickAccounts(input.platforms, accounts);

  // A Member's post never goes out on its own: it is saved, and sent for approval when the plan has approvals.
  const member = when.mode !== "draft" && !can(ctx, "publish");
  if (when.mode !== "draft") {
    for (const { account } of picked) {
      const av = availabilityFor(account.platform, { status: account.status, suspended: account.suspended, scopes: account.scopes });
      if (av.state !== "available") throw new ApiFailure("invalid_input", "reason" in av ? av.reason : `${PLATFORM_LABEL[account.platform]} can't publish right now.`);
    }
    if (!member) {
      const sched = checkFeature(ent, "scheduling");
      if (!sched.ok) throw new ApiFailure("forbidden", sched.error.error);
    }
  }

  // Media last before saving: it is the slow part and the only one that writes files.
  const media: MediaItem[] = [];
  const created: string[] = [];
  const cleanup = async () => {
    if (created.length) await deps.svc.storage.from(MEDIA_BUCKET).remove(created).catch(() => undefined);
  };
  try {
    for (const m of input.media) {
      const item = m.media_id ? await copyWorkspaceMedia(ctx, deps.svc, m.media_id) : await importLinkedMedia(ctx, deps.svc, m.url!, deps.link);
      if (item.path) created.push(item.path);
      media.push(item);
    }

    const scheduledAt = when.mode === "schedule" ? when.at : when.mode === "now" ? now.toISOString() : null;
    const destinations = picked.map(({ input: d, account }) => ({ platform: account.platform, accountId: account.accountId, settings: settingsFor(d, media), scheduledAt }));

    if (when.mode !== "draft") {
      const issues: Record<string, Issue[]> = {};
      let blocked = false;
      for (const d of destinations) {
        const r = validateDestination({
          platform: d.platform, media, masterCaption: input.caption, settings: d.settings,
          scheduledAt: member && when.mode === "now" ? null : scheduledAt, requireFutureTime: when.mode === "schedule", now,
        });
        if (r.issues.length) issues[`${d.platform}:${d.accountId}`] = r.issues;
        if (r.level === "blocked") blocked = true;
      }
      if (blocked) throw new ApiFailure("invalid_input", `Not ready to post. ${issueText(issues)}`);
    }

    const payload: CreatePostPayload = {
      id: null, caption: input.caption, media, scheduledAt, source: "assistant", planId: null, planDay: null,
      customizePerPlatform: false, destinations, action: when.mode === "draft" || member ? "draft" : when.mode === "schedule" ? "schedule" : "publish",
    };

    let result: string;
    let note: string | null = null;
    let postId: string;
    if (when.mode === "draft" || member) {
      const saved = await saveItem(ctx.client, ctx.ownerId, { ...payload, scheduledAt: when.mode === "schedule" ? when.at : null, destinations: destinations.map((d) => ({ ...d, scheduledAt: when.mode === "schedule" ? when.at : null })) }, "draft");
      await stampPostWorkspace(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, saved.id);
      postId = saved.id;
      result = "draft";
      if (member) {
        const approvals = checkFeature(ent, "approval_workflow").ok && (await approvalsEnabled(deps.svc));
        if (approvals) {
          const ins = await insertApproval(deps.svc, {
            postId, workspaceId: ctx.workspace?.id ?? null, ownerId: ctx.ownerId, submittedBy: ctx.viewerId,
            requestedAt: when.mode === "schedule" ? when.at : null, submitNote: "Created with an AI assistant.",
          });
          if (ins.ok) { await notifyApprovers(deps.svc, ins.approval); result = "submitted_for_approval"; }
          note = ins.ok
            ? "You're a Member of this workspace, so it was sent to the owner and admins for approval. It goes out once one of them approves it."
            : "You're a Member of this workspace, so it was saved as a draft; it couldn't be sent for approval just now. Submit it from SOCIA's Calendar.";
        } else {
          note = `${forbiddenCopy("publish")} It was saved as a draft for them.`;
        }
      } else {
        note = "Saved as a draft. Nothing was published.";
      }
    } else if (when.mode === "schedule") {
      const saved = await saveItem(ctx.client, ctx.ownerId, payload, "scheduled");
      await stampPostWorkspace(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, saved.id);
      await approveOnSchedule(ctx, saved.id, when.at);
      postId = saved.id;
      result = "scheduled";
    } else {
      const saved = await saveItem(ctx.client, ctx.ownerId, payload, "scheduled");
      await stampPostWorkspace(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, saved.id);
      postId = saved.id;
      // Whatever doesn't finish inside this request stays scheduled for now; SOCIA's publisher picks it up within minutes.
      const budget = Math.min(40_000, deps.deadline - Date.now());
      if (budget > 5_000) await publishNow(ctx.client, ctx.ownerId, saved, saved.destinations.filter((d) => d.status === "scheduled"), budget);
      await approveOnSchedule(ctx, saved.id, null);
      result = "publishing";
    }

    const item = await loadItem(ctx.client, postId, ctx.ownerId);
    const dests = (item?.destinations ?? []).filter((d) => d.status !== "cancelled");
    if (result === "publishing" && dests.length && dests.every((d) => d.status === "published")) result = "published";
    if (result === "publishing" && dests.length && dests.every((d) => d.status === "failed")) result = "failed";
    return {
      post_id: postId,
      result,
      destinations: dests.map((d) => {
        const a = accounts.find((x) => x.platform === d.platform && x.accountId === d.accountId);
        return {
          platform: d.platform, account: a?.handle ? `@${a.handle}` : a?.label ?? null, status: d.status,
          scheduled_at: d.scheduledAt, published_at: d.publishedAt, link: d.permalink, error: d.errorMessage,
        };
      }),
      media: media.map((m) => ({ kind: m.kind, name: m.name })),
      open_in_socia: `${deps.origin}/create?post=${postId}`,
      note: note ?? (result === "publishing"
        ? "Publishing has started. The platform may take a few minutes to process it; get_scheduled_posts shows when it's live."
        : result === "scheduled" ? "Scheduled. SOCIA publishes it at that time; cancel_post withdraws it before then." : null),
    };
  } catch (e) {
    await cleanup();
    if (e instanceof MissingTableError) throw new ApiFailure("unavailable", MIGRATION_MESSAGE);
    throw e;
  }
}

/** Destinations that can still be withdrawn: nothing has started going out. */
const CANCELLABLE = ["draft", "ready", "scheduled", "failed"];

export async function cancelPost(ctx: Ctx, postId: string): Promise<Record<string, unknown>> {
  if (!/^[0-9a-f-]{36}$/i.test(postId)) throw new ApiFailure("invalid_input", "post_id isn't a SOCIA post id.");
  const { data: row, error } = await scopeToWorkspace(
    ctx.client.from("scheduled_posts").select("id").eq("id", postId).eq("user_id", ctx.ownerId),
    ctx.workspace?.id,
  ).maybeSingle();
  if (error) throw new ApiFailure("unavailable", "SOCIA couldn't read that post just now. Try again shortly.");
  if (!row) throw new ApiFailure("not_found", "That post isn't in this Brand Workspace.");
  const block = await memberEditBlock(ctx, postId);
  if (block) throw new ApiFailure("forbidden", block);
  const item = await loadItem(ctx.client, postId, ctx.ownerId);
  if (!item || !item.destinations.length) throw new ApiFailure("not_found", "That post has no platforms to cancel; change it in SOCIA's Calendar.");

  const { data: done, error: upErr } = await ctx.client.from("post_destinations")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("post_id", postId).eq("user_id", ctx.ownerId).in("status", CANCELLABLE)
    .select("platform");
  if (upErr) throw new ApiFailure("unavailable", "SOCIA couldn't cancel it just now. Try again shortly.");
  await refreshParent(ctx.client, postId);
  const cancelled = ((done ?? []) as { platform: Platform }[]).map((d) => d.platform);
  const after = await loadItem(ctx.client, postId, ctx.ownerId);
  const live = (after?.destinations ?? []).filter((d) => d.status !== "cancelled").map((d) => ({ platform: d.platform, status: d.status, link: d.permalink }));
  return {
    post_id: postId,
    cancelled,
    not_cancelled: live,
    note: live.length
      ? "Platforms that are already uploading, processing or published can't be withdrawn here; delete a published post in the platform's own app."
      : cancelled.length ? "Withdrawn. Nothing will be published." : "Nothing was waiting to be published.",
  };
}
