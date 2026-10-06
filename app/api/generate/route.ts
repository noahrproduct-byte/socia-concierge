import { NextResponse } from "next/server";
import { anthropic, MODEL } from "@/lib/anthropic";
import { SYSTEM, buildUserPrompt } from "@/lib/prompt";
import { getProfile } from "@/lib/profile";
import { deliverableSchema, type Deliverable, type GenerateInput } from "@/lib/schema";
import { createClient } from "@/lib/supabase/server";
import { getIgSnapshot } from "@/lib/instagramSync";
import { loadEvidence, type Evidence } from "@/lib/planEvidence";
import { requireUsage } from "@/lib/planGuard";
import { resolveContext, brandWorkspace } from "@/lib/context";
import { competitorScopeId } from "@/lib/workspaces";
import { recentPlanOutcomes } from "@/lib/planOutcomesLoad";

export const runtime = "nodejs";
// Opus 5 thinks before answering; give the request room.
export const maxDuration = 300;

// Structured outputs should return clean JSON, but strip code fences and fall
// back to the outermost {...} if a model ever wraps it.
function parseJson(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function POST(req: Request) {
  // Signed-in users only: a plan is the most expensive thing SOCIA generates
  // and it counts against the Content Plan allowance.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  // The plan is built from, saved to, and charged against the active Brand
  // Workspace's owner (the viewer, unless they were invited into it).
  const ctx = await resolveContext(supabase, user.id);

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and add your key, then restart the dev server.",
      },
      { status: 500 },
    );
  }

  let input: GenerateInput;
  try {
    input = (await req.json()) as GenerateInput;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!input.clientHandle?.trim() && !input.niche?.trim()) {
    return NextResponse.json(
      { error: "Enter at least a client handle or a niche to analyze." },
      { status: 400 },
    );
  }

  // The user's saved brand & strategist settings sharpen the plan, and the
  // evidence SOCIA already holds (posts, competitors, winning content) is what
  // the strategist reasons over. All best-effort: generation still works with
  // the typed brief alone, and the plan records what it was built from.
  let brand = null;
  let evidence: Evidence | null = null;
  try {
    brand = (await getProfile(ctx.client, ctx.ownerId, brandWorkspace(ctx)))?.brand_detail ?? null;
    const snap = await getIgSnapshot(ctx.client, ctx.ownerId).catch(() => null);
    // The last two plans and what became of them, so the strategist learns
    // from what was posted, skipped, and how each post did.
    const outcomes = await recentPlanOutcomes(ctx.client, ctx.ownerId, ctx.workspace?.id ?? null).catch(() => []);
    evidence = await loadEvidence(ctx.client, ctx.ownerId, snap, await competitorScopeId(ctx.client, ctx.workspace?.id), { outcomes });
    evidence.used.windows = Boolean(input.audienceWindows?.trim());
  } catch {
    // generation still works without settings or evidence
  }

  // Weekly plans are a Starter feature, and each one counts against the
  // period's allowance. Counted right before the model is called, and given
  // back when no plan comes out of the call.
  const u = await requireUsage(ctx.client, ctx.ownerId, "content_plan", { feature: "content_plan" });
  if (u.denied) return u.denied;

  try {
    // Params are cast loosely: `output_config` (structured outputs) is a
    // newer field, and casting keeps the build green across SDK versions
    // while still sending it in the request body.
    const params = {
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      // Structured outputs guarantee valid JSON matching our schema.
      output_config: {
        format: { type: "json_schema", schema: deliverableSchema },
      },
      messages: [{ role: "user", content: buildUserPrompt(input, brand, evidence) }],
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await anthropic.messages.create(params as any);

    if (res.stop_reason === "refusal") {
      await u.release();
      return NextResponse.json(
        { error: "The model declined this request. Try rephrasing the brief." },
        { status: 422 },
      );
    }

    const textBlock = res.content.find((b) => b.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "";
    if (!text) {
      await u.release();
      return NextResponse.json(
        { error: "Empty response from the model. Try again." },
        { status: 502 },
      );
    }

    const data = parseJson(text);
    if (!data) {
      await u.release();
      return NextResponse.json(
        { error: "Could not parse the model's response. Try again." },
        { status: 502 },
      );
    }

    // Record what the plan was built from, so the report and history can say so.
    if (evidence) (data as Deliverable).evidenceUsed = evidence.used;

    // Save to the workspace owner's history, tagged with the workspace it was
    // built in. Best-effort: if the `plans` table doesn't exist yet, generation
    // still succeeds; if only the `workspace_id` column is missing (workspaces
    // migration not run yet), the row is saved without it.
    let saved = null;
    try {
      const SAVED_COLS = "id, client_handle, niche, platform, data, created_at";
      const base = {
        user_id: ctx.ownerId,
        client_handle: input.clientHandle || null,
        niche: input.niche || null,
        platform: input.platform || null,
        data,
      };
      let row = null;
      if (ctx.workspace) {
        const withWs = await ctx.client
          .from("plans")
          .insert({ ...base, workspace_id: ctx.workspace.id })
          .select(SAVED_COLS)
          .single();
        row = withWs.error ? null : withWs.data;
        if (withWs.error) {
          const plain = await ctx.client.from("plans").insert(base).select(SAVED_COLS).single();
          row = plain.error ? null : plain.data;
        }
      } else {
        const plain = await ctx.client.from("plans").insert(base).select(SAVED_COLS).single();
        row = plain.error ? null : plain.data;
      }
      saved = row;
    } catch {
      // ignore save errors, the plan was still generated
    }

    return NextResponse.json({ data, saved, usage: u.usage });
  } catch (err: unknown) {
    await u.release();
    const message =
      err instanceof Error ? err.message : "Unexpected error generating the plan.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
