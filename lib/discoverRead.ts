// What Discover reads in the background (app/api/discover/read): every tracked
// Instagram competitor up to the plan's limit and the top suggestions, through
// Business Discovery (saved per account by lib/igCompetitorData.ts), then the
// style of the brand's own videos and of each account's (lib/discoverStyle.ts).
// Server only.

import type { Ctx } from "@/lib/context";
import { getEntitlements, getLimit } from "@/lib/entitlements";
import { listTracked } from "@/lib/trackedCompetitors";
import { competitorScopeId } from "@/lib/workspaces";
import { nicheVetted } from "@/lib/discovery";
import { getIgSnapshot } from "@/lib/instagramSync";
import { igCompetitorRows } from "@/lib/igCompetitorData";
import { createServiceClient } from "@/lib/supabase/service";
import { dismissedHandles } from "@/lib/competitorAutoPick";
import { COVERS_PER_ACCOUNT, FIT_VERSION, fitOf, missKind, styleKey, styleStale, triedRecently, type AccountStyle, type Fit, type Tried } from "./discoverStyle";
import { judgeFit, readStyleMemory, saveStyleMemory, styleAccounts, type FitCandidate } from "./discoverStyleLoad";
import { getProfile } from "@/lib/profile";
import { brandWorkspace } from "@/lib/context";

/** Suggestions read with the roster, so they show their picture and numbers. */
export const SUGGESTIONS_READ = 12;
/** Suggested accounts judged for niche fit in one read (one fast-model call). */
const FIT_PER_READ = 12;
/** Accounts whose style is looked at in one read: the rest follow on the next visit. */
const STYLED_PER_READ = 16;

/** The handles Discover reads on Instagram: tracked first, then the best suggestions not tracked. */
export async function discoverHandles(ctx: Ctx): Promise<{ tracked: string[]; suggested: string[]; limit: number }> {
  const [ent, cwid] = await Promise.all([getEntitlements(ctx.client, ctx.ownerId), competitorScopeId(ctx.client, ctx.workspace?.id)]);
  const limit = getLimit(ent, "competitors");
  const tracked = (await listTracked<{ handle: string; platform: string }>(ctx.client, ctx.ownerId, "handle, platform", { byAdded: true, workspaceId: cwid }).catch(() => []))
    .filter((t) => t.platform === "instagram").map((t) => t.handle.toLowerCase()).slice(0, limit);
  let suggested: string[] = [];
  try {
    let q = ctx.client.from("discovered_accounts").select("platform, handle, data_source, relevance_reasons").eq("user_id", ctx.ownerId).eq("platform", "instagram");
    if (cwid) q = q.eq("workspace_id", cwid);
    const svc = createServiceClient();
    const [{ data }, dismissed] = await Promise.all([
      q.order("relevance_score", { ascending: false }).limit(60),
      svc ? dismissedHandles(svc, ctx.ownerId, cwid).catch(() => null) : Promise.resolve(null),
    ]);
    // The same list the page shows: not tracked, not dismissed.
    const taken = new Set([...tracked, ...(dismissed ?? [])]);
    suggested = ((data ?? []) as Record<string, unknown>[]).filter(nicheVetted)
      .map((r) => String(r.handle ?? "").toLowerCase()).filter((h) => h && !taken.has(h)).slice(0, SUGGESTIONS_READ);
  } catch { /* discovery tables may not exist yet */ }
  return { tracked, suggested, limit };
}

export async function readDiscoverAccounts(ctx: Ctx, now: Date): Promise<{ read: number; found: number; styled: number; enabled: boolean }> {
  const [{ tracked, suggested }, memory] = await Promise.all([discoverHandles(ctx), readStyleMemory(ctx)]);
  // Accounts tried in the last day wait, whatever came back, so a failed lookup isn't repeated on every visit.
  const handles = [...tracked, ...suggested].filter((h) => !triedRecently(memory, styleKey("instagram", h), now));
  const res = handles.length
    ? await igCompetitorRows(ctx.client, ctx.ownerId, handles, false, { max: handles.length })
    : { enabled: true, competitors: [] };
  const at = now.toISOString();
  const tried: Record<string, Tried> = {};
  if (res.enabled) {
    for (const c of res.competitors) tried[styleKey("instagram", c.handle)] = c.found ? { at } : { at, miss: missKind(c.reasonKind) };
  }

  // Styles: the brand's own videos and each account found, when missing or a week old.
  let styled = 0;
  let found: Record<string, AccountStyle> = {};
  if (process.env.ANTHROPIC_API_KEY) {
    const jobs: { key: string; thumbs: (string | null)[] }[] = [];
    if (styleStale(memory.own, now) && !triedRecently(memory, "own", now)) {
      tried.own = { at };
      const snap = await getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => null);
      const thumbs = (snap?.media ?? []).slice(0, COVERS_PER_ACCOUNT).map((m) => m.thumbnail_url ?? m.media_url ?? null);
      if (thumbs.some(Boolean)) jobs.push({ key: "own", thumbs });
    }
    for (const c of res.competitors) {
      if (jobs.length >= STYLED_PER_READ) break;
      if (!c.found || !c.media?.length) continue;
      const key = styleKey("instagram", c.handle);
      if (!styleStale(memory.accounts[key], now)) continue;
      jobs.push({ key, thumbs: c.media.slice(0, COVERS_PER_ACCOUNT).map((m) => m.thumbnail) });
    }
    if (jobs.length) {
      found = await styleAccounts(ctx.ownerId, jobs, now);
      styled = Object.keys(found).length;
    }
  }
  // Niche fit: suggested accounts are judged from their bio and captions before they are
  // shown or give Reels (lib/discoverStyle.ts Fit). Cached rows count, read today or before.
  const fit: Record<string, Fit> = {};
  if (process.env.ANTHROPIC_API_KEY && suggested.length) {
    const unjudged = suggested.filter((h) => fitOf(memory, styleKey("instagram", h), now) == null).slice(0, FIT_PER_READ);
    if (unjudged.length) {
      const [rows, profile] = await Promise.all([
        igCompetitorRows(ctx.client, ctx.ownerId, unjudged, false, { max: unjudged.length, cacheOnly: true }).catch(() => null),
        getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null),
      ]);
      const candidates: FitCandidate[] = (rows?.competitors ?? []).filter((c) => c.found).map((c) => ({
        key: styleKey("instagram", c.handle), handle: c.handle, name: c.displayName ?? null, bio: c.biography ?? null,
        captions: (c.media ?? []).map((m) => m.caption ?? "").filter(Boolean),
      }));
      if (candidates.length && profile) {
        const g = profile.brand_detail?.growth;
        const verdicts = await judgeFit(ctx.ownerId, {
          name: profile.brand_name, niche: profile.niche, description: profile.brand_detail?.description ?? null,
          accountType: g?.account_type ?? null, offer: g?.business?.offer ?? null,
        }, candidates);
        for (const [key, ok] of verdicts) fit[key] = { ok, at, v: FIT_VERSION };
      }
    }
  }
  if (styled || Object.keys(tried).length || Object.keys(fit).length) {
    const { own, ...rest } = found;
    await saveStyleMemory(ctx, { own: own ?? memory.own, accounts: { ...memory.accounts, ...rest }, tried: { ...memory.tried, ...tried }, fit: { ...memory.fit, ...fit } });
  }
  return { read: handles.length, found: res.competitors.filter((c) => c.found).length, styled, enabled: res.enabled };
}
