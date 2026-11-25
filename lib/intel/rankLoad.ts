// Server side of the account ranking (lib/intel/rank.ts): gather each tracked
// account's saved numbers (Instagram reads SOCIA already stored, follower
// history, SOCIA's fit and style checks) and rank them. No platform calls and
// no model: everything comes from what SOCIA has saved. Server only.

import { igCompetitorRows } from "../igCompetitorData";
import { listTracked } from "../trackedCompetitors";
import { scopeToWorkspace } from "../workspaces";
import { getIgSnapshot } from "../instagramSync";
import { median } from "../metrics";
import { locationTokens } from "../competitorPatterns";
import { fitOf, sameStyle, sanitizeMemory, styleKey } from "../discoverStyle";
import type { BrandDetail } from "../profile";
import { growth30, keyOf, rankAccounts, type RankInput, type Ranked } from "./rank";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = any;

const DAY = 86_400_000;

/** The brand's details for a competitor scope: its own workspace row, or the owner's profile for the default brand. */
export async function brandDetailFor(client: Supa, ownerId: string, scopeId: string | null): Promise<BrandDetail | null> {
  try {
    if (scopeId) {
      const { data } = await client.from("workspaces").select("brand_detail, is_default").eq("id", scopeId).maybeSingle();
      const row = data as { brand_detail?: BrandDetail | null; is_default?: boolean } | null;
      if (row && !row.is_default) return row.brand_detail ?? null;
    }
    const { data } = await client.from("profiles").select("brand_detail").eq("user_id", ownerId).maybeSingle();
    return ((data as { brand_detail?: BrandDetail | null } | null)?.brand_detail) ?? null;
  } catch { return null; }
}

/** The accounts the person marked as priority, as "platform:handle" keys. */
export const pinsOf = (d: BrandDetail | null | undefined): string[] =>
  (Array.isArray((d as { competitorPins?: unknown } | null)?.competitorPins) ? ((d as { competitorPins: unknown[] }).competitorPins) : [])
    .filter((x): x is string => typeof x === "string" && /^[a-z]+:[a-z0-9._-]{1,60}$/.test(x));

/** Followers over about 30 days per account, from the daily history SOCIA keeps (lib/competitorHistory.ts). */
async function growthByKey(client: Supa, ownerId: string, scopeId: string | null, handles: string[], now: Date): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!handles.length) return out;
  try {
    const { data } = await scopeToWorkspace(client.from("competitor_snapshots").select("platform, handle, day, followers").eq("user_id", ownerId), scopeId)
      .in("handle", handles).gte("day", new Date(now.getTime() - 40 * DAY).toISOString().slice(0, 10));
    const by = new Map<string, { day: string; followers: number | null }[]>();
    for (const r of (data ?? []) as { platform: string; handle: string; day: string; followers: number | null }[]) {
      const k = keyOf(r.platform, r.handle);
      by.set(k, [...(by.get(k) ?? []), { day: r.day, followers: r.followers }]);
    }
    for (const [k, rows] of by) { const g = growth30(rows, now); if (g != null) out.set(k, g); }
  } catch { /* no history yet */ }
  return out;
}

/**
 * The brand's tracked accounts, ranked best first, with the reasons. Instagram
 * accounts carry their saved Business Discovery numbers; others rank on what
 * is known (follower history, priority).
 */
export async function rankRoster(opts: { client: Supa; ownerId: string; scopeId: string | null; detail?: BrandDetail | null; now?: Date }): Promise<Ranked[]> {
  const { client, ownerId, scopeId } = opts;
  const now = opts.now ?? new Date();
  const [tracked, detail] = await Promise.all([
    listTracked<{ platform: string; handle: string }>(client, ownerId, "platform, handle", { workspaceId: scopeId }).catch(() => []),
    opts.detail !== undefined ? Promise.resolve(opts.detail) : brandDetailFor(client, ownerId, scopeId),
  ]);
  if (!tracked.length) return [];
  const handles = [...new Set(tracked.map((t) => t.handle.replace(/^@/, "").toLowerCase()))];
  const igHandles = tracked.filter((t) => t.platform === "instagram").map((t) => t.handle.replace(/^@/, "").toLowerCase());
  const [ig, growth, snap] = await Promise.all([
    igHandles.length ? igCompetitorRows(client, ownerId, igHandles, false, { max: igHandles.length, cacheOnly: true }).catch(() => null) : Promise.resolve(null),
    growthByKey(client, ownerId, scopeId, handles, now),
    getIgSnapshot(client, ownerId, scopeId).catch(() => null),
  ]);
  const memory = sanitizeMemory((detail as { discover?: unknown } | null)?.discover);
  const pins = new Set(pinsOf(detail));
  const g = detail?.growth;
  const servesLocally = g?.business?.service_area === "local" || g?.audience?.where === "local";
  const city = locationTokens(detail?.location);
  const igBy = new Map((ig?.competitors ?? []).filter((c) => c.found).map((c) => [c.handle.toLowerCase(), c]));
  const since = now.getTime() - 60 * DAY;

  const inputs: RankInput[] = tracked.map((t) => {
    const handle = t.handle.replace(/^@/, "").toLowerCase();
    const key = keyOf(t.platform, handle);
    const c = t.platform === "instagram" ? igBy.get(handle) : undefined;
    const videos = (c?.media ?? []).filter((m) => m.mediaType === "VIDEO" && (!m.timestamp || Date.parse(m.timestamp) >= since));
    const views = videos.map((m) => m.views).filter((v): v is number => v != null);
    const usual = views.length >= 3 ? median(views) : null;
    const style = styleKey(t.platform as "instagram" | "youtube", handle);
    const bio = (c?.biography ?? "").toLowerCase();
    return {
      platform: t.platform, handle, fit: fitOf(memory, style, now), followers: c?.followers ?? null, medianViews: usual,
      engagement: c?.engagementRate ?? null, postsPerWeek: c?.postsPerWeek ?? null,
      breakouts: usual ? views.filter((v) => v >= usual * 3).length : 0,
      sameStyle: sameStyle(memory.accounts[style], memory.own), growth30: growth.get(key) ?? null,
      local: servesLocally && city.length ? city.some((tok) => bio.includes(tok)) : null,
      pinned: pins.has(key),
    };
  });
  return rankAccounts(inputs, { followers: snap?.followers_count ?? null, servesLocally });
}
