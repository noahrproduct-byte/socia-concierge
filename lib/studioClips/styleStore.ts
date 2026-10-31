// The brand's video style preset and templates (lib/studioClips/style.ts),
// kept on the brand's own row beside its other settings
// (brand_detail.video). Server only.

import type { Ctx } from "../context";
import { brandWorkspace } from "../context";
import { updateWorkspace } from "../workspaces";
import { currentDetail } from "../intel/understandLoad";
import type { BrandDetail } from "../profile";
import { aspectOf } from "./types";
import { MAX_TEMPLATES, sanitizePresets, type EdlStyle, type VideoPresets } from "./style";

const sizeOk = (w: number, h: number) => aspectOf(w, h).width === w && aspectOf(w, h).height === h;

export async function readPresets(ctx: Ctx): Promise<VideoPresets> {
  const d = await currentDetail(ctx).catch(() => ({}) as BrandDetail);
  return sanitizePresets((d as { video?: unknown }).video, sizeOk);
}

async function savePresets(ctx: Ctx, presets: VideoPresets): Promise<boolean> {
  const detail = await currentDetail(ctx);
  const next = { ...detail, video: presets } as BrandDetail;
  const ws = brandWorkspace(ctx);
  if (ws) return updateWorkspace(ctx.client, ctx.ownerId, ws.id, { brand_detail: next });
  const { error } = await ctx.client.from("profiles").upsert({ user_id: ctx.ownerId, brand_detail: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return !error;
}

export type PresetChange =
  | { action: "brand"; style: EdlStyle; width: number; height: number }
  | { action: "template"; name: string; style: EdlStyle; width: number; height: number }
  | { action: "delete_template"; id: string };

/** Apply one change, bounded the same way as stored presets. */
export async function changePresets(ctx: Ctx, change: PresetChange, now = new Date()): Promise<VideoPresets | null> {
  const cur = await readPresets(ctx);
  let next: unknown = cur;
  if (change.action === "brand") next = { ...cur, brand: { style: change.style, width: change.width, height: change.height } };
  if (change.action === "template") next = { ...cur, templates: [{ id: `tpl${now.getTime().toString(36)}`, name: change.name, style: change.style, width: change.width, height: change.height }, ...cur.templates].slice(0, MAX_TEMPLATES) };
  if (change.action === "delete_template") next = { ...cur, templates: cur.templates.filter((t) => t.id !== change.id) };
  const clean = sanitizePresets(next, sizeOk);
  return (await savePresets(ctx, clean)) ? clean : null;
}
