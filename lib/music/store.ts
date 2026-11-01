// The tracks a brand has picked, newest first, kept on the brand's own row
// (brand_detail.music.picks) so the next playlist leans toward them. Server only.
import type { Ctx } from "@/lib/context";
import { brandWorkspace } from "@/lib/context";
import { updateWorkspace } from "@/lib/workspaces";
import { currentDetail } from "@/lib/intel/understandLoad";
import type { BrandDetail } from "@/lib/profile";
import { addPick, sanitizePicks, type MusicPick } from "./taste";

export async function readPicks(ctx: Ctx): Promise<MusicPick[]> {
  const d = await currentDetail(ctx).catch(() => ({}) as BrandDetail);
  return sanitizePicks(((d as { music?: { picks?: unknown } }).music ?? {}).picks);
}

/** Best effort: a pick that can't be saved still plays in the cut. */
export async function rememberPick(ctx: Ctx, pick: MusicPick): Promise<void> {
  try {
    const detail = await currentDetail(ctx);
    const cur = sanitizePicks(((detail as { music?: { picks?: unknown } }).music ?? {}).picks);
    const next = { ...detail, music: { picks: addPick(cur, pick) } } as BrandDetail;
    const ws = brandWorkspace(ctx);
    if (ws) { await updateWorkspace(ctx.client, ctx.ownerId, ws.id, { brand_detail: next }); return; }
    await ctx.client.from("profiles").upsert({ user_id: ctx.ownerId, brand_detail: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  } catch {
    // the cut keeps its track either way
  }
}
