// Server side of growth opportunities (lib/intel/opportunities.ts): the
// brand's saved intelligence profile, its own recent posts and its posting
// target, compared in code. No platform call and no model: cheap enough for
// every Dashboard and Strategy view. Server only.

import type { Ctx } from "../context";
import { brandWorkspace } from "../context";
import { competitorScopeId } from "../workspaces";
import { getIgSnapshot, type IgMediaItem } from "../instagramSync";
import { getProfile, type BrandDetail } from "../profile";
import { locationTokens } from "../competitorPatterns";
import { intelFor } from "./profileLoad";
import type { IntelProfile } from "./profile";
import { findOpportunities, type Opportunity } from "./opportunities";

const FORMAT: Record<string, string> = { VIDEO: "Reel", CAROUSEL_ALBUM: "Carousel", IMAGE: "Photo" };

export async function opportunitiesFor(ctx: Ctx, now = new Date()): Promise<Opportunity[]> {
  const [profile, scopeId, snap] = await Promise.all([
    getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null),
    competitorScopeId(ctx.client, ctx.workspace?.id ?? null).catch(() => ctx.workspace?.id ?? null),
    getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => null),
  ]);
  const location = profile?.brand_detail?.location ?? null;
  const intel = await intelFor({ client: ctx.client, ownerId: ctx.ownerId, scopeId }, { need: "saved", location, now }).catch(() => null);
  return opportunitiesFrom(intel, snap?.media ?? [], profile?.brand_detail ?? null, now);
}

/** The same, from a profile and posts a caller already loaded (plans, Ask SOCIA, the strategy writer). */
export function opportunitiesFrom(intel: IntelProfile | null, media: IgMediaItem[], detail: BrandDetail | null, now = new Date()): Opportunity[] {
  if (!intel) return [];
  return findOpportunities({
    signals: intel.niche?.signals ?? null,
    provenFormats: (intel.niche?.proven ?? []).map((r) => r.format),
    own: media.filter((m) => !m.collab_owner).map((m) => ({ caption: m.caption ?? null, format: FORMAT[m.media_type ?? ""] ?? "Post", at: m.timestamp ?? null })),
    rosterPace: (intel.roster ?? []).map((r) => r.stats?.postsPerWeek).filter((v): v is number => v != null),
    targetPerWeek: detail?.growth?.routine?.post_days ?? null,
    loc: locationTokens(detail?.location ?? null),
    now,
  });
}
