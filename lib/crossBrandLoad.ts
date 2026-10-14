// Server side of cross-brand analytics: each Brand Workspace the person owns,
// read exactly as that workspace's own Analytics tab reads it (lib/api/sources
// with the workspace named explicitly), then turned into one row by
// lib/crossBrand.ts. A few brands are read at a time so a 15-brand account
// doesn't fire every platform call at once.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Ctx } from "./context";
import { activeWorkspaceId, listWorkspaces, type Workspace } from "./workspaces";
import type { Entitlements } from "./entitlements";
import { median } from "./metrics";
import { interactionsTotal } from "./engagement";
import { postCards } from "./overview";
import { buildFacebookAnalytics } from "./metrics/facebook";
import { buildTikTokAnalytics } from "./metrics/tiktok";
import type { TtVideo } from "./tiktokAuth";
import { loadSources, rangeFor } from "./api/sources";
import { buildBrandRow, type BrandRow } from "./crossBrand";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

const AT_ONCE = 3;

async function brandRow(client: Supa, userId: string, ent: Entitlements, w: Workspace, days: number | undefined, activeId: string | null): Promise<BrandRow> {
  const ctx: Ctx = { viewerId: userId, ownerId: userId, workspace: w, role: "owner", client, isOwner: true };
  const src = await loadSources(ctx, ent, { days });
  const now = src.now.getTime();
  const ig = src.ig
    ? (() => {
        const baseline = median(src.ig!.media.map(interactionsTotal));
        return {
          handle: src.ig!.snap.username ?? null, followers: src.ig!.snap.followers_count ?? null,
          posts: postCards(src.ig!.media, baseline), baselineSample: src.ig!.media.filter((m) => m.timestamp).length, daily: src.ig!.daily,
        };
      })()
    : null;
  const fb = src.fb
    ? { name: src.fb.snap.page_name ?? null, followers: src.fb.snap.followers_count ?? null, data: buildFacebookAnalytics({ snap: src.fb.snap, snapshots: src.fb.snaps, days: src.days, rangeLabel: src.rangeLabel, now: src.now, insights: src.fb.insights }) }
    : null;
  const tt = src.tt
    ? (() => {
        const td = buildTikTokAnalytics({ row: src.tt as never, days: src.days, rangeLabel: src.rangeLabel, now: src.now });
        return { username: td.profile.username, followers: (src.tt!.follower_count as number | null) ?? null, videos: Array.isArray(src.tt!.videos) ? (src.tt!.videos as TtVideo[]) : [], videosInRange: td.videosInRange };
      })()
    : null;
  return buildBrandRow({ id: w.id, name: w.name, active: w.id === activeId, now, days: src.days, instagram: ig, facebook: fb, youtube: src.yt, tiktok: tt });
}

export async function loadCrossBrand(client: Supa, userId: string, ent: Entitlements, days: number | undefined) {
  const [owned, activeId] = await Promise.all([listWorkspaces(client, userId), activeWorkspaceId(client, userId).catch(() => null)]);
  const brands = owned.filter((w) => !w.suspended);
  const rows: BrandRow[] = new Array(brands.length);
  for (let i = 0; i < brands.length; i += AT_ONCE) {
    const batch = brands.slice(i, i + AT_ONCE);
    const done = await Promise.all(batch.map((w) => brandRow(client, userId, ent, w, days, activeId).catch((e) => {
      console.error("[cross-brand]", w.id, (e as Error)?.message ?? e);
      return { id: w.id, name: w.name, active: w.id === activeId, platforms: [], postsTotal: 0, best: null, error: true } as BrandRow & { error: true };
    })));
    done.forEach((r, k) => { rows[i + k] = r; });
  }
  const r = rangeFor(ent, days);
  return {
    range: { days: r.days, label: r.label, ...(r.clampedFrom ? { note: `Shortened from ${r.clampedFrom} days to the plan's analytics history.` } : {}) },
    brands: rows,
    paused: owned.length - brands.length,
  };
}
