// Content ideas for AI Studio, written from what SOCIA already holds about the
// brand (niche, brand voice, goals): each one a hook, a concept, a shot
// description the generator can render, and a caption. Server only.
import { anthropic, MODEL, effortFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { getProfile } from "@/lib/profile";
import { brandWorkspace, type Ctx } from "@/lib/context";
import { brandLine, cleanTag } from "@/lib/aiStudio/captions";
import type { GenerationKind } from "@/lib/credits/config";
import { GOAL_BRIEF, type StudioGoal } from "./goals";

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
  /** Why SOCIA suggests it: the goal it serves, in a sentence. */
  why?: string;
  /** The trending Reel it adapts (goal "trending"): the real Reel, linked. */
  ref?: { url: string; account: string; result: string | null };
};
export const IDEA_COUNT = 5;

/** What a goal brings to the writer beyond the brand profile (lib/generation/goals.ts). */
export type IdeaContext = {
  goal: StudioGoal;
  /** The person's own draft (goal "improve"). */
  draft?: string | null;
  /** The account's best posts (goal "best"), one line each. */
  best?: string[];
  /** Reels that took off in the niche (goal "trending"). */
  trending?: { url: string; account: string; line: string; result: string | null }[];
};

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["ideas"],
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["hook", "concept", "shot", "kind", "caption", "hashtags", "why", "ref"],
        properties: {
          hook: { type: "string" }, concept: { type: "string" }, shot: { type: "string" },
          why: { type: "string" },
          ref: { type: "integer" },
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
- "why": one plain sentence on why this idea serves what the person asked for (the goal), from what you were given, never a promise of results.
- "ref": the number of the trending Reel the idea adapts, when you were given a list of them; 0 otherwise.
- Follow the account's niche and voice. Never invent facts about the business. Plain text, no markdown, no em dashes.`;

export async function writeStudioIdeas(ctx: Ctx, args: { about: string | null; count?: number; context?: IdeaContext }): Promise<StudioIdea[]> {
  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  const n = Math.min(8, Math.max(1, args.count ?? IDEA_COUNT));
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 6000, system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA }, ...effortFor(MODEL, "medium") },
    messages: [{ role: "user", content: ideaPrompt(brandLine(profile), n, args.about, args.context) }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  recordAiUsage(ctx.ownerId, "studio_ideas", res);
  if (res.stop_reason === "refusal") throw Object.assign(new Error("SOCIA declined this one. Try a different topic."), { status: 422 });
  const block = res.content.find((b: { type: string }) => b.type === "text");
  const text = block && "text" in block ? (block as { text: string }).text : "";
  let raw: { ideas?: (Omit<Partial<StudioIdea>, "ref"> & { ref?: unknown })[] } = {};
  try { raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { raw = {}; }
  const stamp = Date.now().toString(36);
  const ideas: StudioIdea[] = [];
  for (const [i, r] of (raw.ideas ?? []).entries()) {
    if (!r || typeof r.hook !== "string" || typeof r.shot !== "string") continue;
    ideas.push({
      id: `i${stamp}${i}`, hook: r.hook.trim().slice(0, 120), concept: String(r.concept ?? "").trim().slice(0, 400), shot: r.shot.trim().slice(0, 1200),
      kind: r.kind === "text_to_image" ? "text_to_image" : "text_to_video",
      caption: String(r.caption ?? "").trim().slice(0, 2200), hashtags: (r.hashtags ?? []).map(cleanTag).filter(Boolean).slice(0, 5),
      ...(typeof r.why === "string" && r.why.trim() ? { why: r.why.trim().slice(0, 240) } : {}),
      ...refFor(r.ref, args.context),
    });
  }
  if (!ideas.length) throw Object.assign(new Error("SOCIA's ideas came back incomplete. Try again."), { status: 502 });
  return ideas;
}

/** The writer's task: the brand, the goal and what it brought, and the topic. Pure. */
export function ideaPrompt(brand: string, n: number, about: string | null, c?: IdeaContext): string {
  const goal = c?.goal ?? "ideas";
  const parts = [brand, `# What the person wants\n${GOAL_BRIEF[goal]}`];
  if (goal === "improve" && c?.draft) parts.push(`# Their draft\n${c.draft.slice(0, 1500)}`);
  if (goal === "best" && c?.best?.length) parts.push(`# The account's best posts (its own numbers)\n${c.best.map((b) => `- ${b}`).join("\n")}`);
  if (goal === "trending" && c?.trending?.length) parts.push(`# Reels that took off in the niche (numbered)\n${c.trending.map((t, i) => `${i + 1}. ${t.account}: "${t.line}"${t.result ? ` (${t.result})` : ""}`).join("\n")}`);
  parts.push(`# Task\nWrite ${n} ideas.${about ? ` The person wants them to be about: ${about.slice(0, 200)}` : ""}`);
  return parts.join("\n\n");
}

/** The trending Reel an idea names by number, as a real link. Pure. */
export function refFor(n: unknown, c?: IdeaContext): { ref?: StudioIdea["ref"] } {
  const i = typeof n === "number" ? Math.round(n) : 0;
  const t = c?.goal === "trending" ? c.trending?.[i - 1] : undefined;
  return t ? { ref: { url: t.url, account: t.account, result: t.result } } : {};
}
