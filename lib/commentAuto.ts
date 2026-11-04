// Automatic comment replies, opt-in per brand (Growth and up). Every 30
// minutes (supabase/comment-auto-cron.sql) SOCIA reads new comments for the
// brands that turned it on, drafts replies (lib/commentDrafts.ts, classifying
// each one), and sends praise replies and answers to questions it can answer from
// the brand profile (or an invitation to DM).
// Complaints and anything sensitive stay in the inbox for a person. Brands
// without automatic replies still get their new comments read and drafted on
// every run (syncAllBrandComments), so the inbox is current when someone opens it.
// Only comments made after the switch was turned on, from the last three days,
// at most HOURLY_CAP replies an hour per brand. Needs supabase/comment-auto.sql.
//
// Server only.

import { getEntitlements, canUseFeature } from "./entitlements";
import { getProfile } from "./profile";
import { brandVoiceFrom } from "./commentBrand";
import { AUTO_REPLY_MAX, sendCommentDraft, syncCommentDrafts, type CommentDraft } from "./commentDrafts";
import { SUGGEST_SKIP } from "./commentDraftFlags";
import { workspacesByIds, isMissingColumnError } from "./workspaces";
import { rateHit } from "./oauth/runtime";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

/** Replies SOCIA sends on its own per brand per hour. */
export const HOURLY_CAP = 30;
/** Replies sent per brand per run. */
const PER_RUN = 20;
/** Older comments are left for a person: a late automatic "thanks" reads oddly. */
const FRESH_MS = 72 * 3_600_000;

export type AutoSetting = { enabled: boolean; enabledAt: string | null };

const NONE = "00000000-0000-0000-0000-000000000000";

/** This brand's setting; null before comment-auto.sql has run. */
export async function readAutoSetting(client: Supa, ownerId: string, workspaceId: string | null): Promise<AutoSetting | null> {
  let q = client.from("comment_auto_settings").select("enabled, enabled_at").eq("user_id", ownerId);
  q = workspaceId ? q.eq("workspace_id", workspaceId) : q.is("workspace_id", null);
  const { data, error } = await q.maybeSingle();
  if (error) return null;
  const row = data as { enabled?: boolean; enabled_at?: string | null } | null;
  return { enabled: Boolean(row?.enabled), enabledAt: row?.enabled_at ?? null };
}

/** Turn it on (answers comments from now on) or off. Service role: the browser only reads the setting. */
export async function writeAutoSetting(svc: Supa, ownerId: string, workspaceId: string | null, viewerId: string, enabled: boolean, now = new Date()): Promise<AutoSetting | null> {
  const row = { user_id: ownerId, workspace_id: workspaceId, enabled, enabled_at: enabled ? now.toISOString() : null, enabled_by: viewerId, updated_at: now.toISOString() };
  let q = svc.from("comment_auto_settings").select("id").eq("user_id", ownerId);
  q = workspaceId ? q.eq("workspace_id", workspaceId) : q.is("workspace_id", null);
  const { data: existing, error: readErr } = await q.maybeSingle();
  if (readErr) return null;
  const { error } = existing
    ? await svc.from("comment_auto_settings").update(row).eq("id", (existing as { id: string }).id)
    : await svc.from("comment_auto_settings").insert(row);
  if (error) return null;
  return { enabled, enabledAt: row.enabled_at };
}

/**
 * Which drafts go out on their own: drafted, judged a short friendly reply,
 * with short single-line text, on a comment made after the switch was turned
 * on and in the last three days. Oldest first, at most `max`. Pure.
 */
export function pickAutoSends(drafts: (CommentDraft & { auto_ok?: boolean | null; sent_automatically?: boolean | null })[], enabledAt: string | null, now: Date, max = PER_RUN): CommentDraft[] {
  const since = Math.max(enabledAt ? Date.parse(enabledAt) : Infinity, now.getTime() - FRESH_MS);
  return drafts
    .filter((d) => d.status === "drafted" && d.auto_ok === true && !d.sent_automatically && d.error !== SUGGEST_SKIP)
    .filter((d) => typeof d.draft === "string" && d.draft.trim().length > 0 && d.draft.trim().length <= AUTO_REPLY_MAX && !/\n/.test(d.draft))
    .filter((d) => {
      const t = d.comment_created_at ? Date.parse(d.comment_created_at) : NaN;
      return Number.isFinite(t) && t >= since;
    })
    .sort((a, b) => Date.parse(a.comment_created_at!) - Date.parse(b.comment_created_at!))
    .slice(0, max);
}

export type BrandRun = { synced: boolean; sent: number; failed: number; capped: boolean };

