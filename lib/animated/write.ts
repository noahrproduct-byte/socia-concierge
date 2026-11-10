// Writes the scenes of an animated video ("Make it with AI", animated style)
// from one content plan post and the brand profile. The model only writes
// words; lib/animated/spec.ts cleans them (no invented numbers, short lines)
// and components/animated/AnimatedComposition.tsx draws them. Server only.
import { anthropic, MODEL, effortFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { getProfile } from "@/lib/profile";
import { brandWorkspace, type Ctx } from "@/lib/context";
import { brandLine } from "@/lib/aiStudio/captions";
import { ACCENTS, cleanSpec, MAX_SCENES, type AnimatedSpec } from "./spec";

/** The plan post the video is about: what the plan wrote, nothing more. */
export type AnimatedSource = { title?: string; hook: string; concept: string; direction?: string; purpose?: string; audience?: string };

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["theme", "accent", "scenes", "caption", "hashtags"],
  properties: {
    theme: { type: "string", enum: ["ink", "light", "accent"] },
    accent: { type: "string", enum: [...ACCENTS] },
    scenes: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["type", "text", "emphasis", "title", "items", "sub"],
        properties: {
          type: { type: "string", enum: ["hook", "point", "list", "quote", "cta"] },
          text: { type: "string" }, emphasis: { type: "string" }, title: { type: "string" },
          items: { type: "array", items: { type: "string" } }, sub: { type: "string" },
        },
      },
    },
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
  },
} as const;

const SYSTEM = `You turn one planned social media post into a short animated vertical video made only of words on screen: no footage, no people, no photos. Each scene is one idea a viewer reads in two or three seconds.
Scene types:
- hook: the first scene, the line that stops the scroll. At most 9 words. Usually the post's hook, tightened.
- point: one statement, at most 16 words.
- list: a title of at most 8 words and 2 to 4 items of at most 7 words each. Never number the items yourself.
- quote: a line said in the brand's voice, at most 22 words. Never attribute it to a customer or a real person.
- cta: the last scene, what to do next (follow, save, visit, message), at most 8 words, with an optional "sub" line of at most 10 words.
Rules you never break:
- 3 to ${MAX_SCENES} scenes, hook first, cta last.
- Use only facts in the post and the brand details. Never write a number, price, percentage, time, rating, award or result that isn't written there. If the post has no numbers, write none.
- "emphasis" is one to three words copied exactly from that scene's text, the words to highlight. Use an empty string when nothing should stand out, and for list, quote and cta.
- Fill the fields a type doesn't use with an empty string or an empty list.
- Sentence case, plain words, no hashtags or emoji on screen, no em dashes, no marketing clichés.
- theme: "ink" (dark), "light" or "accent" (the accent colour as background). Pick what suits the brand; "ink" when unsure.
- accent: one of the listed colours, the one closest to the brand's feel.
- caption: one or two sentences in the brand's voice for the post itself. hashtags: 3 to 5, without the # sign.`;

export async function writeAnimatedSpec(ctx: Ctx, post: AnimatedSource): Promise<AnimatedSpec> {
  const profile = await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)).catch(() => null);
  const brand = brandLine(profile);
  const lines = [
    post.title ? `Title: ${post.title}` : "",
    `Hook: ${post.hook}`,
    `Concept: ${post.concept}`,
    post.direction ? `Direction: ${post.direction}` : "",
    post.purpose ? `Purpose: ${post.purpose}` : "",
    post.audience ? `For: ${post.audience}` : "",
  ].filter(Boolean).map((l) => l.slice(0, 600));
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 4000, system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA }, ...effortFor(MODEL, "medium") },
    messages: [{ role: "user", content: `# Brand\n${brand}\n\n# The planned post\n${lines.join("\n")}\n\nWrite the video's scenes.` }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  recordAiUsage(ctx.ownerId, "animated_script", res);
  if (res.stop_reason === "refusal") throw Object.assign(new Error("SOCIA declined this one. Try a different post."), { status: 422 });
  const block = res.content.find((b: { type: string }) => b.type === "text");
  const text = block && "text" in block ? (block as { text: string }).text : "";
  let raw: unknown = null;
  try { raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { raw = null; }
  const spec = cleanSpec(raw, `${brand}\n${lines.join("\n")}`, { signoff: profile?.brand_name ?? null });
  if (!spec) throw Object.assign(new Error("SOCIA's video came back incomplete. Try again."), { status: 502 });
  return spec;
}
