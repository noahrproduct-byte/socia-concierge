// "Draw the storyboard" on the server: price it, start one AI Studio image job per shot (each charged
// and, if it fails, refunded by lib/generation/server.ts), then turn finished jobs into drawings saved on
// the plan post's beats. Links are signed here and only for drawings in the owner's own folder.
// Server only.
import { createServiceClient } from "@/lib/supabase/service";
import { scopeToWorkspace } from "@/lib/workspaces";
import type { Ctx } from "@/lib/context";
import type { Entitlements } from "@/lib/entitlements";
import type { Deliverable, PlanBeat } from "@/lib/schema";
import { creditBalance, CreditsError } from "@/lib/credits/ledger";
import { creditsShortCopy } from "@/lib/credits/config";
import { topupsOpen } from "@/lib/credits/topups";
import { createGenerationJob, loadGenerationJob, loadGenerations, quoteGeneration } from "@/lib/generation/server";
import { GenerationError } from "@/lib/generation/provider";
import { refreshGenerationJob } from "@/lib/aiStudio/runner";
import { signedUrl } from "@/lib/aiStudio/media";
import { STORYBOARD_MODEL, STORYBOARD_SHAPE, framePrompt, isFrameJob, isFramePath, isOwnFrame } from "@/lib/storyboardDraw";

type PlanItem = Deliverable["weeklyPlan"][number];

export type FrameView = { state: "none" | "drawing" | "drawn" | "failed"; url: string | null; error?: string };

type Loaded = { data: Deliverable; index: number; item: PlanItem };

async function loadItem(ctx: Ctx, planId: string, itemId: string): Promise<Loaded> {
  const { data: row, error } = await scopeToWorkspace(
    ctx.client.from("plans").select("id, data").eq("id", planId).eq("user_id", ctx.ownerId),
    ctx.workspace?.id,
  ).maybeSingle();
  if (error) throw new GenerationError(error.message, "db");
  const data = (row as { data: Deliverable } | null)?.data;
  const index = data?.weeklyPlan?.findIndex((p) => p.id === itemId) ?? -1;
  if (!data || index < 0) throw new GenerationError("That post isn't in this plan any more.", "not_found");
  return { data, index, item: data.weeklyPlan[index] };
}

/** Save one post's beats back to the plan, reading the plan again first so other edits made meanwhile stay. */
async function saveBeats(ctx: Ctx, planId: string, itemId: string, edit: (beats: PlanBeat[]) => PlanBeat[]): Promise<PlanBeat[]> {
  const { data, index, item } = await loadItem(ctx, planId, itemId);
  const beats = edit(item.beats ?? []);
  const weeklyPlan = data.weeklyPlan.map((p, k) => (k === index ? { ...p, beats } : p));
  const { error } = await scopeToWorkspace(
    ctx.client.from("plans").update({ data: { ...data, weeklyPlan } }).eq("id", planId).eq("user_id", ctx.ownerId),
    ctx.workspace?.id,
  );
  if (error) throw new GenerationError(error.message, "db");
  return beats;
}

/** The shots still to draw: no drawing and no job running. */
const toDraw = (beats: PlanBeat[]): number[] => beats.flatMap((b, k) => (isFramePath(b.frame) || isFrameJob(b.frameJob) ? [] : [k]));

function drawable(item: PlanItem): PlanBeat[] {
  if (item.animated) throw new GenerationError("Animated posts are made by SOCIA, so there's nothing to film or draw.", "not_filmed");
  const beats = item.beats ?? [];
  if (beats.length < 2) throw new GenerationError("This post has no shots to draw.", "no_beats");
  return beats;
}

/** What drawing the shots still to draw costs, from the image service's live price. Nothing runs. */
export async function quoteStoryboard(ctx: Ctx, ent: Entitlements, planId: string, itemId: string): Promise<{ shots: number; perShot: number; credits: number; balance: number | null }> {
  const { item } = await loadItem(ctx, planId, itemId);
  const shots = toDraw(drawable(item)).length;
  const { credits: perShot } = await quoteGeneration({ kind: "text_to_image", modelId: STORYBOARD_MODEL, prompt: "", aspectRatio: STORYBOARD_SHAPE, plan: ent.plan });
  const balance = await creditBalance(ctx.ownerId, ent).catch(() => null);
  return { shots, perShot, credits: perShot * shots, balance };
}

