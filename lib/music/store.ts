// The tracks a brand has picked, newest first, kept on the brand's own row
// (brand_detail.music.picks) so the next playlist leans toward them, and
// whether SOCIA adds a track to new videos on its own (brand_detail.music.auto,
// on unless the person turned it off). Server only.
import type { Ctx } from "@/lib/context";
import { brandWorkspace } from "@/lib/context";
import { updateWorkspace } from "@/lib/workspaces";
import { currentDetail } from "@/lib/intel/understandLoad";
import type { BrandDetail } from "@/lib/profile";
import { addPick, sanitizePicks, type MusicPick } from "./taste";

type MusicDetail = { picks?: unknown; auto?: unknown };
const musicOf = (d: BrandDetail): MusicDetail => ((d as { music?: MusicDetail }).music ?? {});

export async function readPicks(ctx: Ctx): Promise<MusicPick[]> {
  const d = await currentDetail(ctx).catch(() => ({}) as BrandDetail);
  return sanitizePicks(musicOf(d).picks);
}

/** Add a track to new videos on its own: on unless turned off. */
export async function readMusicAuto(ctx: Ctx): Promise<boolean> {
  const d = await currentDetail(ctx).catch(() => ({}) as BrandDetail);
  return musicOf(d).auto !== false;
}

async function writeMusic(ctx: Ctx, patch: (cur: MusicDetail) => MusicDetail): Promise<void> {
  const detail = await currentDetail(ctx);
  const next = { ...detail, music: patch(musicOf(detail)) } as BrandDetail;
  const ws = brandWorkspace(ctx);
  if (ws) { await updateWorkspace(ctx.client, ctx.ownerId, ws.id, { brand_detail: next }); return; }
  const { error } = await ctx.client.from("profiles").upsert({ user_id: ctx.ownerId, brand_detail: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function setMusicAuto(ctx: Ctx, on: boolean): Promise<void> {
  await writeMusic(ctx, (cur) => ({ ...cur, auto: on }));
}

/** Best effort: a pick that can't be saved still plays in the cut. */
export async function rememberPick(ctx: Ctx, pick: MusicPick): Promise<void> {
  try {
    await writeMusic(ctx, (cur) => ({ ...cur, picks: addPick(sanitizePicks(cur.picks), pick) }));
  } catch {
    // the cut keeps its track either way
  }
}
