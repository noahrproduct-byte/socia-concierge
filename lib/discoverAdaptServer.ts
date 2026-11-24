// "Adapt to my business" on the server: read a saved adaptation (free), or write one (one AI call, charged as a
// video idea batch, given back when it fails), and keep it on the brand row by Reel and business profile.
// Server only.
import { anthropic, MODEL, effortFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import type { Ctx } from "@/lib/context";
import { brandWorkspace } from "@/lib/context";
import { getProfile, type BrandDetail } from "@/lib/profile";
import { freshDetail, currentDetail } from "@/lib/intel/understandLoad";
import { updateWorkspace } from "@/lib/workspaces";
import { requireUsage } from "@/lib/planGuard";
import { brandLines } from "@/lib/brandBrief";
import { knowledgeLines, sanitizeKnowledge } from "@/lib/brandKnowledge";
import { coverImage } from "@/lib/nicheScan/study";
import { reelKey } from "@/lib/discoverStyle";
import type { ProvenReel } from "@/lib/trendSignals";
import {
  ADAPTATIONS_PER_REEL, ADAPT_SCHEMA, ADAPT_SYSTEM, adaptTask, cleanAdaptation, profileKey, reelFacts, sanitizeAdaptStore, storeWith,
  type AdaptStore, type Adaptation,
} from "@/lib/discoverAdapt";

export class AdaptError extends Error {
  constructor(message: string, public status = 400, public body?: unknown) {
    super(message);
  }
}

/** What the business is, in the lines every writer gets: what the person confirmed and what its website lists. Pure. */
export function businessFrom(detail: BrandDetail | null, niche: string | null, name?: string | null): string[] {
  const d = (detail ?? {}) as BrandDetail & { formats?: unknown; look?: string; avoid?: string; knowledge?: unknown };
  return [
    ...brandLines({
      handle: name ?? null, niche, description: d.description ?? null, specific: d.growth?.niche_path?.specific ?? null,
      audience: d.growth?.audience?.who ?? null, formats: Array.isArray(d.formats) ? (d.formats as never) : null, look: d.look ?? null,
      voice: d.voice ?? null, location: d.location ?? null, avoid: d.avoid ?? null,
    }),
    ...knowledgeLines(sanitizeKnowledge(d.knowledge)).slice(0, 16),
  ];
}

/** The Reel's key in the store: Instagram's short code, or the link. Pure. */
export const adaptKeyOf = (url: string): string => reelKey(url) ?? `u:${profileKey([url])}`;

/** A Reel as sent by the page, made safe: only the fields the prompt uses, bounded. null when it isn't a Reel link. */
export function reelFrom(v: unknown): ProvenReel | null {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const url = typeof o.url === "string" ? o.url.slice(0, 400) : "";
  if (!/^https:\/\/(www\.)?(instagram\.com|youtube\.com|youtu\.be)\//i.test(url)) return null;
  const s = (k: string, n: number) => (typeof o[k] === "string" ? (o[k] as string).slice(0, n) : null);
  const num = (k: string) => (typeof o[k] === "number" && Number.isFinite(o[k]) && (o[k] as number) >= 0 ? (o[k] as number) : null);
  const list = (k: string) => (Array.isArray(o[k]) ? (o[k] as unknown[]).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 60)).slice(0, 4) : []);
  return {
    url, platform: o.platform === "youtube" ? "youtube" : "instagram", accountName: s("accountName", 80) ?? "an account", accountHandle: s("accountHandle", 60),
    accountAvatar: null, title: s("title", 300), thumb: s("thumb", 1000), publishedAt: s("publishedAt", 40), views: num("views"), likes: num("likes"), comments: num("comments"),
    multiplier: num("multiplier"), basis: o.basis === "views" ? "views" : "interactions", format: s("format", 20) ?? "Reel",
    id: "R1", proven: true, line: s("line", 200), structures: list("structures"), topics: list("topics"),
  } as ProvenReel;
}

async function business(ctx: Ctx): Promise<{ lines: string[]; key: string }> {
  const [detail, profile] = await Promise.all([currentDetail(ctx).catch(() => null), getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null)]);
  const lines = businessFrom(detail, profile?.niche ?? null, profile?.brand_name ?? null);
  return { lines, key: profileKey(lines) };
}

async function readStore(ctx: Ctx): Promise<AdaptStore> {
  const d = await currentDetail(ctx).catch(() => ({}) as BrandDetail);
  return sanitizeAdaptStore((d as { adaptations?: unknown }).adaptations);
}

