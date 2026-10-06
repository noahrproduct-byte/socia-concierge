// Generating a Content Plan: the model call, the parse, and the save. Shared
// by the Content Plan page (a person clicks "Generate") and the Monday job
// (SOCIA generates the coming week by itself). Usage metering and permission
// checks happen in the callers; this only produces and stores the plan.
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, MODEL } from "./anthropic";
import { SYSTEM, buildUserPrompt } from "./prompt";
import { deliverableSchema, type Deliverable, type GenerateInput, type SavedPlan } from "./schema";
import type { BrandDetail } from "./profile";
import type { Evidence } from "./planEvidence";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type PlanFailure = "refusal" | "empty" | "parse";

export class PlanGenerationError extends Error {
  constructor(public kind: PlanFailure, message: string) {
    super(message);
    this.name = "PlanGenerationError";
  }
}

// Structured outputs should return clean JSON, but strip code fences and fall
// back to the outermost {...} if a model ever wraps it.
export function parsePlanJson(text: string): unknown {
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

const SAVED_COLS = "id, client_handle, niche, platform, data, created_at";

/** Ask the strategist for the plan. Throws PlanGenerationError when no plan came out. */
export async function generatePlanData(input: GenerateInput, brand: BrandDetail | null, evidence: Evidence | null): Promise<Deliverable> {
  // Params are cast loosely: `output_config` (structured outputs) is a newer
  // field, and casting keeps the build green across SDK versions while still
  // sending it in the request body.
  const params = {
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: deliverableSchema } },
    messages: [{ role: "user", content: buildUserPrompt(input, brand, evidence) }],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await anthropic.messages.create(params as any);
  if (res.stop_reason === "refusal") throw new PlanGenerationError("refusal", "The model declined this request. Try rephrasing the brief.");
  const textBlock = res.content.find((b) => b.type === "text");
  const text = textBlock && "text" in textBlock ? textBlock.text : "";
  if (!text) throw new PlanGenerationError("empty", "Empty response from the model. Try again.");
  const data = parsePlanJson(text) as Deliverable | null;
  if (!data) throw new PlanGenerationError("parse", "Could not parse the model's response. Try again.");
  // Record what the plan was built from, so the report and history can say so.
  if (evidence) data.evidenceUsed = evidence.used;
  return data;
}

/**
 * Save a plan to the owner's history, tagged with the workspace it was built
 * in. Best-effort: if the `plans` table doesn't exist the plan is still
 * returned; if only the `workspace_id` column is missing (workspaces migration
 * not run yet), the row is saved without it.
 */
export async function savePlan(client: Supa, ownerId: string, workspaceId: string | null, input: GenerateInput, data: Deliverable): Promise<SavedPlan | null> {
  const base = {
    user_id: ownerId,
    client_handle: input.clientHandle || null,
    niche: input.niche || null,
    platform: input.platform || null,
    data,
  };
  try {
    if (workspaceId) {
      const withWs = await client.from("plans").insert({ ...base, workspace_id: workspaceId }).select(SAVED_COLS).single();
      if (!withWs.error) return withWs.data as SavedPlan;
    }
    const plain = await client.from("plans").insert(base).select(SAVED_COLS).single();
    return plain.error ? null : (plain.data as SavedPlan);
  } catch {
    return null;
  }
}

export async function generatePlan(opts: {
  client: Supa;
  ownerId: string;
  workspaceId: string | null;
  input: GenerateInput;
  brand: BrandDetail | null;
  evidence: Evidence | null;
}): Promise<{ data: Deliverable; saved: SavedPlan | null }> {
  const data = await generatePlanData(opts.input, opts.brand, opts.evidence);
  const saved = await savePlan(opts.client, opts.ownerId, opts.workspaceId, opts.input, data);
  return { data, saved };
}