/** One brand: read new comments, draft and classify, send the short friendly ones. */
export async function autoReplyBrand(svc: Supa, ownerId: string, workspaceId: string | null, enabledAt: string | null, now = new Date()): Promise<BrandRun> {
  const out: BrandRun = { synced: false, sent: 0, failed: 0, capped: false };
  const ws = workspaceId ? (await workspacesByIds(svc, [workspaceId])).get(workspaceId) ?? null : null;
  if (ws?.suspended) return out;
  const profile = await getProfile(svc, ownerId, ws && !ws.isDefault ? ws : null);
  await syncCommentDrafts(svc, ownerId, workspaceId, brandVoiceFrom(profile, ws?.name ?? null), { classify: true });
  out.synced = true;
  let q = svc.from("comment_drafts").select("*").eq("user_id", ownerId).eq("status", "drafted").eq("auto_ok", true).eq("sent_automatically", false);
  q = workspaceId ? q.eq("workspace_id", workspaceId) : q.is("workspace_id", null);
  const { data, error } = await q.order("comment_created_at", { ascending: true }).limit(60);
  if (error) {
    if (isMissingColumnError(error)) return out;
    throw error;
  }
  for (const d of pickAutoSends((data ?? []) as CommentDraft[], enabledAt, now)) {
    const slot = await rateHit(`comment-auto:${ownerId}:${workspaceId ?? NONE}`, 3600, HOURLY_CAP);
    if (slot !== "ok") { out.capped = slot === "limited"; break; }
    const r = await sendCommentDraft(svc, ownerId, d.id, d.draft!.trim(), workspaceId);
    if (r.ok) {
      await svc.from("comment_drafts").update({ sent_automatically: true }).eq("user_id", ownerId).eq("id", d.id);
      out.sent++;
    } else {
      out.failed++;
    }
  }
  return out;
}

export type AutoRun = { brands: number; ran: number; sent: number; failed: number; notEntitled: number; errors: number; outOfTime: number; inboxesSynced?: number };

type BrandKey = { user_id: string; workspace_id: string | null };

/** Every brand with Facebook or Instagram connected (one per workspace), for the inbox refresh. */
async function connectedBrands(svc: Supa): Promise<BrandKey[]> {
  const out = new Map<string, BrandKey>();
  for (const table of ["instagram_connections", "facebook_connections"]) {
    for (const cols of ["user_id, workspace_id, plan_suspended_at", "user_id, workspace_id", "user_id"]) {
      const { data, error } = await svc.from(table).select(cols);
      if (error) continue;
      for (const r of (data ?? []) as { user_id: string; workspace_id?: string | null; plan_suspended_at?: string | null }[]) {
        if (r.plan_suspended_at) continue;
        const k = { user_id: r.user_id, workspace_id: r.workspace_id ?? null };
        out.set(`${k.user_id}:${k.workspace_id ?? NONE}`, k);
      }
      break;
    }
  }
  return [...out.values()];
}

/**
 * Brands without automatic replies: read new comments and draft replies, so
 * the inbox is current, without sending anything. Same plan gate and the same
 * per-sync draft cap as opening the inbox.
 */
async function syncAllBrandComments(svc: Supa, skip: Set<string>, plans: Map<string, boolean>, deadline: number): Promise<number> {
  let synced = 0;
  for (const b of await connectedBrands(svc)) {
    if (Date.now() > deadline) break;
    if (skip.has(`${b.user_id}:${b.workspace_id ?? NONE}`)) continue;
    try {
      if (!plans.has(b.user_id)) plans.set(b.user_id, canUseFeature(await getEntitlements(svc, b.user_id), "comment_replies"));
      if (!plans.get(b.user_id)) continue;
      const ws = b.workspace_id ? (await workspacesByIds(svc, [b.workspace_id])).get(b.workspace_id) ?? null : null;
      if (ws?.suspended) continue;
      const profile = await getProfile(svc, b.user_id, ws && !ws.isDefault ? ws : null);
      await syncCommentDrafts(svc, b.user_id, b.workspace_id, brandVoiceFrom(profile, ws?.name ?? null), { classify: true });
      synced++;
    } catch (e) {
      console.error("[comment-sync]", (e as Error)?.message ?? e);
    }
  }
  return synced;
}

/** Every brand with automatic replies on, within the time budget. */
export async function runAutoReplies(svc: Supa, now = new Date(), budgetMs = 240_000): Promise<AutoRun> {
  const deadline = Date.now() + budgetMs;
  const out: AutoRun = { brands: 0, ran: 0, sent: 0, failed: 0, notEntitled: 0, errors: 0, outOfTime: 0 };
  const { data, error } = await svc.from("comment_auto_settings").select("user_id, workspace_id, enabled_at").eq("enabled", true);
  if (error) return out;
  const rows = (data ?? []) as { user_id: string; workspace_id: string | null; enabled_at: string | null }[];
  out.brands = rows.length;
  const plans = new Map<string, boolean>();
  const autoBrands = new Set(rows.map((r) => `${r.user_id}:${r.workspace_id ?? NONE}`));
  for (const r of rows) {
    if (Date.now() > deadline) { out.outOfTime++; continue; }
    try {
      if (!plans.has(r.user_id)) plans.set(r.user_id, canUseFeature(await getEntitlements(svc, r.user_id), "comment_replies"));
      if (!plans.get(r.user_id)) { out.notEntitled++; continue; }
      const b = await autoReplyBrand(svc, r.user_id, r.workspace_id, r.enabled_at, now);
      out.ran++;
      out.sent += b.sent;
      out.failed += b.failed;
    } catch (e) {
      out.errors++;
      console.error("[comment-auto]", (e as Error)?.message ?? e);
    }
  }
  // Then every other brand's inbox, with whatever time is left.
  out.inboxesSynced = await syncAllBrandComments(svc, autoBrands, plans, deadline);
  return out;
}
