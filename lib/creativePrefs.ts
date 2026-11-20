// The creative directions a brand has chosen (Ask SOCIA's reference gallery,
// lib/research/direction.ts), kept on the brand (brand_detail.creative) so
// later suggestions can start from the styles this person picks. A choice is
// what they liked, not proof it works for them: their own results decide that
// (lib/starter/readiness.ts, the experiments). Pure parts plus one save.

import type { Ctx } from "./context";
import { brandWorkspace } from "./context";
import { updateWorkspace } from "./workspaces";
import { freshDetail } from "./intel/understandLoad";
import type { BrandDetail } from "./profile";
import { isCreativeStyle, styleLabel, type CreativeStyle } from "./research/direction";

export type CreativePrefs = { styles: Partial<Record<CreativeStyle, number>>; last?: CreativeStyle[]; updated_at?: string };

/** The prefs after choosing these styles: each counts once per choice. */
export function withChoice(prev: CreativePrefs | null | undefined, styles: CreativeStyle[], now: Date): CreativePrefs {
  const counts: Partial<Record<CreativeStyle, number>> = { ...(prev?.styles ?? {}) };
  for (const s of new Set(styles)) if (isCreativeStyle(s)) counts[s] = Math.min(999, (counts[s] ?? 0) + 1);
  return { styles: counts, last: [...new Set(styles)].filter(isCreativeStyle).slice(0, 2), updated_at: now.toISOString() };
}

/** The styles this brand chose most, as a prompt line; "" when none. */
export function prefsLine(p: CreativePrefs | null | undefined): string {
  const top = Object.entries(p?.styles ?? {}).filter(([k, n]) => isCreativeStyle(k) && (n ?? 0) > 0).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 3);
  if (!top.length) return "";
  return `Creative styles this person has chosen before in Ask SOCIA: ${top.map(([k, n]) => `${styleLabel(k as CreativeStyle)} (${n} ${n === 1 ? "time" : "times"})`).join(", ")}. A preference, not proof it works for their account: offer one of these among the options, and judge by their own results.`;
}

/** Record a choice on the brand. Best-effort: false when it couldn't be saved. */
export async function recordChoice(ctx: Ctx, styles: CreativeStyle[], now = new Date()): Promise<boolean> {
  try {
    const detail = await freshDetail(ctx);
    const next = { ...detail, creative: withChoice((detail as BrandDetail & { creative?: CreativePrefs }).creative, styles, now) } as BrandDetail;
    const ws = brandWorkspace(ctx);
    if (ws) return await updateWorkspace(ctx.client, ctx.ownerId, ws.id, { brand_detail: next });
    const { error } = await ctx.client.from("profiles").upsert({ user_id: ctx.ownerId, brand_detail: next, updated_at: now.toISOString() }, { onConflict: "user_id" });
    return !error;
  } catch { return false; }
}
