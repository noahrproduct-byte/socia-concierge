// Naming the style of an account's videos from their cover images, and the
// brand's memory of it (lib/discoverStyle.ts). The memory sits on the brand row
// (brand_detail.discover), like the rater's log, so it needs no table. Server only.

import type { Ctx } from "@/lib/context";
import { brandWorkspace } from "@/lib/context";
import { updateWorkspace } from "@/lib/workspaces";
import { currentDetail, freshDetail } from "@/lib/intel/understandLoad";
import type { BrandDetail } from "@/lib/profile";
import { anthropic, FAST_MODEL, effortFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { coverImage } from "@/lib/nicheScan/study";
import { accountStyle, isStyle, sanitizeMemory, STYLES, STYLE_MEANS, type AccountStyle, type Style, type StyleMemory } from "./discoverStyle";

/** Covers sent in one model call. */
const PER_CALL = 20;

export async function readStyleMemory(ctx: Ctx): Promise<StyleMemory> {
  const d = await currentDetail(ctx).catch(() => ({}) as BrandDetail);
  return sanitizeMemory((d as { discover?: unknown }).discover);
}

/** Best effort: a memory that can't be saved is read again next time. */
export async function saveStyleMemory(ctx: Ctx, m: StyleMemory): Promise<boolean> {
  try {
    const detail = await freshDetail(ctx);
    const next = { ...detail, discover: sanitizeMemory(m) } as BrandDetail;
    const ws = brandWorkspace(ctx);
    if (ws) return await updateWorkspace(ctx.client, ctx.ownerId, ws.id, { brand_detail: next });
    const { error } = await ctx.client.from("profiles").upsert({ user_id: ctx.ownerId, brand_detail: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    return !error;
  } catch {
    return false;
  }
}

const schema = {
  type: "object", additionalProperties: false,
  properties: {
    covers: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        properties: { id: { type: "string" }, style: { type: "string", enum: [...STYLES, "unclear"] } },
        required: ["id", "style"],
      },
    },
  },
  required: ["covers"],
} as const;

const SYSTEM = `You look at the cover image of a short video or post and say how it was made, as one of these styles:
${STYLES.map((s) => `- ${s}: ${STYLE_MEANS[s]}`).join("\n")}
- unclear: the image doesn't show which.
Judge only what the image shows. Return every id you were given.`;

/** Each cover's style, by id; null when it couldn't be read or looked unclear. */
export async function classifyCovers(ownerId: string, covers: { id: string; thumb: string | null }[]): Promise<Map<string, Style | null>> {
  const out = new Map<string, Style | null>();
  for (let i = 0; i < covers.length; i += PER_CALL) {
    const batch = covers.slice(i, i + PER_CALL);
    const images = await Promise.all(batch.map((c) => coverImage(c.thumb)));
    type Block = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } };
    const content: Block[] = [];
    batch.forEach((c, j) => {
      const img = images[j];
      if (!img) { out.set(c.id, null); return; }
      content.push({ type: "text", text: `[${c.id}]` });
      content.push({ type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } });
    });
    if (!content.length) continue;
    const res = (await anthropic.messages.create({
      model: FAST_MODEL, max_tokens: 1500, system: SYSTEM,
      output_config: { format: { type: "json_schema", schema }, ...effortFor(FAST_MODEL, "low") },
      messages: [{ role: "user", content }],
    } as never)) as unknown as { content: { type: string; text?: string }[] };
    recordAiUsage(ownerId, "discover_styles", res);
    let rows: { id?: unknown; style?: unknown }[] = [];
    try {
      const parsed = JSON.parse(res.content.find((b) => b.type === "text")?.text ?? "{}") as { covers?: { id?: unknown; style?: unknown }[] };
      rows = Array.isArray(parsed.covers) ? parsed.covers : [];
    } catch {
      rows = [];
    }
    const byId = new Map(rows.filter((r) => typeof r.id === "string").map((r) => [r.id as string, r.style]));
    batch.forEach((c, j) => { if (images[j]) out.set(c.id, isStyle(byId.get(c.id)) ? (byId.get(c.id) as Style) : null); });
  }
  return out;
}

/** Each account's style from its covers, by key; accounts whose covers couldn't be read are left out. */
export async function styleAccounts(ownerId: string, accounts: { key: string; thumbs: (string | null)[] }[], now: Date): Promise<Record<string, AccountStyle>> {
  const covers = accounts.flatMap((a) => a.thumbs.filter(Boolean).map((t, i) => ({ id: `${a.key}#${i}`, thumb: t })));
  if (!covers.length) return {};
  const labels = await classifyCovers(ownerId, covers);
  const out: Record<string, AccountStyle> = {};
  for (const a of accounts) {
    const s = accountStyle(a.thumbs.filter(Boolean).map((_, i) => labels.get(`${a.key}#${i}`) ?? null), now.toISOString());
    if (s) out[a.key] = s;
  }
  return out;
}
