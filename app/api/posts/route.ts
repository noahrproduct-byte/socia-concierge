import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/planGuard";
import { PLATFORMS, destinationKey, type MediaItem, type Platform } from "@/lib/publishing/types";
import { availabilityFor, CAPABILITIES } from "@/lib/publishing/capabilities";
import { validateDestination, type Issue } from "@/lib/publishing/validate";
import type { CreatePostPayload } from "@/lib/publishing/composer";
import { loadItem, loadPickerAccountsDetailed, saveItem, MissingTableError, MIGRATION_MESSAGE } from "@/lib/publishing/db";
import { publishNow, type ClientUploadRequest } from "@/lib/publishing/runner";
import { resolveContext, can, forbiddenCopy, type Ctx } from "@/lib/context";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/posts: the composer's one write.
//
//   action "draft"    save the item and its destinations as drafts (any plan, any role)
//   action "schedule" validate every destination server-side, then schedule
//   action "publish"  validate, schedule for now, and run each destination
//
// Enforcement lives here: auth, media path ownership, account ownership and
// availability, the workspace owner's scheduling feature, the viewer's role
// (a Member drafts; the owner or an admin schedules and publishes), and
// validateDestination for every destination. Hidden buttons in the composer
// are never the only gate.
//
// The post belongs to the active Brand Workspace's owner: every read and
// write goes through ctx.client as ctx.ownerId, so a team member works on the
// owner's calendar and never on a private copy.

const ACTIONS: CreatePostPayload["action"][] = ["draft", "schedule", "publish"];
const SOURCES = ["calendar", "composer", "quick", "studio", "plan"];
const BUCKET = "scheduled-media";

// Platforms that schedule natively and whose upload runs in the browser: a
// scheduled destination is uploaded now (private, with the platform's own
// publish time) rather than waiting for a cron tick that has no browser.
const UPLOAD_ON_SCHEDULE: Platform[] = ["youtube"];

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
/** A measured value: a finite number above zero. Anything else is unknown, never 0. */
const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const isoOrNull = (v: unknown): string | null | undefined => {
  if (v == null) return null;
  if (typeof v !== "string") return undefined;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
};

function parseMedia(v: unknown): MediaItem[] | null {
  if (!Array.isArray(v) || v.length > 10) return null;
  const out: MediaItem[] = [];
  for (const m of v) {
    if (!m || typeof m !== "object") return null;
    const o = m as Record<string, unknown>;
    const id = str(o.id);
    if (!id || (o.kind !== "image" && o.kind !== "video")) return null;
    // The url is never taken from the client; it is derived from the path below.
    out.push({
      id, kind: o.kind, name: str(o.name) ?? "", mime: str(o.mime) ?? "", size: numOrNull(o.size),
      width: numOrNull(o.width), height: numOrNull(o.height), duration: numOrNull(o.duration),
      path: o.path == null ? null : str(o.path), url: null,
    });
  }
  return out;
}

/** Shape check only; platform rules come from validateDestination. */
function parsePayload(body: unknown): { payload: CreatePostPayload } | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid request." };
  const b = body as Record<string, unknown>;
  const action = b.action as CreatePostPayload["action"];
  if (!ACTIONS.includes(action)) return { error: "action must be draft, schedule or publish." };
  const caption = str(b.caption);
  if (caption == null) return { error: "caption must be a string." };
  const media = parseMedia(b.media);
  if (!media) return { error: "media must be a list of up to 10 files." };
  const scheduledAt = isoOrNull(b.scheduledAt);
  if (scheduledAt === undefined) return { error: "scheduledAt is not a valid time." };
  if (!Array.isArray(b.destinations) || b.destinations.length > 20) return { error: "destinations must be a list." };
  const destinations: CreatePostPayload["destinations"] = [];
  for (const d of b.destinations) {
    if (!d || typeof d !== "object") return { error: "Each destination needs a platform and an account." };
    const o = d as Record<string, unknown>;
    const platform = o.platform as Platform;
    const accountId = str(o.accountId);
    if (!PLATFORMS.includes(platform) || !accountId) return { error: "Each destination needs a platform and an account." };
    if (!o.settings || typeof o.settings !== "object" || Array.isArray(o.settings)) return { error: `Settings for ${CAPABILITIES[platform].label} are malformed.` };
    const at = isoOrNull(o.scheduledAt);
    if (at === undefined) return { error: `The publish time for ${CAPABILITIES[platform].label} is not valid.` };
    destinations.push({ platform, accountId, settings: o.settings as CreatePostPayload["destinations"][number]["settings"], scheduledAt: at });
  }
  const source = str(b.source);
  return {
    payload: {
      id: b.id == null ? null : str(b.id),
      caption, media, scheduledAt,
      source: source && SOURCES.includes(source) ? (source as CreatePostPayload["source"]) : "composer",
      planId: b.planId == null ? null : str(b.planId),
      planDay: b.planDay == null ? null : str(b.planDay),
      customizePerPlatform: Boolean(b.customizePerPlatform),
      destinations, action,
    },
  };
}

/**
 * Tag a post with the workspace it was saved in. Best-effort and idempotent:
 * only a row without a workspace is stamped (a post never moves between an
 * owner's workspaces on re-save), and a missing `workspace_id` column
 * (workspaces migration not run yet) is answered as an error we ignore.
 */
