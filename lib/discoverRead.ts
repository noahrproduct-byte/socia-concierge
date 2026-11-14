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
import { COVERS_PER_ACCOUNT, styleKey, styleStale } from "./discoverStyle";
import { readStyleMemory, saveStyleMemory, styleAccounts } from "./discoverStyleLoad";

/** Suggestions read with the roster, so they show their picture and numbers. */
export const SUGGESTIONS_READ = 12;
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
    const { data } = await q.order("relevance_score", { ascending: false }).limit(40);
    const taken = new Set(tracked);
    suggested = ((data ?? []) as Record<string, unknown>[]).filter(nicheVetted)
      .map((r) => String(r.handle ?? "").toLowerCase()).filter((h) => h && !taken.has(h)).slice(0, SUGGESTIONS_READ);
  } catch { /* discovery tables may not exist yet */ }
  return { tracked, suggested, limit };
}

export async function readDiscoverAccounts(ctx: Ctx, now: Date): Promise<{ read: number; found: number; styled: number; enabled: boolean }> {
  const { tracked, suggested } = await discoverHandles(ctx);
  const handles = [...tracked, ...suggested];
  const res = handles.length
    ? await igCompetitorRows(ctx.client, ctx.ownerId, handles, false, { max: handles.length })
    : { enabled: true, competitors: [] };

  // Styles: the brand's own videos and each account found, when missing or a week old.
  let styled = 0;
  if (process.env.ANTHROPIC_API_KEY) {
    const memory = await readStyleMemory(ctx);
    const jobs: { key: string; thumbs: (string | null)[] }[] = [];
    if (styleStale(memory.own, now)) {
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
      const found = await styleAccounts(ctx.ownerId, jobs, now);
      styled = Object.keys(found).length;
      if (styled) {
        const { own, ...rest } = found;
        await saveStyleMemory(ctx, { own: own ?? memory.own, accounts: { ...memory.accounts, ...rest } });
      }
    }
  }
  return { read: handles.length, found: res.competitors.filter((c) => c.found).length, styled, enabled: res.enabled };
}
