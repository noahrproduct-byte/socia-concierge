// The plan built one day at a time, on the server (lib/planSteps.ts has the pure part): start a plan, write a
// day's idea, accept / try another / edit, write an accepted day's full post, and write the week-level read
// once every day is in. Each call sends the same system prompt and the same account context first, both
// cached for an hour, so a plan's many small calls pay full price for that context once (Noah, 2026-11-23).
// Every call logs its token use and cache reads under [plan-steps], so the savings can be checked.
// Server only.
import { anthropic, MODEL, effortFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { SYSTEM, buildUserPrompt } from "@/lib/prompt";
import { deliverableSchema, type BuildSlot, type Deliverable, type GenerateInput, type IdeaCard, type PlanBuild, type SavedPlan } from "@/lib/schema";
import { polishItem, savePlan } from "@/lib/planGenerate";
import { planHeadline } from "@/lib/planHeadline";
import { withItemIds } from "@/lib/planItems";
import { requireUsage } from "@/lib/planGuard";
import { scopeToWorkspace } from "@/lib/workspaces";
import type { Ctx } from "@/lib/context";
import type { BrandDetail } from "@/lib/profile";
import type { Evidence } from "@/lib/planEvidence";
import { ANIMATED_SYSTEM } from "@/lib/animated/planPosts";
import { loadPlanContext, planMixFor } from "@/lib/planContext";
import {
  IDEA_SCHEMA, PLANS_PER_WEEK, StepError, acceptDay, allWritten, auditSchema, auditTask, beginRetry, cleanIdeaCard,
  detailsTask, editDay, finishDay, ideaTask, ideasBeyondSlots, newBuild, nextWaiting, ownIdeaFor, planSlots, reviewingIndex,
  rewriteDay, pickEarlier, withIdea,
} from "@/lib/planSteps";

const COLS = "id, client_handle, niche, platform, data, created_at";
const WEEK_MS = 7 * 86_400_000;

type Bundle = { brand: BrandDetail | null; evidence: Evidence | null; context: string };

async function bundleFor(ctx: Ctx, input: GenerateInput): Promise<Bundle> {
  const { brand, evidence } = await loadPlanContext(ctx, input);
  return { brand, evidence, context: buildUserPrompt(input, brand, evidence, { context: true }) };
}

/** One step's call: the cached system prompt and account context, then this step's task; a JSON answer. */
async function stepCall(ownerId: string, step: string, context: string, task: string, schema: object, maxTokens: number): Promise<unknown> {
  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral", ttl: "1h" } }],
    messages: [{ role: "user", content: [
      { type: "text", text: context, cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: task },
    ] }],
    output_config: { format: { type: "json_schema", schema }, ...effortFor(MODEL, "medium") },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await anthropic.messages.stream(params as any).finalMessage();
  recordAiUsage(ownerId, "content_plan", res);
  const u = res.usage as { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
  console.log(`[plan-steps] ${step} in=${u.input_tokens ?? 0} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} out=${u.output_tokens ?? 0} stop=${res.stop_reason}`);
  if (res.stop_reason === "refusal") throw new StepError("The AI declined this one. Try another idea or edit it.", 422);
  if (res.stop_reason === "max_tokens") throw new StepError("The answer ran out of room. Try again.", 502);
  const block = res.content.find((b) => b.type === "text");
  const text = block && "text" in block ? block.text : "";
  try {
    return JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim());
  } catch {
    throw new StepError("The answer couldn't be read. Try again.", 502);
  }
}

async function writeIdea(ctx: Ctx, build: PlanBuild, index: number, bundle: Bundle): Promise<IdeaCard> {
  const slot = build.slots[index];
  const raw = await stepCall(ctx.ownerId, `idea ${slot.key}`, bundle.context, ideaTask(build, index, ANIMATED_SYSTEM), IDEA_SCHEMA, 8000);
  const own = slot.tries === 0 ? ownIdeaFor(build.input, build.slots, index) : null;
  const idea = cleanIdeaCard(raw, slot.kind, own?.n);
  if (!idea) throw new StepError("No idea came back. Try again.", 502);
  return idea;
}

// ---------------------------------------------------------------------------
// The plan row
// ---------------------------------------------------------------------------

async function readPlan(ctx: Ctx, planId: string): Promise<SavedPlan> {
  const { data, error } = await scopeToWorkspace(ctx.client.from("plans").select(COLS).eq("id", planId).eq("user_id", ctx.ownerId), ctx.workspace?.id).maybeSingle();
  if (error) throw new StepError("The plan couldn't be read. Try again.", 500);
  const plan = data as SavedPlan | null;
  if (!plan?.data?.build) throw new StepError("That plan isn't being built step by step.", 404);
  return plan;
}

/**
 * Change a plan safely: read it, apply the change, and save only if nobody saved in between (the build's
 * `rev` is unchanged); otherwise read it again and reapply. A day's post written in the background and the
 * next day's idea can finish at the same moment, and neither may overwrite the other.
 */
async function patchPlan(ctx: Ctx, planId: string, edit: (d: Deliverable) => Deliverable): Promise<SavedPlan> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const plan = await readPlan(ctx, planId);
    const rev = plan.data.build!.rev ?? 0;
    const changed = edit(plan.data);
    const data = { ...changed, build: { ...changed.build!, rev: rev + 1 } };
    const { data: rows, error } = await scopeToWorkspace(
      ctx.client.from("plans").update({ data }).eq("id", planId).eq("user_id", ctx.ownerId).eq("data->build->>rev", String(rev)),
      ctx.workspace?.id,
    ).select(COLS);
    if (error) throw new StepError("The plan couldn't be saved. Try again.", 500);
    if (rows?.length) return rows[0] as SavedPlan;
  }
  throw new StepError("The plan was busy. Try again.", 409);
}

