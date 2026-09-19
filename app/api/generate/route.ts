import { NextResponse } from "next/server";
import { anthropic, MODEL, aiFailureKind, AI_UNAVAILABLE_COPY } from "@/lib/anthropic";
import { SYSTEM, buildUserPrompt } from "@/lib/prompt";
import { getProfile } from "@/lib/profile";
import { deliverableSchema, type Deliverable, type GenerateInput } from "@/lib/schema";
import { createClient } from "@/lib/supabase/server";
import { getIgSnapshot } from "@/lib/instagramSync";
import { loadEvidence, type Evidence } from "@/lib/planEvidence";

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

// The brief's free-text fields go straight into the prompt; each is cut to a
// sane size rather than rejected.
const MAX_FIELD_CHARS = 4000;

export async function POST(req: Request) {
  // Every call here is an Opus request with a large budget: signed-in users only.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY.no_key, kind: "no_key" }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const fields = raw as Record<string, unknown>;
  const text = (k: keyof GenerateInput) => {
    const v = fields[k];
    return typeof v === "string" ? v.slice(0, MAX_FIELD_CHARS) : "";
  };
  const input: GenerateInput = {
    clientHandle: text("clientHandle"), niche: text("niche"), platform: text("platform"),
    brandVoice: text("brandVoice"), recentPosts: text("recentPosts"), competitors: text("competitors"),
    goal: text("goal"), audienceWindows: text("audienceWindows"),
  };

  if (!input.clientHandle.trim() && !input.niche.trim()) {
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
    brand = (await getProfile(supabase, user.id))?.brand_detail ?? null;
    const snap = await getIgSnapshot(supabase, user.id).catch(() => null);
    evidence = await loadEvidence(supabase, user.id, snap);
    evidence.used.windows = Boolean(input.audienceWindows?.trim());
  } catch {
    // generation still works without settings or evidence
  }

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
      return NextResponse.json(
        { error: "The model declined this request. Try rephrasing the brief." },
        { status: 422 },
      );
    }

    const textBlock = res.content.find((b) => b.type === "text");
    const text = textBlock && "text" in textBlock ? textBlock.text : "";
    if (!text) {
      return NextResponse.json(
        { error: "Empty response from the model. Try again." },
        { status: 502 },
      );
    }

    const data = parseJson(text);
    if (!data) {
      return NextResponse.json(
        { error: "Could not parse the model's response. Try again." },
        { status: 502 },
      );
    }

    // Record what the plan was built from, so the report and history can say so.
    if (evidence) (data as Deliverable).evidenceUsed = evidence.used;

    // Save to the user's history. Best-effort: if the `plans` table doesn't
    // exist yet, generation still succeeds.
    let saved = null;
    try {
      const { data: row, error: saveErr } = await supabase
        .from("plans")
        .insert({
          user_id: user.id,
          client_handle: input.clientHandle || null,
          niche: input.niche || null,
          platform: input.platform || null,
          data,
        })
        .select("id, client_handle, niche, platform, data, created_at")
        .single();
      if (saveErr) console.error("generate: plan save failed:", saveErr.message);
      saved = row;
    } catch (e) {
      // the plan was still generated
      console.error("generate: plan save failed:", e);
    }

    return NextResponse.json({ data, saved });
  } catch (err: unknown) {
    // Never the SDK's own message: log it here, tell the user what they can do.
    console.error("generate: model call failed:", err);
    const kind = aiFailureKind(err);
    return NextResponse.json({ error: AI_UNAVAILABLE_COPY[kind], kind }, { status: kind === "rate_limited" ? 429 : 502 });
  }
}