async function saveStore(ctx: Ctx, change: (s: AdaptStore) => AdaptStore): Promise<void> {
  try {
    const detail = await freshDetail(ctx);
    const next = { ...detail, adaptations: change(sanitizeAdaptStore((detail as { adaptations?: unknown }).adaptations)) } as BrandDetail;
    const ws = brandWorkspace(ctx);
    if (ws) { await updateWorkspace(ctx.client, ctx.ownerId, ws.id, { brand_detail: next }); return; }
    await ctx.client.from("profiles").upsert({ user_id: ctx.ownerId, brand_detail: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  } catch (e) {
    console.error("[discover/adapt] not saved:", (e as Error)?.message ?? e);
  }
}

/** The adaptations saved for one Reel under the current business profile (none when the profile changed). Free. */
export async function savedAdaptations(ctx: Ctx, url: string): Promise<Adaptation[]> {
  const [store, biz] = await Promise.all([readStore(ctx), business(ctx)]);
  const e = store[adaptKeyOf(url)];
  return e && e.profile === biz.key ? e.versions : [];
}

/** The Reels this brand has current adaptations for (their keys), so the page can offer them without a call. */
export async function adaptedKeys(ctx: Ctx, detail: BrandDetail | null, niche: string | null, name: string | null): Promise<string[]> {
  const key = profileKey(businessFrom(detail, niche, name));
  const store = sanitizeAdaptStore((detail as { adaptations?: unknown } | null)?.adaptations);
  return Object.entries(store).filter(([, e]) => e.profile === key).map(([k]) => k);
}

const inFlight = new Set<string>();

/**
 * The adaptations for a Reel, writing one when there are none, or one more when the person asks for another
 * (`have` is how many they see: a repeated click finds the one already written and gets it, free).
 */
export async function adaptReel(ctx: Ctx, reel: ProvenReel, opts: { again: boolean; have: number }, now = new Date()): Promise<Adaptation[]> {
  const key = adaptKeyOf(reel.url);
  const [store, biz] = await Promise.all([readStore(ctx), business(ctx)]);
  const saved = store[key]?.profile === biz.key ? store[key].versions : [];
  if (saved.length && (!opts.again || saved.length > opts.have)) return saved;
  if (saved.length >= ADAPTATIONS_PER_REEL) {
    throw new AdaptError(`You've had ${ADAPTATIONS_PER_REEL} adaptations of this Reel. Pick one of them, or edit it in your plan.`, 429);
  }
  const lock = `${ctx.ownerId}:${key}`;
  if (inFlight.has(lock)) throw new AdaptError("SOCIA is already writing this adaptation. It appears in a moment.", 409);
  inFlight.add(lock);
  try {
    const u = await requireUsage(ctx.client, ctx.ownerId, "content_ideas");
    if (u.denied) {
      const body = await u.denied.json().catch(() => ({ error: "Your plan's AI for this month is used up." }));
      throw new AdaptError((body as { error?: string }).error ?? "Your plan's AI for this month is used up.", u.denied.status, body);
    }
    try {
      const cover = await coverImage(reel.thumb);
      const text = adaptTask(reelFacts(reel, Boolean(cover)), biz.lines, saved);
      const res = await anthropic.messages.create({
        model: MODEL, max_tokens: 8000, system: ADAPT_SYSTEM,
        output_config: { format: { type: "json_schema", schema: ADAPT_SCHEMA }, ...effortFor(MODEL, "medium") },
        messages: [{ role: "user", content: [...(cover ? [{ type: "image", source: { type: "base64", ...cover } }] : []), { type: "text", text }] }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      recordAiUsage(ctx.ownerId, "discover_adapt", res);
      const usage = (res as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
      console.log(`[discover/adapt] in=${usage?.input_tokens ?? 0} out=${usage?.output_tokens ?? 0} cover=${Boolean(cover)} stop=${(res as { stop_reason?: string }).stop_reason}`);
      const block = (res as { content: { type: string; text?: string }[] }).content.find((b) => b.type === "text");
      let parsed: unknown = null;
      try { parsed = JSON.parse((block?.text ?? "").replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { parsed = null; }
      const a = cleanAdaptation(parsed, now);
      if (!a) throw new AdaptError("The adaptation came back unreadable. Try again; nothing was used.", 502);
      const versions = [...saved, a];
      await saveStore(ctx, (s) => storeWith(s, key, biz.key, versions, now));
      return versions;
    } catch (e) {
      await u.release();
      throw e;
    }
  } finally {
    inFlight.delete(lock);
  }
}
