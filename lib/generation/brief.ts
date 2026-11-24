// AI Studio's creative brief (Step 2, Develop): one idea from Step 1 turned
// into what to make, before any credits are spent on media. The same brief
// feeds both paths in Step 3: "Create with AI" (the generator prompt, written
// for the model so nobody has to know how to prompt it) and "Film it myself"
// (a checklist, a shot-by-shot guide with where to stand, a script and the
// on-screen text). Everything is editable on the page; editing the visual
// beats rebuilds the prompt without another AI call (promptFromBrief).
// Server only (writeBrief); the pure helpers are shared with the page.
import { anthropic, MODEL, effortFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { getProfile } from "@/lib/profile";
import { brandWorkspace, type Ctx } from "@/lib/context";
import { brandLine } from "@/lib/aiStudio/captions";
import { FILMING_DIRECTION_RULE } from "@/lib/place";
import { GOAL_BRIEF, type StudioGoal } from "./goals";
import type { StudioIdea } from "./ideas";
import { cleanBrief, type CreativeBrief } from "./briefCore";
export * from "./briefCore";

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["concept", "hook", "openingShot", "buildUp", "payoff", "cta", "durationSec", "kind", "onScreenText", "script", "checklist", "shots", "prompt", "caption"],
  properties: {
    concept: { type: "string" }, hook: { type: "string" },
    openingShot: { type: "string" }, buildUp: { type: "string" }, payoff: { type: "string" }, cta: { type: "string" },
    durationSec: { type: "integer" },
    kind: { type: "string", enum: ["text_to_video", "text_to_image"] },
    onScreenText: { type: "array", items: { type: "string" } },
    script: { type: "string" },
    checklist: { type: "array", items: { type: "string" } },
    shots: { type: "array", items: { type: "object", additionalProperties: false, required: ["shot", "seconds", "how"], properties: { shot: { type: "string" }, seconds: { type: "integer" }, how: { type: "string" } } } },
    prompt: { type: "string" },
    caption: { type: "string" },
  },
} as const;

const SYSTEM = `You are SOCIA's creative director for one small business or creator. You turn one chosen idea into a short-form creative brief the owner can approve before anything is made. It will be made either by an AI video generator or filmed by the owner on a phone, so it must work both ways.
Fields:
- concept: the idea in one plain sentence.
- hook: the on-screen opening line, a few plain words, sentence case.
- openingShot, buildUp, payoff: the three visual beats, each one or two sentences of what the camera sees. The opening shot starts in motion on the hook.
- cta: one plain call to action that fits the goal (a question to comment on, a save, a visit or an order). Never invent an offer, price or claim.
- durationSec: 7 to 30 seconds; shorter when the idea is one moment.
- kind: text_to_video, or text_to_image when the idea is a still.
- onScreenText: 1 to 3 short lines in the order they appear, the hook first.
- script: what is said out loud, when a voice helps; "" when the post needs no voice.
- checklist: 3 to 6 things to have ready before filming (props, the product, light, a clean spot), concrete for this brand.
- shots: 3 to 6 shots in order, each with what it shows, its seconds, and "how" (where to stand and what the phone does). ${FILMING_DIRECTION_RULE}
- prompt: for an AI video generator, 40 to 90 words: the subject, the setting, the light, the camera and its motion, across the three beats. No text, logos, real people's names or brand names in the frame; nothing that would need to be true about the business.
- caption: one or two sentences in the brand's voice, then 3 to 5 hashtags without the # sign.
Plain text, no markdown, no emoji, no em dashes. Never invent facts about the business.`;

export async function writeBrief(ctx: Ctx, args: { idea: Pick<StudioIdea, "hook" | "concept" | "shot" | "kind" | "caption"> & { why?: string; ref?: StudioIdea["ref"] }; goal: StudioGoal }): Promise<CreativeBrief> {
  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  const i = args.idea;
  const idea = [
    `Hook: ${i.hook}`, `Concept: ${i.concept}`, `Scene: ${i.shot}`,
    i.ref ? `It adapts this Reel's format: ${i.ref.account}${i.ref.result ? ` (${i.ref.result})` : ""}. Keep the structure, never the wording.` : null,
  ].filter(Boolean).join("\n");
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 5000, system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA }, ...effortFor(MODEL, "medium") },
    messages: [{ role: "user", content: `${brandLine(profile)}\n\n# What the person wants\n${GOAL_BRIEF[args.goal]}\n\n# The idea they chose\n${idea}\n\n# Task\nWrite the creative brief.` }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  recordAiUsage(ctx.ownerId, "studio_brief", res);
  if (res.stop_reason === "refusal") throw Object.assign(new Error("SOCIA declined this one. Pick another idea."), { status: 422 });
  const block = res.content.find((b: { type: string }) => b.type === "text");
  const text = block && "text" in block ? (block as { text: string }).text : "";
  let raw: unknown = null;
  try { raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { raw = null; }
  const brief = cleanBrief(raw, i.kind);
  if (!brief) throw Object.assign(new Error("SOCIA's brief came back incomplete. Try again."), { status: 502 });
  if (!brief.caption) brief.caption = i.caption;
  return brief;
}