/**
 * Start a drawing for every shot still without one. The whole price is checked against the balance
 * first, so a short balance starts nothing; each shot is then its own job, charged as it starts.
 */
export async function startStoryboard(ctx: Ctx, ent: Entitlements, planId: string, itemId: string, opts: { webhookUrl?: string; niche?: string | null } = {}): Promise<{ started: number; credits: number }> {
  const { item } = await loadItem(ctx, planId, itemId);
  const beats = drawable(item);
  const todo = toDraw(beats);
  if (!todo.length) return { started: 0, credits: 0 };
  const { credits: perShot } = await quoteGeneration({ kind: "text_to_image", modelId: STORYBOARD_MODEL, prompt: "", aspectRatio: STORYBOARD_SHAPE, plan: ent.plan });
  const balance = await creditBalance(ctx.ownerId, ent);
  if (balance != null && balance < perShot * todo.length) throw new CreditsError("insufficient_credits", creditsShortCopy(topupsOpen()), balance);

  const jobs = new Map<number, string>();
  let charged = 0;
  let failure: unknown = null;
  for (const k of todo) {
    try {
      const job = await createGenerationJob(ctx, {
        kind: "text_to_image", modelId: STORYBOARD_MODEL, aspectRatio: STORYBOARD_SHAPE, plan: ent.plan,
        prompt: framePrompt(beats[k], { niche: opts.niche }),
        idea: { id: "storyboard", hook: `Storyboard, shot ${k + 1}: ${beats[k].label}`.slice(0, 120), shot: beats[k].show },
        webhookUrl: opts.webhookUrl,
      });
      jobs.set(k, job.id);
      charged += job.credits_reserved;
    } catch (e) {
      failure = e;
      break;
    }
  }
  if (jobs.size) {
    await saveBeats(ctx, planId, itemId, (cur) => cur.map((b, k) => (jobs.has(k) && !isFramePath(b.frame) ? { ...b, frameJob: jobs.get(k)! } : b)));
  }
  if (failure && !jobs.size) throw failure;
  return { started: jobs.size, credits: charged };
}

/**
 * Where each shot's drawing stands, moving running jobs along: a finished one is saved on its beat, a
 * failed one is cleared (its credits were refunded) so it can be drawn again.
 */
export async function refreshStoryboard(ctx: Ctx, planId: string, itemId: string): Promise<FrameView[]> {
  const { item } = await loadItem(ctx, planId, itemId);
  const beats = item.beats ?? [];
  const done = new Map<number, string>();
  const failed = new Map<number, string>();
  for (const [k, b] of beats.entries()) {
    if (isFramePath(b.frame) || !isFrameJob(b.frameJob)) continue;
    let job = await loadGenerationJob(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, b.frameJob);
    if (!job) { failed.set(k, "The drawing was removed."); continue; }
    job = await refreshGenerationJob(job);
    if (job.status === "done") {
      const out = (await loadGenerations(ctx.client, ctx.ownerId, job.id)).find((g) => g.kind === "image" && isOwnFrame(g.output_path, ctx.ownerId));
      if (out?.output_path) done.set(k, out.output_path);
      else failed.set(k, "The drawing finished but couldn't be saved. Draw it again.");
    } else if (job.status === "failed" || job.status === "cancelled") {
      failed.set(k, job.error ?? "The drawing failed. Its credits were given back.");
    }
  }
  let now = beats;
  if (done.size || failed.size) {
    now = await saveBeats(ctx, planId, itemId, (cur) => cur.map((b, k) => {
      if (done.has(k)) return { ...b, frame: done.get(k)!, frameJob: undefined };
      if (failed.has(k)) return { ...b, frameJob: undefined };
      return b;
    }));
  }
  const svc = createServiceClient();
  return Promise.all(now.map(async (b, k): Promise<FrameView> => {
    if (isOwnFrame(b.frame, ctx.ownerId)) return { state: "drawn", url: svc ? await signedUrl(svc, b.frame) : null };
    if (failed.has(k)) return { state: "failed", url: null, error: failed.get(k) };
    if (isFrameJob(b.frameJob)) return { state: "drawing", url: null };
    return { state: "none", url: null };
  }));
}
