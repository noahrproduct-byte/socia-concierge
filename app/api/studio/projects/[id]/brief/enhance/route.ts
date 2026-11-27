import { NextResponse } from "next/server";
import { anthropic, FAST_MODEL, effortFor, aiFailure, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { recordAiUsage } from "@/lib/aiUsage";
import { requireFeature } from "@/lib/planGuard";
import { perUserLimit } from "@/lib/rateLimit";
import { brandContext } from "@/lib/prompt";
import { brandWorkspace } from "@/lib/context";
import { studioRequest, requireMutate, isMissingTable, MIGRATION_HINT } from "@/lib/studioClips/auth";
import { accountContext, clipRows, getProjectRow } from "@/lib/studioClips/server";
import { cleanPrompt } from "@/lib/studioClips/reference";
import { clipLines, ENHANCE_SCHEMA, ENHANCE_SYSTEM, sanitizeEnhanced } from "@/lib/studioClips/enhancePrompt";

export const runtime = "nodejs";
export const maxDuration = 60;

// Improve the prompt (lib/studioClips/enhancePrompt.ts).
//   POST { prompt?, hasReference?, help?, reference?, goal? } -> { prompt, added, unseen, clips }
// "Help me write a prompt" (help: true) may start from an empty box: the brief is then written from the
// clips, the brand, the goal the person came with (a planned post, a Discover idea) and the reference's
// measured facts (its length, shots and whether anyone speaks), never from anything SOCIA didn't read.
// Rewrites what the person wrote into a brief built from this project's clips.
// Nothing is saved and nothing is counted against the plan's videos: the person
// reads it, edits it, and only "Make the video" makes one. An hourly limit and
// the owner's monthly AI ceiling cover the call.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await studioRequest();
  if (!r.ok) return r.res;
  const { ctx } = r;
  const forbidden = requireMutate(ctx);
  if (forbidden) return forbidden;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { prompt?: unknown; hasReference?: unknown; help?: unknown; reference?: unknown; goal?: unknown } | null;
  const help = body?.help === true;
  const prompt = cleanPrompt(body?.prompt);
  if (!prompt && !help) return NextResponse.json({ error: "Write a few words about the video first." }, { status: 400 });
  const goal = typeof body?.goal === "string" ? body.goal.replace(/\s+/g, " ").trim().slice(0, 600) : "";
  const r0 = body?.reference && typeof body.reference === "object" ? (body.reference as Record<string, unknown>) : null;
  const refFacts = r0 && typeof r0.durationSec === "number" && r0.durationSec > 0 && r0.durationSec <= 600
    ? `Its length is ${Math.round(r0.durationSec)} seconds${typeof r0.shots === "number" && r0.shots > 0 && r0.shots < 500 ? `, ${Math.round(r0.shots)} shots` : ""}${r0.speech === true ? ", and someone speaks in it" : r0.speech === false ? ", and no one speaks in it" : ""}.`
    : "";
  try {
    const { denied } = await requireFeature(ctx.client, ctx.ownerId, "auto_build");
    if (denied) return denied;
    const limited = await perUserLimit(ctx.ownerId, "studio-enhance", 30, "improving prompts");
    if (limited) return limited;
    const wsId = ctx.workspace?.id ?? null;
    const project = await getProjectRow(ctx.client, ctx.ownerId, wsId, id);
    if (!project) return NextResponse.json({ error: "That project does not exist." }, { status: 404 });
    const [rows, acct] = await Promise.all([clipRows(ctx.client, project.id), accountContext(ctx.client, ctx.ownerId, brandWorkspace(ctx))]);
    const usable = rows.filter((c) => !c.purged_at && c.status !== "expired");
    const brand = [acct.niche ? `Niche: ${acct.niche}` : null, acct.goals ? `Goal: ${acct.goals}` : null, brandContext(acct.brand) || null].filter(Boolean).join("\n");
    const text = [
      prompt ? `# What they wrote\n${prompt}` : "# What they wrote\nNothing yet. Write the brief for them from the clips, the brand notes and the goal below, keeping to what is really there.",
      goal ? `# What they want this video to do\n${goal}` : null,
      `# The clips\n${clipLines(usable)}`,
      brand ? `# Brand notes\n${brand}` : null,
      // What goes viral in the niche (lib/nicheScan): the improved prompt can ask for a proven on-screen line.
      acct.playbook ? `# ${acct.playbook}` : null,
      body?.hasReference === true || refFacts ? `# Reference video\nA reference video is attached. The editor copies its length, pace and text style.${refFacts ? ` ${refFacts}` : ""}` : null,
    ].filter(Boolean).join("\n\n");
    const params2 = {
      model: FAST_MODEL, max_tokens: 1500, system: ENHANCE_SYSTEM,
      output_config: { format: { type: "json_schema", schema: ENHANCE_SCHEMA }, ...effortFor(FAST_MODEL, "medium") },
      messages: [{ role: "user", content: text }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anthropic.messages.create(params2 as any);
    recordAiUsage(ctx.ownerId, "brief_enhance", res);
    const block = res.content.find((b) => b.type === "text");
    const out = sanitizeEnhanced(block && "text" in block ? JSON.parse(block.text) : null);
    if (!out) return NextResponse.json({ error: "SOCIA couldn't improve that prompt. Try adding a few more words." }, { status: 422 });
    // How many of the clips SOCIA has not watched yet (nothing is watched until a video is made): the screen says so,
    // so a prompt that names no shots is explained there and never inside the prompt.
    return NextResponse.json({ ...out, unseen: usable.filter((c) => !c.card).length, clips: usable.length });
  } catch (e) {
    if (isMissingTable(e)) return NextResponse.json({ error: MIGRATION_HINT, migration: true }, { status: 503 });
    const kind = aiFailure("studio/brief/enhance", e);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
  }
}
