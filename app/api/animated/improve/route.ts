import { NextResponse } from "next/server";
import { anthropic, FAST_MODEL, effortFor, aiFailure, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { createClient } from "@/lib/supabase/server";
import { resolveContext, can, forbiddenCopy, brandWorkspace } from "@/lib/context";
import { requireFeature } from "@/lib/planGuard";
import { perUserLimit } from "@/lib/rateLimit";
import { brandContext } from "@/lib/prompt";
import { accountContext } from "@/lib/studioClips/server";
import { cleanPrompt, PROMPT_MAX } from "@/lib/studioClips/reference";

export const runtime = "nodejs";
export const maxDuration = 60;

// Improve the prompt for "Animate a video" (Content Studio).
//   POST { prompt, hasReference? } -> { prompt }
// Rewrites what the person wrote into a clearer brief for an animated video:
// what it is about, the one line that opens it, the points in order and how it
// ends. It adds no facts or numbers the person didn't give. Nothing is saved
// and nothing is counted against the plan's videos; an hourly limit and the
// owner's monthly AI ceiling cover the call.
const SYSTEM = `You rewrite a person's rough request for a short animated vertical video (words, numbers and simple shapes on screen, no filmed footage) into a clear brief the video writer can follow.
Keep their subject, their facts and their numbers exactly. Never add a fact, a number, a name or a claim they didn't give; where one is needed, say "use your real number".
Write 3 to 6 short plain sentences in their own voice: what the video is about and who it is for, the opening line, the points in order, and how it ends (the one thing the viewer should do).
No headings, no lists, no emoji, no hashtags.`;
const SCHEMA = { type: "object", additionalProperties: false, required: ["prompt"], properties: { prompt: { type: "string" } } } as const;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const ctx = await resolveContext(supabase, user.id);
  if (!can(ctx, "publish")) return NextResponse.json({ error: forbiddenCopy("publish") }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { prompt?: unknown; hasReference?: unknown } | null;
  const prompt = cleanPrompt(body?.prompt);
  if (!prompt) return NextResponse.json({ error: "Write a few words about the video first." }, { status: 400 });
  const { denied } = await requireFeature(ctx.client, ctx.ownerId, "auto_build");
  if (denied) return denied;
  const limited = await perUserLimit(ctx.ownerId, "animated-improve", 30, "improving prompts");
  if (limited) return limited;
  try {
    const acct = await accountContext(ctx.client, ctx.ownerId, brandWorkspace(ctx), ctx.workspace?.id ?? null).catch(() => null);
    const brand = acct ? [acct.niche ? `Niche: ${acct.niche}` : null, acct.goals ? `Goal: ${acct.goals}` : null, brandContext(acct.brand) || null].filter(Boolean).join("\n") : "";
    const text = [
      `# What they wrote\n${prompt}`,
      brand ? `# Brand notes\n${brand}` : null,
      body?.hasReference === true ? "# Reference video\nA video to copy is attached. The writer follows its structure, pace and text style, so don't describe a different structure." : null,
    ].filter(Boolean).join("\n\n");
    const params = {
      model: FAST_MODEL, max_tokens: 1200, system: SYSTEM,
      output_config: { format: { type: "json_schema", schema: SCHEMA }, ...effortFor(FAST_MODEL, "medium") },
      messages: [{ role: "user", content: text }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anthropic.messages.create(params as any);
    recordAiUsage(ctx.ownerId, "brief_enhance", res);
    const block = res.content.find((c) => c.type === "text");
    const out = block && block.type === "text" ? (JSON.parse(block.text) as { prompt?: unknown }) : null;
    const improved = typeof out?.prompt === "string" ? out.prompt.trim().slice(0, PROMPT_MAX) : "";
    if (!improved) return NextResponse.json({ error: "SOCIA couldn't improve that. Your words are unchanged." }, { status: 502 });
    return NextResponse.json({ prompt: improved });
  } catch (e) {
    const kind = aiFailure("animated/improve", e);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
  }
}
