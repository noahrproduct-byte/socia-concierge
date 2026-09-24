// Persistence for multi-destination publishing: row <-> model mapping for the
// parent (scheduled_posts) and its destinations (post_destinations), plus the
// few queries the runner and the composer's API share.
//
// The database may not be migrated yet. Every query on post_destinations
// recognises "the table is missing" (42P01 / PGRST205 / schema cache) and
// either degrades (legacy rows still load with no destinations) or throws a
// MissingTableError the routes turn into a 409 with MIGRATION_MESSAGE.
//
// Server only (imports lib/entitlements for the connected-account list).

import type { ContentItem, Destination, DestinationSettings, DestinationStatus, MediaItem, Platform } from "./types";
import { PLATFORMS, defaultSettings } from "./types";
import { aggregateStatus, firstError } from "./status";
import type { CreatePostPayload, PickerAccount } from "./composer";
import { listConnectedAccountsDetailed } from "../entitlements";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

export const MIGRATION_MESSAGE =
  "SOCIA's database needs the publishing migration (supabase/post-destinations.sql) before posts can be created.";

export class MissingTableError extends Error {
  code = "missing_table" as const;
  constructor() {
    super(MIGRATION_MESSAGE);
    this.name = "MissingTableError";
  }
}

/** PostgREST / Postgres shapes for "that relation does not exist". */
export function isMissingTableError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const o = e as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const code = typeof o.code === "string" ? o.code : "";
  if (code === "42P01" || code === "PGRST205") return true;
  const text = [o.message, o.details, o.hint].filter((x): x is string => typeof x === "string").join(" ");
  return /schema cache/i.test(text) || /relation .* does not exist/i.test(text) || /could not find the table/i.test(text);
}

const isMissingColumnError = (e: unknown): boolean => {
  if (!e || typeof e !== "object") return false;
  const o = e as { code?: unknown; message?: unknown };
  const m = typeof o.message === "string" ? o.message : "";
  return o.code === "42703" || /column .* does not exist/i.test(m) || /could not find .* column/i.test(m) || /schema cache/i.test(m);
};

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export type ParentRow = {
  id: string;
  user_id: string;
  ig_user_id: string | null;
  plan_id: string | null;
  plan_day: string | null;
  scheduled_at: string;
  caption: string;
  media_type: string | null;
  media_path: string | null;
  media_url: string | null;
  media?: unknown;
  status: string;
  container_id?: string | null;
  published_media_id?: string | null;
  permalink?: string | null;
  error?: string | null;
  attempts?: number;
  source?: string | null;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type DestinationRow = {
  id: string;
  post_id: string;
  user_id: string;
  platform: string;
  account_id: string;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
  published_at: string | null;
  external_post_id: string | null;
  external_container_id: string | null;
  permalink: string | null;
  error_code: string | null;
  error_message: string | null;
  retry_count: number | null;
  next_retry_at: string | null;
  settings: unknown;
  created_at: string;
  updated_at: string;
};

const PARENT_STATUSES: ContentItem["status"][] = ["draft", "scheduled", "publishing", "published", "failed", "cancelled"];
const SOURCES: NonNullable<ContentItem["source"]>[] = ["calendar", "composer", "quick", "studio", "plan"];
const DEST_STATUSES: DestinationStatus[] = ["draft", "ready", "scheduled", "uploading", "processing", "published", "failed", "cancelled"];

const asPlatform = (v: unknown): Platform => (PLATFORMS.includes(v as Platform) ? (v as Platform) : "instagram");
const asDestStatus = (v: unknown): DestinationStatus => (DEST_STATUSES.includes(v as DestinationStatus) ? (v as DestinationStatus) : "draft");
const asParentStatus = (v: unknown): ContentItem["status"] => (PARENT_STATUSES.includes(v as ContentItem["status"]) ? (v as ContentItem["status"]) : "draft");
const asSource = (v: unknown): ContentItem["source"] => (SOURCES.includes(v as NonNullable<ContentItem["source"]>) ? (v as ContentItem["source"]) : null);

function isMediaItem(v: unknown): v is MediaItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && (o.kind === "image" || o.kind === "video");
}