async function stampWorkspace(ctx: Ctx, postId: string): Promise<void> {
  if (!ctx.workspace) return;
  try {
    await ctx.client
      .from("scheduled_posts")
      .update({ workspace_id: ctx.workspace.id })
      .eq("id", postId)
      .eq("user_id", ctx.ownerId)
      .is("workspace_id", null);
  } catch {
    // the post is saved either way
  }
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);

  const parsed = parsePayload(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const payload = parsed.payload;
  const isDraft = payload.action === "draft";

  // Role gate: scheduling and publishing are owner/admin actions. A Member's
  // drafts are welcome; nothing of theirs leaves the calendar.
  if (!isDraft && !can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });

  // Media must live in the scheduled-media bucket under the uploader's own
  // folder (storage RLS writes only there): the viewer's, or the workspace
  // owner's for a file the owner attached earlier. The URL the platforms fetch
  // is derived from that path here, never taken from the request. A draft may
  // hold a file that has not finished uploading.
  const prefixes = [`${ctx.viewerId}/`, `${ctx.ownerId}/`];
  for (const m of payload.media) {
    if (m.path != null && !prefixes.some((p) => m.path!.startsWith(p))) return NextResponse.json({ error: "That media file is not yours." }, { status: 403 });
    if (!isDraft && !m.path) return NextResponse.json({ error: `${m.name || "A file"} has not finished uploading.` }, { status: 400 });
    m.url = m.path ? supabase.storage.from(BUCKET).getPublicUrl(m.path).data.publicUrl : null;
  }

  // Editing: the item must be this workspace's and not already published.
  if (payload.id) {
    const cur = await loadItem(ctx.client, payload.id, ctx.ownerId);
    if (!cur) return NextResponse.json({ error: "Post not found." }, { status: 404 });
    if (cur.status === "published") return NextResponse.json({ error: "Published posts stay in the record." }, { status: 409 });
  }

  // Destinations: the account must be this workspace's and able to publish now.
  // A draft may keep an unavailable destination (it is saved as a draft). When
  // the connection tables could not all be read the list is a lower bound, and
  // nothing is scheduled or published against a guess.
  const { accounts, complete: accountsComplete } = await loadPickerAccountsDetailed(ctx.client, ctx.ownerId);
  if (!isDraft && !accountsComplete) {
    return NextResponse.json({ error: "SOCIA could not read your connected accounts just now. Try again in a moment." }, { status: 503 });
  }
  for (const d of payload.destinations) {
    const a = accounts.find((x) => x.platform === d.platform && x.accountId === d.accountId) ?? null;
    if (!a && CAPABILITIES[d.platform].implemented) {
      return NextResponse.json({ error: `That ${CAPABILITIES[d.platform].label} account is not connected to SOCIA.` }, { status: 400 });
    }
    if (isDraft) continue;
    const av = availabilityFor(d.platform, a ? { status: a.status, suspended: a.suspended, scopes: a.scopes } : null);
    if (av.state !== "available") return NextResponse.json({ error: av.reason }, { status: 400 });
  }

  if (!isDraft) {
    if (!payload.destinations.length) return NextResponse.json({ error: "Choose at least one destination." }, { status: 400 });
    const g = await requireFeature(ctx.client, ctx.ownerId, "scheduling");
    if (g.denied) return g.denied;

    const now = new Date();
    const issues: Record<string, Issue[]> = {};
    let blocked = false;
    for (const d of payload.destinations) {
      const r = validateDestination({
        platform: d.platform, media: payload.media, masterCaption: payload.caption, settings: d.settings,
        scheduledAt: d.scheduledAt ?? payload.scheduledAt, requireFutureTime: payload.action === "schedule", now,
      });
      if (r.issues.length) issues[destinationKey(d.platform, d.accountId)] = r.issues;
      if (r.level === "blocked") blocked = true;
    }
    if (blocked) return NextResponse.json({ error: "Some destinations are not ready to publish.", issues }, { status: 400 });
  }

  try {
    if (isDraft) {
      const item = await saveItem(ctx.client, ctx.ownerId, payload, "draft");
      await stampWorkspace(ctx, item.id);
      return NextResponse.json({ item, uploads: [] });
    }
    if (payload.action === "schedule") {
      const saved = await saveItem(ctx.client, ctx.ownerId, payload, "scheduled");
      await stampWorkspace(ctx, saved.id);
      // YouTube schedules natively but the bytes go browser -> YouTube, so the
      // upload starts in this request. Anything already holding an external id
      // is left to the cron to confirm; it is never uploaded twice.
      const targets = saved.destinations.filter(
        (d) => d.status === "scheduled" && !d.externalPostId && UPLOAD_ON_SCHEDULE.includes(d.platform),
      );
      let uploads: ClientUploadRequest[] = [];
      if (targets.length) uploads = (await publishNow(ctx.client, ctx.ownerId, saved, targets, 40_000)).uploads;
      const item = targets.length ? (await loadItem(ctx.client, saved.id, ctx.ownerId)) ?? saved : saved;
      return NextResponse.json({ item, uploads });
    }
    // publish: every destination is scheduled for now, then run in this request.
    const nowIso = new Date().toISOString();
    const saved = await saveItem(ctx.client, ctx.ownerId, {
      ...payload, scheduledAt: nowIso, destinations: payload.destinations.map((d) => ({ ...d, scheduledAt: nowIso })),
    }, "scheduled");
    await stampWorkspace(ctx, saved.id);
    const targets = saved.destinations.filter((d) => d.status === "scheduled");
    const { uploads } = await publishNow(ctx.client, ctx.ownerId, saved, targets, 40_000);
    const item = (await loadItem(ctx.client, saved.id, ctx.ownerId)) ?? saved;
    return NextResponse.json({ item, uploads });
  } catch (e) {
    if (e instanceof MissingTableError) return NextResponse.json({ error: MIGRATION_MESSAGE }, { status: 409 });
    const message = e instanceof Error ? e.message : "The post could not be saved.";
    return NextResponse.json({ error: message }, { status: message === "Post not found." ? 404 : 500 });
  }
}
