// What Discover reads in the background (app/api/discover/read): every tracked
// Instagram competitor up to the plan's limit and the top suggestions, through
// Business Discovery (saved per account by lib/igCompetitorData.ts), then the
// style of the brand's own videos and of each account's (lib/discoverStyle.ts).
// Server only.

import type { Ctx } from "@/lib/context";
import { getEntitlements, getLimit } from "@/lib/entitlements";
import { listTracked } from "@/lib/trackedCompetitors";
import { competitorScopeId } from "@/lib/workspaces";
import { isStyleSource, nicheVetted } from "@/lib/discovery";
import { getIgSnapshot } from "@/lib/instagramSync";
import { igCompetitorRows } from "@/lib/igCompetitorData";
import { createServiceClient } from "@/lib/supabase/service";
import { dismissedHandles } from "@/lib/competitorAutoPick";
import { COPY_FIND_PER_READ, COVERS_PER_ACCOUNT, FIT_VERSION, fitOf, mentionedHandles, reachesPastFollowers, sameStyle, missKind, styleKey, styleStale, triedRecently, type AccountStyle, type CopyFound, type Fit, type StyleMemory, type Tried } from "./discoverStyle";
import { judgeFit, readStyleMemory, saveStyleMemory, styleAccounts, type FitCandidate } from "./discoverStyleLoad";
import { getProfile } from "@/lib/profile";
import { brandWorkspace } from "@/lib/context";

/** Suggestions read with the roster, so they show their picture and numbers. */
export const SUGGESTIONS_READ = 12;
/** Accounts read for viral Reels in the brand's own style, any topic (lib/discovery.ts STYLE_SOURCE). */
export const STYLE_SOURCES_READ = 6;
/** Suggested accounts judged for niche fit in one read (one fast-model call). */
const FIT_PER_READ = 12;
/** Accounts whose style is looked at in one read: the rest follow on the next visit. */
const STYLED_PER_READ = 16;

/** The handles Discover reads on Instagram: tracked first, then the best suggestions not tracked. */
export async function discoverHandles(ctx: Ctx, memory?: StyleMemory, now: Date = new Date()): Promise<{ tracked: string[]; suggested: string[]; styleSources: string[]; limit: number }> {
  const [ent, cwid] = await Promise.all([getEntitlements(ctx.client, ctx.ownerId), competitorScopeId(ctx.client, ctx.workspace?.id)]);
  const limit = getLimit(ent, "competitors");
  const tracked = (await listTracked<{ handle: string; platform: string }>(ctx.client, ctx.ownerId, "handle, platform", { byAdded: true, workspaceId: cwid }).catch(() => []))
    .filter((t) => t.platform === "instagram").map((t) => t.handle.toLowerCase()).slice(0, limit);
  let suggested: string[] = [];
  let styleSources: string[] = [];
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
    const rows = ((data ?? []) as Record<string, unknown>[]).filter(nicheVetted);
    const handleOf = (r: Record<string, unknown>) => String(r.handle ?? "").toLowerCase();
    // Accounts already judged off don't take a place, so the next ones get read (the page does the same).
    const off = (h: string) => Boolean(memory && fitOf(memory, styleKey("instagram", h), now) === "off");
    suggested = rows.filter((r) => !isStyleSource(r)).map(handleOf).filter((h) => h && !taken.has(h) && !off(h)).slice(0, SUGGESTIONS_READ);
    // Accounts found for their Reels' style, any topic: read for Reels to copy, never suggested.
    styleSources = rows.filter(isStyleSource).map(handleOf).filter((h) => h && !taken.has(h) && !suggested.includes(h)).slice(0, STYLE_SOURCES_READ);
  } catch { /* discovery tables may not exist yet */ }
  return { tracked, suggested, styleSources, limit };
}

