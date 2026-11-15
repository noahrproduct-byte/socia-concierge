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
import { animatedSlots } from "@/lib/planMix";


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
Write exactly the posts asked for, on the days and slots asked for: a second post on a day (slot 2) is a different kind of idea from that day's first.
Rules:
- Each idea must work as one of the templates. Prefer compare and counter; use words for tips, myths, opinions and announcements.
- Different from the filmed posts listed, and from each other. Mix the templates across the week.
- About the brand's own world, as "What the account is" says: its subject, products, customers and know-how. Never take a topic from a word in the account's name alone (a "beta" app for climbers is about climbing beta, not software testing). When the brand line says nothing about what the account is, keep to what its filmed posts are about.
- When "How it posts" lists the account's own animated kinds of video, pick ideas those videos would tell: the same subject, characters and stories, in the closest template. Never invent the brand's own results, sales, prices, ratings, awards or offers; general facts and clearly typical examples are fine.
- Every post makes ONE point that moves the account's audience toward the owner's main goal. Start from a problem or a want the audience really has (a climber stuck on a move, a family deciding where to eat), let the video show it, and end on why it matters to them. A fun fact or general know-how with no point for this audience is not a post.
- About half the posts lead to what the brand sells or makes: the point is the problem it solves, and the video names the brand once, plainly, as what helps. The others earn trust on the same problems without selling. Never claim a result the brand's product gets (no "3x faster", no numbers about it); say only what it does, from "What it is".
- title: at most 8 words. hook: the first line a viewer reads, at most 12 words. concept: two or three sentences saying what the video shows and which numbers or points it uses.
- Sentence case, plain words, no hashtags, emoji or em dashes.`;

type RawPost = { weekday?: unknown; slot?: unknown; title?: unknown; hook?: unknown; concept?: unknown; template?: unknown };

const line = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, n) : "");

/** The model's posts as plan items: known days and slots only, at most `perDay` a day (and only the asked-for days and slots, when given), in week order. Pure. */
export function cleanAnimatedPosts(raw: unknown, perDay: 1 | 2, platform?: string, only?: Set<string>): PlanItem[] {
  const list = Array.isArray((raw as { posts?: unknown })?.posts) ? ((raw as { posts: RawPost[] }).posts) : [];
  const seen = new Set<string>();
  const out: PlanItem[] = [];
  for (const p of list) {
    const weekday = WEEK.find((d) => d === p?.weekday);
    const slot = p?.slot === 2 && perDay === 2 ? 2 : p?.slot === 1 ? 1 : null;
    if (!weekday || !slot || seen.has(`${weekday}${slot}`) || (only && !only.has(`${weekday}${slot}`))) continue;
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
export async function writeAnimatedPosts(opts: { brand: BrandDetail | null; brandLine: string; filmed: PlanItem[]; platform?: string; ownerId?: string | null; count?: number }): Promise<PlanItem[]> {
  // `count`: the number the person chose for this week (lib/planMix.ts), spread over the week; otherwise the brand's setting, one or two a day.
  const slots = opts.count != null ? animatedSlots(opts.count) : null;
  const perDay: 0 | 1 | 2 = slots ? (slots.length ? (slots.some((s) => s.slot === 2) ? 2 : 1) : 0) : animatedPerDay(opts.brand?.animated);
  if (!perDay) return [];
  const asked = slots
    ? `Write exactly these ${slots.length} animated post${slots.length === 1 ? "" : "s"}: ${slots.map((s) => `${WEEK[s.weekday]} (slot ${s.slot})`).join(", ")}.`
    : `Write ${perDay === 2 ? "two animated posts for each day, Monday to Sunday (slot 1 and slot 2)" : "one animated post for each day, Monday to Sunday (slot 1)"}.`;
  const filmed = opts.filmed.map((p) => `- ${p.day}: ${p.title ?? p.hook}`).join("\n");
  const wanted = slots ? slots.map((s) => `${WEEK[s.weekday]}${s.slot}`) : WEEK.flatMap((d) => (perDay === 2 ? [`${d}1`, `${d}2`] : [`${d}1`]));
  const call = async (ask: string, only: Set<string>): Promise<PlanItem[]> => {
    const res = await anthropic.messages.create({
      model: MODEL, max_tokens: 6000, system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA }, ...effortFor(MODEL, "low") },
      messages: [{ role: "user", content: `# Brand\n${opts.brandLine}\n\n# This week's filmed posts\n${filmed || "(none)"}\n\n${ask}` }],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    recordAiUsage(opts.ownerId, "animated_plan", res);
    const block = res.content.find((b: { type: string }) => b.type === "text");
    const text = block && "text" in block ? (block as { text: string }).text : "";
    const posts = cleanAnimatedPosts(JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()), perDay, opts.platform, only);
    if (posts.length < only.size) console.error(`[animated/planPosts] asked for ${only.size}, kept ${posts.length} (stop: ${res.stop_reason})`);
    return posts;
  };
  try {
    const out = await call(asked, new Set(wanted));
    // Every post the person asked for: when some days came back empty, ask once more for just those days.
    const have = new Set(out.map((p) => `${p.day.split(" ")[0]}${p.slot ?? 1}`));
    const missing = wanted.filter((k) => !have.has(k));
    if (missing.length) {
      const names = missing.map((k) => `${k.slice(0, -1)} (slot ${k.slice(-1)})`).join(", ");
      const done = out.map((p) => `- ${p.day}: ${p.title ?? p.hook}`).join("\n");
      const more = await call(`These animated posts are already written:\n${done || "(none)"}\n\nWrite exactly these ${missing.length} more, each a different idea from those: ${names}.`, new Set(missing)).catch(() => [] as PlanItem[]);
      out.push(...more);
    }
    return out.sort((a, b) => WEEK.indexOf(a.day.split(" ")[0] as (typeof WEEK)[number]) - WEEK.indexOf(b.day.split(" ")[0] as (typeof WEEK)[number]) || (a.slot ?? 1) - (b.slot ?? 1));
  } catch (e) {
    console.error("[animated/planPosts]", (e as Error)?.message ?? e);
    return [];
  }
}