const withBuild = (d: Deliverable, change: (b: PlanBuild) => PlanBuild): Deliverable => ({ ...d, build: change(d.build!) });

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** Plans started step by step in the last seven days, oldest first (for the limit). */
async function recentStarts(ctx: Ctx, now: Date): Promise<string[]> {
  const { data } = await scopeToWorkspace(
    ctx.client.from("plans").select("created_at").eq("user_id", ctx.ownerId).gte("created_at", new Date(now.getTime() - WEEK_MS).toISOString()).not("data->build", "is", null),
    ctx.workspace?.id,
  ).order("created_at", { ascending: true });
  return ((data ?? []) as { created_at: string }[]).map((r) => r.created_at);
}

/** When the next plan may start, as the person reads it ("Friday, Nov 27"). Pure. */
export function nextStartLabel(starts: string[], tz?: string | null): string {
  const at = new Date(Date.parse(starts[0]) + WEEK_MS);
  try {
    return at.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", ...(tz ? { timeZone: tz } : {}) });
  } catch {
    return at.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  }
}

/**
 * Start a plan: check the weekly limit, charge one plan, write the first day's idea, then save the plan so it
 * can be continued at any time. Nothing is charged or saved when the first idea can't be written.
 */
export async function startStepPlan(ctx: Ctx, form: GenerateInput, now = new Date()): Promise<{ plan: SavedPlan; usage: unknown }> {
  const starts = await recentStarts(ctx, now);
  const bundle0 = await bundleFor(ctx, form);
  if (starts.length >= PLANS_PER_WEEK) {
    throw new StepError(`You've started ${PLANS_PER_WEEK} plans this week. Continue one of them, or start a new one on ${nextStartLabel(starts, bundle0.brand?.timezone)}.`, 429);
  }
  const input = await planMixFor(ctx, form, bundle0.brand);
  const routine = bundle0.brand?.growth?.routine;
  const slots = planSlots({ onCamera: input.onCamera ?? 5, animated: input.animated ?? 0 }, routine?.publish_mode === "days" ? routine.publish_days : null);
  if (!slots.length) throw new StepError("Add at least one post for this week.", 400);
  // The mix and brief may differ from the form (made safe); the context is built from what the steps will use.
  const bundle: Bundle = { ...bundle0, context: buildUserPrompt(input, bundle0.brand, bundle0.evidence, { context: true }) };

  const u = await requireUsage(ctx.client, ctx.ownerId, "content_plan", { feature: "content_plan" });
  if (u.denied) {
    const body = (await u.denied.json().catch(() => ({ error: "This plan can't build a Content Plan right now." }))) as { error?: string };
    throw Object.assign(new StepError(body.error ?? "This plan can't build a Content Plan right now.", u.denied.status), { body });
  }
  try {
    let build = newBuild(input, slots, now);
    build = withIdea(build, 0, await writeIdea(ctx, build, 0, bundle));
    const left = ideasBeyondSlots(input, slots);
    const data: Deliverable = {
      clientHandle: input.clientHandle, niche: input.niche, platform: input.platform,
      headline: "", auditSummary: "", strengths: [], problems: [], topFixes: [], competitorInsights: [], weeklyPlan: [],
      build, ...(left.length ? { ideasLeft: left } : {}),
      ...(bundle.evidence ? { evidenceUsed: { ...bundle.evidence.used, references: 0 } } : {}),
    };
    const saved = await savePlan(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null, input, data);
    if (!saved) throw new StepError("The plan couldn't be saved. Try again.", 500);
    return { plan: saved, usage: u.usage };
  } catch (e) {
    await u.release();
    throw e;
  }
}