export async function readDiscoverAccounts(ctx: Ctx, now: Date): Promise<{ read: number; found: number; styled: number; enabled: boolean }> {
  const memory = await readStyleMemory(ctx);
  const { tracked, suggested, styleSources } = await discoverHandles(ctx, memory, now);
  // Accounts tried in the last day wait, whatever came back, so a failed lookup isn't repeated on every visit.
  // The copy list (accounts the brand copies Reels from) and the accounts SOCIA found from it are read too.
  const copyHandles = [...new Set([...memory.copyFrom, ...Object.keys(memory.copyFound)])].filter((h) => !tracked.includes(h));
  const handles = [...new Set([...tracked, ...suggested, ...styleSources, ...copyHandles])].filter((h) => !triedRecently(memory, styleKey("instagram", h), now));
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
  // Find more like the copy list: handles its accounts mention in their captions (collaborators, credits),
  // read through Business Discovery; kept when made the brand's way and reaching far past their followers.
  const copyFoundNew: Record<string, CopyFound> = {};
  const ownNow = found.own ?? memory.own;
  if (process.env.ANTHROPIC_API_KEY && memory.copyFrom.length && ownNow) {
    const sources = await igCompetitorRows(ctx.client, ctx.ownerId, memory.copyFrom, false, { max: memory.copyFrom.length, cacheOnly: true }).catch(() => null);
    const known = new Set([...memory.copyFrom, ...Object.keys(memory.copyFound), ...tracked, ...suggested, ...styleSources]);
    const lists = (sources?.competitors ?? []).filter((c) => c.found).map((c) => ({ from: c.handle, handles: mentionedHandles((c.media ?? []).map((m) => m.caption), c.handle, known) }));
    const picks: { handle: string; from: string }[] = [];
    for (let i = 0; picks.length < COPY_FIND_PER_READ && lists.some((l) => l.handles.length > i); i++) {
      for (const l of lists) {
        const h = l.handles[i];
        if (h && !picks.some((p) => p.handle === h) && !triedRecently(memory, styleKey("instagram", h), now)) picks.push({ handle: h, from: l.from });
        if (picks.length >= COPY_FIND_PER_READ) break;
      }
    }
    if (picks.length) {
      const read = await igCompetitorRows(ctx.client, ctx.ownerId, picks.map((p) => p.handle), false, { max: picks.length }).catch(() => null);
      const got = (read?.competitors ?? []);
      for (const c of got) tried[styleKey("instagram", c.handle)] = c.found ? { at } : { at, miss: missKind(c.reasonKind) };
      const withMedia = got.filter((c) => c.found && c.media?.length);
      const styles = withMedia.length ? await styleAccounts(ctx.ownerId, withMedia.map((c) => ({ key: styleKey("instagram", c.handle), thumbs: (c.media ?? []).slice(0, COVERS_PER_ACCOUNT).map((m) => m.thumbnail) })), now) : {};
      for (const c of withMedia) {
        const key = styleKey("instagram", c.handle);
        if (styles[key]) found[key] = styles[key];
        if (!sameStyle(styles[key], ownNow)) continue;
        if (!reachesPastFollowers((c.media ?? []).map((m) => m.views), c.followers ?? null)) continue;
        copyFoundNew[c.handle] = { from: picks.find((p) => p.handle === c.handle)?.from ?? "", at };
      }
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
        for (const [key, verdict] of verdicts) fit[key] = { verdict, at, v: FIT_VERSION };
      }
    }
  }
  if (styled || Object.keys(found).length || Object.keys(tried).length || Object.keys(fit).length || Object.keys(copyFoundNew).length) {
    const { own, ...rest } = found;
    // The copy list may have changed while this read ran (someone added an account): keep the saved one.
    const fresh = await readStyleMemory(ctx).catch(() => memory);
    const copyFrom = fresh.copyFrom;
    const copyFound = Object.fromEntries(Object.entries({ ...fresh.copyFound, ...copyFoundNew }).filter(([h, f]) => f.from && copyFrom.includes(f.from) && !copyFrom.includes(h)));
    await saveStyleMemory(ctx, {
      own: own ?? memory.own, accounts: { ...memory.accounts, ...rest }, tried: { ...memory.tried, ...tried }, fit: { ...memory.fit, ...fit },
      copyFrom, copyFound,
    });
  }
  return { read: handles.length, found: res.competitors.filter((c) => c.found).length, styled, enabled: res.enabled };
}