/** A measured value: a finite number above zero. Anything else was not recorded. */
const positiveOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

/**
 * Normalise a stored media list. Readers never invent: a size that was not
 * recorded is null (never 0) and a type that was not recorded is "" (never
 * guessed from the file name). Freshly measured values pass through.
 */
function mediaFromJson(v: unknown): MediaItem[] | null {
  if (!Array.isArray(v) || !v.length || !v.every(isMediaItem)) return null;
  return v.map((m) => ({
    id: m.id,
    kind: m.kind,
    name: typeof m.name === "string" ? m.name : "",
    mime: typeof m.mime === "string" ? m.mime : "",
    size: positiveOrNull(m.size),
    width: positiveOrNull(m.width),
    height: positiveOrNull(m.height),
    duration: positiveOrNull(m.duration),
    path: typeof m.path === "string" ? m.path : null,
    url: typeof m.url === "string" ? m.url : null,
  }));
}

/** A legacy calendar row: one file, nothing measured and no type recorded. */
function legacyMedia(row: ParentRow): MediaItem[] {
  if (!row.media_url && !row.media_path) return [];
  const kind = row.media_type === "IMAGE" ? "image" : "video";
  const name = (row.media_path ?? row.media_url ?? "").split("/").pop() ?? "";
  return [{
    id: "legacy",
    kind,
    name,
    // Legacy rows only recorded REELS / IMAGE; the container and the size are unknown.
    mime: "",
    size: null,
    width: null,
    height: null,
    duration: null,
    path: row.media_path ?? null,
    url: row.media_url ?? null,
  }];
}

function settingsFromJson(platform: Platform, v: unknown): DestinationSettings {
  const base = defaultSettings(platform) as Record<string, unknown>;
  if (!v || typeof v !== "object" || Array.isArray(v)) return base as DestinationSettings;
  return { ...base, ...(v as Record<string, unknown>) } as DestinationSettings;
}