/**
 * Accept a day (with the person's edits), then write the next day's idea. Returns the plan and, when the day
 * needs its full post written, the promise doing it, for the route to keep alive after it answers.
 */
export async function acceptStep(ctx: Ctx, planId: string, index: number, edited?: Partial<IdeaCard> | null): Promise<{ plan: SavedPlan; writing: Promise<void> }> {
  let plan = await patchPlan(ctx, planId, (d) => withBuild(d, (b) => acceptDay(b, index, edited)));
  // The accepted day's full post is written alongside the next idea.
  const writing = writeDay(ctx, planId, index).catch((e) => console.error("[plan-steps] write", planId, index, (e as Error)?.message ?? e));
  const next = nextWaiting(plan.data.build!);
  if (next >= 0) {
    const bundle = await bundleFor(ctx, plan.data.build!.input);
    const idea = await writeIdea(ctx, plan.data.build!, next, bundle);
    plan = await patchPlan(ctx, planId, (d) => withBuild(d, (b) => (b.slots[next]?.state === "waiting" ? withIdea(b, next, idea) : b)));
  }
  return { plan, writing };
}

/** "Try another idea" for the day under review: the new idea replaces it only once it is written. */
export async function retryStep(ctx: Ctx, planId: string, index: number): Promise<SavedPlan> {
  const current = await readPlan(ctx, planId);
  const asked = beginRetry(current.data.build!, index);
  const idea = await writeIdea(ctx, asked, index, await bundleFor(ctx, asked.input));
  return patchPlan(ctx, planId, (d) => withBuild(d, (b) => withIdea(beginRetry(b, index), index, idea)));
}

export async function editStep(ctx: Ctx, planId: string, index: number, edited: Partial<IdeaCard>): Promise<SavedPlan> {
  return patchPlan(ctx, planId, (d) => withBuild(d, (b) => editDay(b, index, edited)));
}

export async function pickEarlierStep(ctx: Ctx, planId: string, index: number, earlier: number): Promise<SavedPlan> {
  return patchPlan(ctx, planId, (d) => withBuild(d, (b) => pickEarlier(b, index, earlier)));
}

/** Write a day again after its post couldn't be written. */
export async function rewriteStep(ctx: Ctx, planId: string, index: number): Promise<{ plan: SavedPlan; writing: Promise<void> }> {
  const plan = await patchPlan(ctx, planId, (d) => withBuild(d, (b) => rewriteDay(b, index)));
  const writing = writeDay(ctx, planId, index).catch((e) => console.error("[plan-steps] rewrite", planId, index, (e as Error)?.message ?? e));
  return { plan, writing };
}

/** An animated day's post, straight from its approved idea (SOCIA makes the video from it; no call needed). Pure. */
export function animatedItem(slot: BuildSlot, idea: IdeaCard, platform?: string): Deliverable["weeklyPlan"][number] {
  const template = idea.template === "compare" ? "a comparison" : idea.template === "counter" ? "a counter" : "words on screen";
  return {
    day: slot.key, slot: slot.slot ?? 1, animated: true,
    title: idea.title, hook: idea.hook || idea.title, concept: idea.description,
    format: "Animated video",
    rationale: `Animated, no filming: SOCIA makes it as ${template} from this idea.`,
    evidence: "", predictedPerformance: "",
    ...(idea.pillar ? { purpose: idea.pillar } : {}),
    ...(platform ? { platform } : {}),
  };
}

