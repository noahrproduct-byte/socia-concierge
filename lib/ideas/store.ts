// The brand's last set of video ideas, kept on its own row
// (brand_detail.ideas) so they're still there after a reload. Server only.
import type { Ctx } from "@/lib/context";
import { brandWorkspace } from "@/lib/context";
import { updateWorkspace } from "@/lib/workspaces";
import { currentDetail, freshDetail } from "@/lib/intel/understandLoad";
import type { BrandDetail } from "@/lib/profile";
import { sanitizeIdeaSet, type IdeaSet } from "./videoIdeas";

export async function readIdeas(ctx: Ctx): Promise<IdeaSet | null> {
  const d = await currentDetail(ctx).catch(() => ({}) as BrandDetail);
  return sanitizeIdeaSet((d as { ideas?: unknown }).ideas);
}

/** Best effort: ideas that can't be saved are still returned to the person. */
export async function saveIdeas(ctx: Ctx, set: IdeaSet): Promise<boolean> {
  try {
    const detail = await freshDetail(ctx);
    const next = { ...detail, ideas: set } as BrandDetail;
    const ws = brandWorkspace(ctx);
    if (ws) { await updateWorkspace(ctx.client, ctx.ownerId, ws.id, { brand_detail: next }); return true; }
    const { error } = await ctx.client.from("profiles").upsert({ user_id: ctx.ownerId, brand_detail: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    return !error;
  } catch {
    return false;
  }
}
