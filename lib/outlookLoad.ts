// The account's own Reels, as the Content Rater's outlook reads them
// (lib/outlook.ts). Reads the brand's stored Instagram snapshot: the same
// posts and view counts every other screen shows. Server only.

import type { Ctx } from "@/lib/context";
import { getIgSnapshot } from "@/lib/instagramSync";
import { buildModel, reelsFrom, type AccountModel } from "./outlook";

export type OutlookPayload = {
  /** false when this brand has no Instagram account connected. */
  connected: boolean;
  handle: string | null;
  /** false = the connection lacks the insights permission, so Reels have no view counts to read. */
  insightsOk: boolean | null;
  model: AccountModel;
};

export async function loadOutlook(ctx: Ctx, now: Date = new Date()): Promise<OutlookPayload> {
  const snap = await getIgSnapshot(ctx.client, ctx.ownerId, ctx.workspace?.id).catch(() => null);
  if (!snap) return { connected: false, handle: null, insightsOk: null, model: buildModel([], 0) };
  const { reels, pending } = reelsFrom(snap.media, now);
  return { connected: true, handle: snap.username, insightsOk: snap.insights_ok, model: buildModel(reels, pending) };
}
