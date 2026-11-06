// Content ideas for AI Studio, written from what SOCIA already holds about the
// brand (niche, brand voice, goals): each one a hook, a concept, a shot
// description the generator can render, and a caption. Server only.
import { anthropic, MODEL, effortFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { getProfile } from "@/lib/profile";
import { brandWorkspace, type Ctx } from "@/lib/context";
import { brandLine, cleanTag } from "@/lib/aiStudio/captions";
import type { GenerationKind } from "@/lib/credits/config";

export type StudioIdea = {
  id: string;
  hook: string;
  concept: string;
  /** What the camera sees, written for a generator: subject, setting, light, motion. */
  shot: string;
  /** Which kind of generation fits. */
  kind: GenerationKind;
  caption: string;
  hashtags: string[];
};
export const IDEA_COUNT = 5;

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["ideas"],
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["hook", "concept", "shot", "kind", "caption", "hashtags"],
        properties: {
          hook: { type: "string" }, concept: { type: "string" }, shot: { type: "string" },
          kind: { type: "string", enum: ["text_to_video", "text_to_image"] },
          caption: { type: "string" }, hashtags: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

const SYSTEM = `You are SOCIA's creative director for one small business or creator. You write short-form content ideas that an AI video or image generator will render, so every idea is a single scene that can be shown without a real person's face or a real product photo.
Rules you never break:
- "hook" is the on-screen opening line, a few plain words the way a person types in the Instagram text tool. Sentence case, no hashtags, no emoji, no marketing words.
- "concept" is one or two sentences: what the post is about and why this audience would stop for it.
- "shot" is written for the generator: the subject, the setting, the light, the camera and the motion, concrete and visual, 30 to 80 words, no text or logos in the frame, no real people's names, no brand names, nothing that would need to be true about the business (no prices, awards, claims).
- "kind" is text_to_video for a scene with motion, text_to_image for a still (a cover, a quote card background, a product-style still life).
- "caption": one or two sentences in the brand's voice, then 3 to 5 hashtags without the # sign.
- Follow the account's niche and voice. Never invent facts about the business. Plain text, no markdown, no em dashes.`;

export async function writeStudioIdeas(ctx: Ctx, args: { about: string | null; count?: number }): Promise<StudioIdea[]> {
  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  const n = Math.min(8, Math.max(1, args.count ?? IDEA_COUNT));
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 6000, system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA }, ...effortFor(MODEL, "medium") },
    messages: [{ role: "user", content: `${brandLine(profile)}\n\n# Task\nWrite ${n} ideas.${args.about ? ` The person wants them to be about: ${args.about.slice(0, 200)}` : ""}` }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  recordAiUsage(ctx.ownerId, "studio_ideas", res);
  if (res.stop_reason === "refusal") throw Object.assign(new Error("SOCIA declined this one. Try a different topic."), { status: 422 });
  const block = res.content.find((b: { type: string }) => b.type === "text");
  const text = block && "text" in block ? (block as { text: string }).text : "";
  let raw: { ideas?: Partial<StudioIdea>[] } = {};
  try { raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { raw = {}; }
  const stamp = Date.now().toString(36);
  const ideas: StudioIdea[] = [];
  for (const [i, r] of (raw.ideas ?? []).entries()) {
    if (!r || typeof r.hook !== "string" || typeof r.shot !== "string") continue;
    ideas.push({
      id: `i${stamp}${i}`, hook: r.hook.trim().slice(0, 120), concept: String(r.concept ?? "").trim().slice(0, 400), shot: r.shot.trim().slice(0, 1200),
      kind: r.kind === "text_to_image" ? "text_to_image" : "text_to_video",
      caption: String(r.caption ?? "").trim().slice(0, 2200), hashtags: (r.hashtags ?? []).map(cleanTag).filter(Boolean).slice(0, 5),
    });
  }
  if (!ideas.length) throw Object.assign(new Error("SOCIA's ideas came back incomplete. Try again."), { status: 502 });
  return ideas;
}