/** Write an accepted day's full post and put it in the plan; when it's the last, write the week-level read. */
async function writeDay(ctx: Ctx, planId: string, index: number): Promise<void> {
  const plan = await readPlan(ctx, planId);
  const build = plan.data.build!;
  const slot = build.slots[index];
  if (!slot || slot.state !== "writing" || !slot.idea) return;
  let item: Deliverable["weeklyPlan"][number] | null = null;
  let error: string | null = null;
  let bundle: Bundle | null = null;
  try {
    if (slot.kind === "animated") {
      item = animatedItem(slot, slot.idea, build.input.platform || undefined);
    } else {
      bundle = await bundleFor(ctx, build.input);
      const raw = (await stepCall(ctx.ownerId, `post ${slot.key}`, bundle.context, detailsTask(build, index), {
        type: "object", additionalProperties: false, required: ["post"], properties: { post: deliverableSchema.properties.weeklyPlan.items },
      }, 16000)) as { post?: Deliverable["weeklyPlan"][number] };
      if (!raw?.post) throw new StepError("No post came back.", 502);
      item = polishItem({ ...raw.post, day: slot.key }, bundle.evidence);
    }
    const [withId] = withItemIds([{ ...item, ...(slot.idea.fromIdea ? { source: "own" as const } : {}) }]);
    item = withId;
  } catch (e) {
    error = e instanceof StepError ? e.message : "SOCIA couldn't write this post just now.";
    console.error("[plan-steps] post", planId, slot.key, (e as Error)?.message ?? e);
  }
  const saved = await patchPlan(ctx, planId, (d) => {
    const b = d.build!;
    if (b.slots[index]?.state !== "writing") return d;
    const writes = (b.slots[index].writes ?? 0) + 1;
    const counted: PlanBuild = { ...b, slots: b.slots.map((x, i) => (i === index ? { ...x, writes } : x)) };
    if (!item) return { ...d, build: finishDay(counted, index, { error: error ?? "SOCIA couldn't write this post." }) };
    const weeklyPlan = [...d.weeklyPlan.filter((p) => p.day !== slot.key), item];
    const order = new Map(b.slots.map((s, i) => [s.key, i]));
    weeklyPlan.sort((x, y) => (order.get(x.day) ?? 99) - (order.get(y.day) ?? 99));
    const evidenceUsed = d.evidenceUsed ? { ...d.evidenceUsed, references: weeklyPlan.filter((p) => p.ref).length } : d.evidenceUsed;
    return { ...d, weeklyPlan, evidenceUsed, build: finishDay(counted, index, { itemId: item.id! }) };
  });
  const b = saved.data.build!;
  if (b.status === "done" && !b.audit && allWritten(b) && reviewingIndex(b) < 0) await writeWeekRead(ctx, planId, bundle);
}

/** The week-level read (headline, audit, fixes, competitors), once every day is in. Best effort. */
async function writeWeekRead(ctx: Ctx, planId: string, given: Bundle | null): Promise<void> {
  const claimed = await patchPlan(ctx, planId, (d) => (d.build!.audit ? d : withBuild(d, (b) => ({ ...b, audit: "writing" }))));
  if (claimed.data.build!.audit !== "writing") return;
  try {
    const bundle = given ?? (await bundleFor(ctx, claimed.data.build!.input));
    const raw = (await stepCall(ctx.ownerId, "week read", bundle.context, auditTask(claimed.data.build!), auditSchema(deliverableSchema), 16000)) as Partial<Deliverable>;
    const general = !bundle.evidence?.competitorsBlock;
    await patchPlan(ctx, planId, (d) => ({
      ...d,
      headline: planHeadline(raw.headline ?? ""),
      auditSummary: raw.auditSummary ?? "",
      strengths: raw.strengths ?? [],
      problems: raw.problems ?? [],
      topFixes: raw.topFixes ?? [],
      competitorInsights: (raw.competitorInsights ?? []).map((c) => ({ ...c, basis: c.basis === "general" || general ? ("general" as const) : ("measured" as const) })),
      build: { ...d.build!, audit: "done" },
    }));
  } catch (e) {
    console.error("[plan-steps] week read", planId, (e as Error)?.message ?? e);
    await patchPlan(ctx, planId, (d) => withBuild(d, (b) => ({ ...b, audit: "failed" }))).catch(() => null);
  }
}

/** The plan as it stands (the page reads it while posts are written in the background). */
export const stepPlan = readPlan;
