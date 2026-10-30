// Server side of Studio's concept and production guide (lib/studioGuide.ts):
// read the concept from the brand's plan or Discover formats, write the guide
// with one model call for this brand's voice and resources, and keep it on
// the planned post it belongs to. Server only.

import type { Ctx } from "./context";
import { brandWorkspace } from "./context";
import { scopeToWorkspace } from "./workspaces";
import { getProfile } from "./profile";
import { brandContext } from "./prompt";
import { MAIN_GOALS } from "./growth";
import { readFormatsDoc } from "./nicheFormatsLoad";
import { anthropic, FAST_MODEL, effortFor } from "./anthropic";
import { recordAiUsage } from "./aiUsage";
import type { Deliverable } from "./schema";
import { GUIDE_SYSTEM, conceptFromFormat, conceptFromPlanItem, conceptPrompt, guideSchema, normalizeGuide, type ProductionGuide, type StudioConcept } from "./studioGuide";

async function mainGoalLabel(ctx: Ctx): Promise<string | null> {
  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  const id = profile?.brand_detail?.growth?.main_goal;
  return MAIN_GOALS.find((m) => m.id === id)?.label ?? null;
}

type PlanRow = { id: string; data: Deliverable };

async function readPlan(ctx: Ctx, planId: string): Promise<PlanRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(planId)) return null;
  const { data } = await scopeToWorkspace(ctx.client.from("plans").select("id, data").eq("id", planId).eq("user_id", ctx.ownerId), ctx.workspace?.id ?? null).maybeSingle();
  return (data as PlanRow | null) ?? null;
}

/** A planned post as a concept, with its guide when one was written. */
export async function planConcept(ctx: Ctx, planId: string, index: number): Promise<{ concept: StudioConcept; guide: ProductionGuide | null } | null> {
  const plan = await readPlan(ctx, planId).catch(() => null);
  const item = plan?.data?.weeklyPlan?.[index];
  if (!plan || !item) return null;
  return { concept: conceptFromPlanItem(item, plan.id, await mainGoalLabel(ctx)), guide: item.guide ?? null };
}

/** A Discover format, by name, as a concept to adapt. */
export async function formatConcept(ctx: Ctx, name: string): Promise<StudioConcept | null> {
  const { doc } = await readFormatsDoc(ctx);
  const f = doc?.formats.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
  return f ? conceptFromFormat(f, await mainGoalLabel(ctx)) : null;
}

/** One model call: the guide for this concept, in the brand's voice and within its resources. */
export async function writeGuide(ctx: Ctx, concept: StudioConcept, now = new Date()): Promise<ProductionGuide> {
  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  const brand = brandContext(profile?.brand_detail) || "(no brand settings or Growth Profile yet: keep production simple, one person and a phone)";
  const res = (await anthropic.messages.create({
    model: FAST_MODEL, max_tokens: 4000, system: GUIDE_SYSTEM,
    output_config: { format: { type: "json_schema", schema: guideSchema }, ...effortFor(FAST_MODEL, "medium") },
    messages: [{ role: "user", content: `# The account${profile?.niche ? ` (${profile.niche})` : ""}\n${brand}\n\n# The concept\n${conceptPrompt(concept)}\n\nWrite the production guide.` }],
  } as never)) as unknown as { content: { type: string; text?: string }[] };
  recordAiUsage(ctx.ownerId, "content_guide", res);
  const text = res.content.find((b) => b.type === "text")?.text ?? "{}";
  return normalizeGuide(JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as Record<string, unknown>, now);
}

/** Keep the guide on its planned post. False when the plan or post isn't this brand's. */
export async function saveGuideOnPlan(ctx: Ctx, planId: string, index: number, guide: ProductionGuide): Promise<boolean> {
  const plan = await readPlan(ctx, planId).catch(() => null);
  if (!plan?.data?.weeklyPlan?.[index]) return false;
  const weeklyPlan = plan.data.weeklyPlan.map((it, i) => (i === index ? { ...it, guide } : it));
  const { data, error } = await scopeToWorkspace(
    ctx.client.from("plans").update({ data: { ...plan.data, weeklyPlan } }).eq("id", planId).eq("user_id", ctx.ownerId),
    ctx.workspace?.id ?? null,
  ).select("id");
  return !error && Boolean(data?.length);
}
