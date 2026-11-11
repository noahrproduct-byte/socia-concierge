// The animated posts a content plan gets when the brand posts animated videos
// (brand_detail.animated: on, one or two a day). One model call after the plan
// is written: ideas that suit SOCIA's animated templates (a comparison, a
// counter, or words on screen), different from the week's filmed posts. They
// are added to the plan as their own posts, "Monday (animated)", so they never
// get mixed up with that day's filmed post; "Generate animated videos" makes
// them all. Server only.
import { anthropic, MODEL, effortFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import type { BrandDetail } from "@/lib/profile";
import type { PlanItem } from "@/lib/planItems";
import { animatedPerDay } from "./fitCore";
import { WEEK, animatedDay } from "./day";


const SCHEMA = {
  type: "object", additionalProperties: false, required: ["posts"],
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["weekday", "slot", "title", "hook", "concept", "template"],
        properties: {
          weekday: { type: "string", enum: [...WEEK] },
          slot: { type: "integer", enum: [1, 2] },
          title: { type: "string" }, hook: { type: "string" }, concept: { type: "string" },
          template: { type: "string", enum: ["compare", "counter", "words"] },
        },
      },
    },
  },
} as const;

const SYSTEM = `You add animated posts to a brand's week of social media posts. An animated post is a short vertical video SOCIA draws in code, with no footage, no people and no photos, in one of three templates:
- compare: 2 to 4 options side by side whose numbers count up on one measure (three grind sizes and their shot times; two routes and their minutes).
- counter: one number counting up in rounds that grow (one coffee a day for a week, a month, a year).
- words: an opening line, a few points or a list, and an ending.
Write exactly the posts asked for: for each day, one post with slot 1, and when two a day are asked for, a second with slot 2 that is a different kind of idea.
Rules:
- Each idea must work as one of the templates. Prefer compare and counter; use words for tips, myths, opinions and announcements.
- Different from the filmed posts listed, and from each other. Mix the templates across the week.
- About the brand's own world: its niche, products, customers and know-how. Never invent the brand's own results, sales, prices, ratings, awards or offers; general facts and clearly typical examples are fine.
- title: at most 8 words. hook: the first line a viewer reads, at most 12 words. concept: two or three sentences saying what the video shows and which numbers or points it uses.
- Sentence case, plain words, no hashtags, emoji or em dashes.`;

type RawPost = { weekday?: unknown; slot?: unknown; title?: unknown; hook?: unknown; concept?: unknown; template?: unknown };

const line = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, n) : "");

/** The model's posts as plan items: known days and slots only, at most `perDay` a day, in week order. Pure. */
export function cleanAnimatedPosts(raw: unknown, perDay: 1 | 2, platform?: string): PlanItem[] {
  const list = Array.isArray((raw as { posts?: unknown })?.posts) ? ((raw as { posts: RawPost[] }).posts) : [];
  const seen = new Set<string>();
  const out: PlanItem[] = [];
  for (const p of list) {
    const weekday = WEEK.find((d) => d === p?.weekday);
    const slot = p?.slot === 2 && perDay === 2 ? 2 : p?.slot === 1 ? 1 : null;
    if (!weekday || !slot || seen.has(`${weekday}${slot}`)) continue;
    const hook = line(p.hook, 160);
    const concept = line(p.concept, 700);
    if (!hook || !concept) continue;
    seen.add(`${weekday}${slot}`);
    const template = p.template === "compare" ? "a comparison" : p.template === "counter" ? "a counter" : "words on screen";
    out.push({
      day: animatedDay(weekday, slot), slot, animated: true,
      title: line(p.title, 80) || undefined, hook, concept,
      format: "Animated video",
      rationale: `Animated, no filming: SOCIA makes it as ${template} from this idea.`,
      evidence: "",
      predictedPerformance: "",
      ...(platform ? { platform } : {}),
    });
  }
  return out.sort((a, b) => WEEK.indexOf(a.day.split(" ")[0] as (typeof WEEK)[number]) - WEEK.indexOf(b.day.split(" ")[0] as (typeof WEEK)[number]) || (a.slot ?? 1) - (b.slot ?? 1));
}

/**
 * The week's animated posts for a brand that posts animated videos, or [] when
 * it doesn't (or the call fails: the plan is still good without them).
 */
export async function writeAnimatedPosts(opts: { brand: BrandDetail | null; brandLine: string; filmed: PlanItem[]; platform?: string; ownerId?: string | null }): Promise<PlanItem[]> {
  const perDay = animatedPerDay(opts.brand?.animated);
  if (!perDay) return [];
  const filmed = opts.filmed.map((p) => `- ${p.day}: ${p.title ?? p.hook}`).join("\n");
  try {
    const res = await anthropic.messages.create({
      model: MODEL, max_tokens: 6000, system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA }, ...effortFor(MODEL, "low") },
      messages: [{ role: "user", content: `# Brand\n${opts.brandLine}\n\n# This week's filmed posts\n${filmed || "(none)"}\n\nWrite ${perDay === 2 ? "two animated posts for each day, Monday to Sunday (slot 1 and slot 2)" : "one animated post for each day, Monday to Sunday (slot 1)"}.` }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    recordAiUsage(opts.ownerId, "animated_plan", res);
    const block = res.content.find((b: { type: string }) => b.type === "text");
    const text = block && "text" in block ? (block as { text: string }).text : "";
    return cleanAnimatedPosts(JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()), perDay, opts.platform);
  } catch (e) {
    console.error("[animated/planPosts]", (e as Error)?.message ?? e);
    return [];
  }
}
