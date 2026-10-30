// Runs account understanding for the brand in ctx: reads every connected
// account the way Analytics does, builds the sample, asks the model for the
// inferred profile (one account audit from the plan's allowance, given back
// when nothing usable comes out), and stores it under
// brand_detail.growth.understanding. Confirmed answers are never touched.
//
// Server only.

import type { Ctx } from "../context";
import { brandWorkspace } from "../context";
import { anthropic, MODEL, effortFor } from "../anthropic";
import { recordAiUsage } from "../aiUsage";
import { requireUsage } from "../planGuard";
import { loadSources } from "../api/sources";
import { updateWorkspace } from "../workspaces";
import type { BrandDetail } from "../profile";
import type { TtVideo } from "../tiktokAuth";
import { buildAccountSample, sampleIsEnough } from "./accountSample";
import { UNDERSTAND_SYSTEM, normalizeUnderstanding, understandPrompt, understandingSchema, type Understanding } from "./understanding";

export type UnderstandResult =
  | { status: "done"; understanding: Understanding }
  | { status: "no_accounts" }
  | { status: "too_little"; posts: number; understanding: Understanding }
  | { status: "denied"; response: Response }
  | { status: "failed"; reason: string };

async function currentDetail(ctx: Ctx): Promise<BrandDetail> {
  const ws = brandWorkspace(ctx);
  if (ws) return (ws.brand_detail ?? {}) as BrandDetail;
  const { data } = await ctx.client.from("profiles").select("brand_detail").eq("user_id", ctx.ownerId).maybeSingle();
  return ((data as { brand_detail?: BrandDetail } | null)?.brand_detail ?? {}) as BrandDetail;
}

/** Store the understanding beside the confirmed profile, on the brand's own row. */
export async function saveUnderstanding(ctx: Ctx, u: Understanding): Promise<boolean> {
  const detail = await currentDetail(ctx);
  const next: BrandDetail = { ...detail, growth: { ...(detail.growth ?? {}), understanding: u } };
  const ws = brandWorkspace(ctx);
  if (ws) return updateWorkspace(ctx.client, ctx.ownerId, ws.id, { brand_detail: next });
  const { error } = await ctx.client.from("profiles").upsert({ user_id: ctx.ownerId, brand_detail: next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  return !error;
}

export async function runUnderstanding(ctx: Ctx): Promise<UnderstandResult> {
  const usage = await requireUsage(ctx.client, ctx.ownerId, "account_audit");
  if (usage.denied) return { status: "denied", response: usage.denied };
  try {
    const src = await loadSources(ctx, usage.ent, { days: 90 });
    const sample = buildAccountSample({
      now: src.now,
      ig: src.ig ? { username: src.ig.snap.username, name: src.ig.snap.name, biography: src.ig.snap.biography, followers: src.ig.snap.followers_count, media: src.ig.media } : null,
      fb: src.fb ? { name: src.fb.snap.page_name, followers: src.fb.snap.followers_count, posts: src.fb.snap.posts ?? [] } : null,
      yt: src.yt ? { title: src.yt.channel.title, handle: src.yt.channel.handle, subscribers: src.yt.channel.subscribers, videos: src.yt.topVideos ?? [] } : null,
      tt: src.tt ? { username: (src.tt.username as string | null) ?? null, followers: (src.tt.follower_count as number | null) ?? null, videos: Array.isArray(src.tt.videos) ? (src.tt.videos as TtVideo[]) : [] } : null,
    });
    if (!sample.facts.length) {
      await usage.release();
      return { status: "no_accounts" };
    }
    if (!sampleIsEnough(sample) || !process.env.ANTHROPIC_API_KEY) {
      await usage.release();
      // Facts alone are still true and worth keeping.
      const facts = normalizeUnderstanding({}, sample.facts, src.now);
      facts.limitations = ["Too few posts with captions to infer the niche or audience. Fill them in yourself."];
      await saveUnderstanding(ctx, facts);
      return { status: "too_little", posts: sample.posts.length, understanding: facts };
    }
    const params = {
      model: MODEL,
      max_tokens: 1600,
      system: UNDERSTAND_SYSTEM,
      output_config: { format: { type: "json_schema", schema: understandingSchema }, ...effortFor(MODEL) },
      messages: [{ role: "user", content: understandPrompt(sample) }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anthropic.messages.create(params as any);
    recordAiUsage(ctx.ownerId, "account_audit", res);
    const block = res.content.find((b: { type: string }) => b.type === "text");
    const text = block && "text" in block ? (block as { text: string }).text : "";
    let raw: unknown = null;
    try {
      raw = JSON.parse(text);
    } catch {
      raw = null;
    }
    if (!raw) {
      await usage.release();
      return { status: "failed", reason: "The analysis came back unreadable. Try again." };
    }
    const u = normalizeUnderstanding(raw, sample.facts, src.now);
    if (!(await saveUnderstanding(ctx, u))) return { status: "failed", reason: "Couldn't save the analysis. Try again." };
    return { status: "done", understanding: u };
  } catch (e) {
    await usage.release();
    console.error("[understand] failed:", e instanceof Error ? e.message : e);
    return { status: "failed", reason: "SOCIA couldn't read your accounts just now. Try again in a minute." };
  }
}
