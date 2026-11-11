// Which days of a content plan suit an animated video (words on screen, no
// footage) and which need real filming. One model call over the week; the
// person sees each day's reason and can change the choice. Server only.
import { anthropic, MODEL, effortFor } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import type { Ctx } from "@/lib/context";

export type PlanDay = { index: number; day: string; title?: string; hook: string; concept: string; format?: string; direction?: string };
export type DayPick = { index: number; animated: boolean; reason: string };

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["days"],
  properties: {
    days: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["index", "animated", "reason"],
        properties: { index: { type: "integer" }, animated: { type: "boolean" }, reason: { type: "string" } },
      },
    },
  },
} as const;

const SYSTEM = `For each planned social media post, decide whether it works as an animated text video: a short vertical video of words on screen (an opening line, points or a list, an ending) with no footage, no people and no photos.
Yes for tips, lists, opinions, explanations, myths, announcements, offers and questions. No when the idea needs real footage to work: showing a place, food, a product in hand, a person, a process, behind the scenes, before and after, or a trend that needs filming.
For every post give "animated" and one short reason in plain words, sentence case, no em dashes.`;

/** The model's picks, made safe: one per known day, in the order given, with a short reason. Days it skipped are not animated. Pure. */
export function cleanPicks(raw: unknown, days: PlanDay[]): DayPick[] {
  const list = Array.isArray((raw as { days?: unknown })?.days) ? ((raw as { days: unknown[] }).days as Record<string, unknown>[]) : [];
  const byIndex = new Map<number, DayPick>();
  for (const r of list) {
    const index = Number(r?.index);
    if (!days.some((d) => d.index === index) || byIndex.has(index)) continue;
    const reason = typeof r.reason === "string" ? r.reason.replace(/\s+/g, " ").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, 200) : "";
    byIndex.set(index, { index, animated: r.animated === true, reason });
  }
  return days.map((d) => byIndex.get(d.index) ?? { index: d.index, animated: false, reason: "" });
}

export async function pickAnimatedDays(ctx: Ctx, days: PlanDay[]): Promise<DayPick[]> {
  const lines = days.map((d) => [
    `[${d.index}] ${d.day}${d.title ? `: ${d.title}` : ""}`,
    `  Hook: ${d.hook.slice(0, 200)}`,
    `  Concept: ${d.concept.slice(0, 400)}`,
    d.format ? `  Format: ${d.format.slice(0, 120)}` : "",
    d.direction ? `  Direction: ${d.direction.slice(0, 200)}` : "",
  ].filter(Boolean).join("\n")).join("\n");
  const res = await anthropic.messages.create({
    model: MODEL, max_tokens: 2000, system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA }, ...effortFor(MODEL, "low") },
    messages: [{ role: "user", content: `# The week's posts (index in brackets)\n${lines}` }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  recordAiUsage(ctx.ownerId, "animated_pick", res);
  const block = res.content.find((b: { type: string }) => b.type === "text");
  const text = block && "text" in block ? (block as { text: string }).text : "";
  let raw: unknown = null;
  try { raw = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { raw = null; }
  return cleanPicks(raw, days);
}