export function rowToDestination(r: DestinationRow): Destination {
  const platform = asPlatform(r.platform);
  return {
    id: r.id,
    postId: r.post_id,
    platform,
    accountId: String(r.account_id ?? ""),
    status: asDestStatus(r.status),
    scheduledAt: r.scheduled_at ?? null,
    startedAt: r.started_at ?? null,
    publishedAt: r.published_at ?? null,
    externalPostId: r.external_post_id ?? null,
    externalContainerId: r.external_container_id ?? null,
    permalink: r.permalink ?? null,
    errorCode: r.error_code ?? null,
    errorMessage: r.error_message ?? null,
    retryCount: typeof r.retry_count === "number" ? r.retry_count : 0,
    nextRetryAt: r.next_retry_at ?? null,
    settings: settingsFromJson(platform, r.settings),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Parent + destinations -> ContentItem. A legacy row (no destinations) maps too. */
export function rowToItem(parent: ParentRow, destinationRows: DestinationRow[]): ContentItem {
  const destinations = destinationRows
    .map(rowToDestination)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  return {
    id: parent.id,
    userId: parent.user_id,
    caption: parent.caption ?? "",
    media: mediaFromJson(parent.media) ?? legacyMedia(parent),
    scheduledAt: parent.scheduled_at ?? null,
    status: asParentStatus(parent.status),
    source: asSource(parent.source),
    planId: parent.plan_id ?? null,
    planDay: parent.plan_day ?? null,
    publishedAt: parent.published_at ?? null,
    createdAt: parent.created_at,
    updatedAt: parent.updated_at,
    destinations,
  };
}

/** Model patch -> post_destinations columns. Only keys present are written. */
export function destinationPatchToRow(patch: Partial<Destination>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const map: Record<string, string> = {
    status: "status", scheduledAt: "scheduled_at", startedAt: "started_at", publishedAt: "published_at",
    externalPostId: "external_post_id", externalContainerId: "external_container_id", permalink: "permalink",
    errorCode: "error_code", errorMessage: "error_message", retryCount: "retry_count", nextRetryAt: "next_retry_at",
    settings: "settings", accountId: "account_id",
  };
  for (const [k, col] of Object.entries(map)) {
    if (k in patch) out[col] = (patch as Record<string, unknown>)[k];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export async function hasDestinationsTable(supabase: Supa): Promise<boolean> {
  try {
    const { error } = await supabase.from("post_destinations").select("id", { head: true, count: "exact" }).limit(1);
    if (!error) return true;
    return !isMissingTableError(error);
  } catch (e) {
    return !isMissingTableError(e);
  }
}

/** Destination rows for one or more parents. Throws MissingTableError when the table is absent. */
export async function loadDestinationRows(supabase: Supa, postIds: string[]): Promise<DestinationRow[]> {
  if (!postIds.length) return [];
  const { data, error } = await supabase
    .from("post_destinations")
    .select("*")
    .in("post_id", postIds)
    .order("created_at", { ascending: true });
  if (error) {
    if (isMissingTableError(error)) throw new MissingTableError();
    throw new Error(error.message ?? "Could not read destinations.");
  }
  return (data ?? []) as DestinationRow[];
}

/**
 * Which of these parents have destination rows. Tri-state: a Set on success,
 * an empty Set when the table is missing (pre-migration: nothing has
 * destinations), and null when the table could not be read for any other
 * reason. Callers treat null as "unknown" and never as "none", because a
 * composer post published through the legacy path would go out twice.
 */
export async function parentsWithDestinations(supabase: Supa, postIds: string[]): Promise<Set<string> | null> {
  if (!postIds.length) return new Set();
  try {
    const { data, error } = await supabase.from("post_destinations").select("post_id").in("post_id", postIds);
    if (error) return isMissingTableError(error) ? new Set() : null;
    return new Set(((data ?? []) as { post_id: string }[]).map((r) => r.post_id));
  } catch (e) {
    return isMissingTableError(e) ? new Set() : null;
  }
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

/** Owner-scoped when userId is given; the service client passes null. */
export async function loadItem(supabase: Supa, id: string, userId: string | null): Promise<ContentItem | null> {
  let q = supabase.from("scheduled_posts").select("*").eq("id", id);
  if (userId) q = q.eq("user_id", userId);
  const { data: parent, error } = await q.maybeSingle();
  if (error || !parent) return null;
  let rows: DestinationRow[] = [];
  try {
    rows = await loadDestinationRows(supabase, [id]);
  } catch (e) {
    // Legacy rows keep working before the migration.
    if (!(e instanceof MissingTableError)) throw e;
  }
  return rowToItem(parent as ParentRow, rows);
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

const KEEP_ON_RESAVE: DestinationStatus[] = ["published", "uploading", "processing"];

/**
 * Write the parent and upsert its destinations. Destinations in the payload
 * are inserted or updated by (post_id, platform, account_id); those missing
 * from the payload are cancelled unless already published. Returns the item.
 */
export async function saveItem(
  supabase: Supa,
  userId: string,
  payload: CreatePostPayload,
  statusForNew: DestinationStatus,
): Promise<ContentItem> {
  if (!(await hasDestinationsTable(supabase))) throw new MissingTableError();
  const nowIso = new Date().toISOString();

  const first = payload.media[0] ?? null;
  const destTimes = payload.destinations.map((d) => d.scheduledAt).filter((t): t is string => Boolean(t)).sort();
  const scheduledAt = payload.scheduledAt ?? destTimes[0] ?? nowIso;
  const ig = payload.destinations.find((d) => d.platform === "instagram");

  const parentPatch: Record<string, unknown> = {
    caption: payload.caption,
    media: payload.media,
    media_url: first?.url ?? null,
    media_path: first?.path ?? null,
    media_type: first ? (first.kind === "video" ? "REELS" : "IMAGE") : "REELS",
    scheduled_at: scheduledAt,
    source: payload.source,
    plan_id: payload.planId,
    plan_day: payload.planDay,
    ig_user_id: ig?.accountId ?? null,
    updated_at: nowIso,
  };

  let postId: string;
  if (payload.id) {
    const { data: cur, error: readErr } = await supabase
      .from("scheduled_posts").select("id, status").eq("id", payload.id).eq("user_id", userId).maybeSingle();
    if (readErr || !cur) throw new Error("Post not found.");
    const { error } = await supabase.from("scheduled_posts").update(parentPatch).eq("id", payload.id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    postId = payload.id;
  } else {
    const { data, error } = await supabase
      .from("scheduled_posts")
      .insert({ ...parentPatch, user_id: userId, status: "draft" })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Could not create the post.");
    postId = data.id as string;
  }

  const existing = await loadDestinationRows(supabase, [postId]);
  const seen = new Set<string>();
  const inserts: Record<string, unknown>[] = [];
  for (const d of payload.destinations) {
    const key = `${d.platform}:${d.accountId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const row = existing.find((r) => r.platform === d.platform && String(r.account_id) === d.accountId);
    if (row) {
      // A destination that is already live is part of the record: a re-save
      // never touches its settings, time or status.
      if (asDestStatus(row.status) === "published") continue;
      const keep = KEEP_ON_RESAVE.includes(asDestStatus(row.status));
      const patch: Record<string, unknown> = { settings: d.settings, scheduled_at: d.scheduledAt, updated_at: nowIso };
      if (!keep) {
        patch.status = statusForNew;
        patch.error_code = null;
        patch.error_message = null;
        patch.next_retry_at = null;
        patch.retry_count = 0;
      }
      const { error } = await supabase.from("post_destinations").update(patch).eq("id", row.id);
      if (error) throw new Error(error.message);
    } else {
      inserts.push({
        post_id: postId, user_id: userId, platform: d.platform, account_id: d.accountId,
        status: statusForNew, scheduled_at: d.scheduledAt, settings: d.settings,
      });
    }
  }
  if (inserts.length) {
    const { error } = await supabase.from("post_destinations").insert(inserts);
    if (error) throw new Error(error.message);
  }
  const removed = existing.filter((r) => !seen.has(`${r.platform}:${r.account_id}`) && r.status !== "published" && r.status !== "cancelled");
  if (removed.length) {
    const { error } = await supabase
      .from("post_destinations")
      .update({ status: "cancelled", updated_at: nowIso })
      .in("id", removed.map((r) => r.id));
    if (error) throw new Error(error.message);
  }

  await refreshParent(supabase, postId);
  const item = await loadItem(supabase, postId, userId);
  if (!item) throw new Error("Post not found after saving.");
  return item;
}

export type UpdateDestinationOptions = {
  /**
   * Skip the write when the row has meanwhile become published, unless the
   * patch itself publishes it. Two runners (a browser and the cron) can look
   * at the same row; the one that arrives second must not demote a live post.
   */
  unlessPublished?: boolean;
};

export async function updateDestination(supabase: Supa, id: string, patch: Partial<Destination>, opts: UpdateDestinationOptions = {}): Promise<void> {
  const row = destinationPatchToRow(patch);
  row.updated_at = new Date().toISOString();
  let q = supabase.from("post_destinations").update(row).eq("id", id);
  if (opts.unlessPublished && patch.status !== "published") q = q.neq("status", "published");
  const { error } = await q;
  if (error) {
    if (isMissingTableError(error)) throw new MissingTableError();
    throw new Error(error.message ?? "Could not update the destination.");
  }
}

/**
 * Recompute the parent from its destinations: status via aggregateStatus,
 * error via firstError, published_at once every live destination published.
 * Legacy parents (no destination rows) are left exactly as they are.
 */
export async function refreshParent(supabase: Supa, postId: string): Promise<void> {
  let rows: DestinationRow[];
  try {
    rows = await loadDestinationRows(supabase, [postId]);
  } catch (e) {
    if (e instanceof MissingTableError) return;
    throw e;
  }
  if (!rows.length) return;
  const dests = rows.map(rowToDestination);
  const live = dests.filter((d) => d.status !== "cancelled");
  const allPublished = live.length > 0 && live.every((d) => d.status === "published");
  const latest = live.map((d) => d.publishedAt).filter((x): x is string => Boolean(x)).sort().pop() ?? null;
  const igPublished = live.find((d) => d.platform === "instagram" && d.status === "published" && d.externalPostId);
  const patch: Record<string, unknown> = {
    status: aggregateStatus(dests),
    error: firstError(dests),
    published_at: allPublished ? latest ?? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  // Legacy readers (calendar attribution) key on the Instagram media id.
  if (igPublished) {
    patch.published_media_id = igPublished.externalPostId;
    patch.permalink = igPublished.permalink;
  }
  const { error } = await supabase.from("scheduled_posts").update(patch).eq("id", postId);
  if (error && isMissingColumnError(error)) {
    // Parent columns from the migration are missing; write what the legacy schema has.
    delete patch.published_at;
    await supabase.from("scheduled_posts").update(patch).eq("id", postId);
  }
}

// ---------------------------------------------------------------------------
// Due work (service client)
// ---------------------------------------------------------------------------

export type DueDestination = Destination & { userId: string };

/**
 * Destinations the runner should look at now: scheduled and due (including
 * YouTube rows already uploaded that YouTube publishes natively and SOCIA
 * confirms by polling), plus anything in flight. A retry waits for
 * next_retry_at. Oldest first.
 */
export async function listDue(svc: Supa, now: Date, limit: number): Promise<DueDestination[]> {
  const iso = now.toISOString();
  const { data, error } = await svc
    .from("post_destinations")
    .select("*")
    .or(`and(status.eq.scheduled,scheduled_at.lte.${iso}),status.in.(uploading,processing)`)
    .or(`next_retry_at.is.null,next_retry_at.lte.${iso}`)
    .order("scheduled_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) {
    if (isMissingTableError(error)) throw new MissingTableError();
    throw new Error(error.message ?? "Could not read due destinations.");
  }
  return ((data ?? []) as DestinationRow[]).map((r) => ({ ...rowToDestination(r), userId: r.user_id }));
}

// ---------------------------------------------------------------------------
// Connected accounts as the picker sees them
// ---------------------------------------------------------------------------

async function scopesByAccount(supabase: Supa, table: string, idCol: string, userId: string): Promise<Map<string, string[] | null>> {
  const out = new Map<string, string[] | null>();
  try {
    const { data, error } = await supabase.from(table).select(`${idCol}, scopes`).eq("user_id", userId);
    if (error) return out; // scopes column (or table) missing: unknown, not empty
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const id = r[idCol];
      if (id == null) continue;
      out.set(String(id), Array.isArray(r.scopes) ? (r.scopes as string[]) : null);
    }
  } catch {
    /* unknown */
  }
  return out;
}

export type PickerAccountsResult = {
  accounts: PickerAccount[];
  /** false when at least one platform's connections could not be read; the list is then a lower bound. */
  complete: boolean;
};

/**
 * The connected accounts plus the scopes each token holds, and whether the
 * list is trustworthy. Suspended accounts are included and flagged so the
 * picker can say why they are unavailable. Shared by
 * /api/publishing/accounts, /api/posts and the composer page.
 */
export async function loadPickerAccountsDetailed(supabase: Supa, userId: string): Promise<PickerAccountsResult> {
  const [{ accounts, complete }, igScopes, ytScopes, ttScopes] = await Promise.all([
    listConnectedAccountsDetailed(supabase, userId),
    scopesByAccount(supabase, "instagram_connections", "ig_user_id", userId),
    scopesByAccount(supabase, "youtube_connections", "channel_id", userId),
    scopesByAccount(supabase, "tiktok_connections", "open_id", userId),
  ]);
  return {
    complete,
    accounts: accounts.map((a) => ({
      platform: a.platform,
      accountId: a.platformId,
      label: a.label,
      handle: a.handle,
      avatar: a.avatar,
      status: a.status,
      suspended: a.suspended,
      scopes:
        a.platform === "instagram" ? igScopes.get(a.platformId) ?? null
        : a.platform === "youtube" ? ytScopes.get(a.platformId) ?? null
        : a.platform === "tiktok" ? ttScopes.get(a.platformId) ?? null
        : null,
    })),
  };
}

/** The list alone, for callers that only render it. Gates use loadPickerAccountsDetailed. */
export async function loadPickerAccounts(supabase: Supa, userId: string): Promise<PickerAccount[]> {
  return (await loadPickerAccountsDetailed(supabase, userId)).accounts;
}
