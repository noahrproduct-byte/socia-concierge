import { NextResponse } from "next/server";
import { anthropic, MODEL, aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/profile";
import { brandContext } from "@/lib/prompt";
import { GOALS, type GoalId } from "@/lib/studio";
import { requireUsage } from "@/lib/planGuard";
import { resolveContext } from "@/lib/context";

export const runtime = "nodejs";
export const maxDuration = 60;

// Focused rewrites for Content Studio: more hooks, caption variants in a
// chosen direction, CTAs, on-screen text, and variation briefs. Always
// options the user picks from; never a silent overwrite.

type Task = "hooks" | "caption" | "cta" | "onscreen" | "variations";
type Body = {
  task: Task;
  summary?: string; transcript?: string; caption?: string; hook?: string; goal?: GoalId | null; durationSec?: number | null; kind?: string;
  mode?: string; styles?: string[]; exclude?: string[];
};

const schema = {
  type: "object", additionalProperties: false,
  properties: {
    options: { type: "array", items: { type: "object", additionalProperties: false, properties: { label: { type: "string" }, text: { type: "string" }, steps: { type: "array", items: { type: "string" } } }, required: ["label", "text", "steps"] } },
  },
  required: ["options"],
} as const;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // The account voice and the allowance are the active workspace owner's.
  const ctx = await resolveContext(supabase, user.id);
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  let body: Body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const profile = await getProfile(ctx.client, ctx.ownerId).catch(() => null);
  const goal = GOALS.find((g) => g.id === body.goal) ?? null;
  const promptCtx = [
    `Account: ${profile?.niche ?? "niche not set"}${profile?.brand_detail?.location ? `, ${profile.brand_detail.location}` : ""}${profile?.goals ? `; overall goal: ${profile.goals}` : ""}.`,
    goal ? `Goal for this piece: ${goal.label} (prioritise ${goal.focus}).` : "",
    body.kind ? `Content: ${body.kind}${body.durationSec ? `, ${Math.round(body.durationSec)}s` : ""}.` : "",
    body.summary ? `SOCIA's analysis:\n${body.summary}` : "",
    body.transcript ? `Transcript / on-screen text:\n"""${body.transcript.slice(0, 2000)}"""` : "No transcript.",
    body.caption ? `Current caption:\n"""${body.caption.slice(0, 1500)}"""` : "No caption yet.",
    body.hook ? `Current hook: "${body.hook}"` : "",
    brandContext(profile?.brand_detail) || "",
  ].filter(Boolean).join("\n");

  const TASK: Record<Task, string> = {
    hooks: `Write 4 new opening lines (hooks) for this content${body.styles?.length ? ` in these styles: ${body.styles.join(", ")}` : ", each in a different style (curiosity, direct, local, educational, challenge, story)"}. label = the style, text = the line (under 90 characters, no quotes), steps = [].${body.exclude?.length ? ` Do not repeat these: ${body.exclude.map((s) => `"${s}"`).join(", ")}.` : ""}`,
    caption: `Rewrite the caption ${body.mode ? `to be ${body.mode}` : "in three useful directions"} while keeping the account's voice and facts. Return 3 options: label = the direction, text = the full caption (with an ask that fits the goal), steps = [].`,
    cta: `Write 4 closing lines (calls to action) that fit the goal and could be spoken or shown as the last on-screen text. label = the kind of ask, text = the line, steps = [].`,
    onscreen: `Propose on-screen text for the opening, the middle and the ending. Return 3 options: label = "0:00 opening" / "mid" / "ending", text = the text (under 60 characters), steps = [].`,
    variations: `Propose 5 variations of this piece as editing briefs: a 15-second version, a 6-second teaser, a TikTok-native version, a Story version, and a photo-carousel concept. label = the variation, text = one sentence on the idea, steps = 3-5 concrete editing instructions with timestamps where they apply. Do not claim any performance outcome.`,
  };
  const task = TASK[body.task] ? body.task : "hooks";

  // One generation per unit of the hooks-and-captions allowance; counted
  // right before the model is called, and given back when no options come back.
  const u = await requireUsage(ctx.client, ctx.ownerId, "content_generation");
  if (u.denied) return u.denied;

  try {
    const params = {
      model: MODEL, max_tokens: 2500,
      system: `You are SOCIA's content editor. Options only, in the account's voice, specific to this content. Never predict performance, never mention algorithms as rules, never invent facts about the business. Plain text, no markdown, no surrounding quotes.`,
      output_config: { format: { type: "json_schema", schema } },
      messages: [{ role: "user", content: `${promptCtx}\n\n# Task\n${TASK[task]}` }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anthropic.messages.create(params as any);
    if (res.stop_reason === "refusal") {
      await u.release();
      return NextResponse.json({ error: "SOCIA declined this one. Try rephrasing." }, { status: 422 });
    }
    const block = res.content.find((b) => b.type === "text");
    let raw: { options?: unknown[] } | null = null;
    try {
      raw = block && "text" in block ? JSON.parse(block.text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) : null;
    } catch { raw = null; }
    const options = Array.isArray(raw?.options) ? raw.options.slice(0, 6) : [];
    if (!options.length) {
      await u.release();
      return NextResponse.json({ error: "SOCIA returned no options. Try again." }, { status: 502 });
    }
    return NextResponse.json({ options, usage: u.usage });
  } catch (err) {
    await u.release();
    const kind = aiFailureKind(err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
  }
}
