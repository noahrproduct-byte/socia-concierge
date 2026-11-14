// Generating a Content Plan: the model call, the parse, and the save. Shared
// by the Content Plan page (a person clicks "Generate") and the Monday job
// (SOCIA generates the coming week by itself). Usage metering and permission
// checks happen in the callers; this only produces and stores the plan.
import { normalizePlanItem, withItemIds } from "./planItems";
import { pickRef } from "./trendSignals";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, MODEL, effortFor } from "./anthropic";
import { recordAiUsage } from "./aiUsage";
import { SYSTEM, buildUserPrompt } from "./prompt";
import { deliverableSchema, type Deliverable, type GenerateInput, type SavedPlan } from "./schema";
import type { BrandDetail } from "./profile";
import type { Evidence } from "./planEvidence";
import { isMissingColumnError } from "./workspaces";
import { writeAnimatedPosts } from "./animated/planPosts";
import { platformName } from "./planItems";
import { brandLines } from "./brandBrief";
import { postsStarted, type PlanEvent } from "./planProgress";

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
export async function generatePlanData(input: GenerateInput, brand: BrandDetail | null, evidence: Evidence | null, ownerId?: string | null, onProgress?: (e: PlanEvent) => void): Promise<Deliverable> {
  // Params are cast loosely: `output_config` (structured outputs) is a newer
  // field, and casting keeps the build green across SDK versions while still
  // sending it in the request body.
  const params = {
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: deliverableSchema }, ...effortFor(MODEL) },
    messages: [{ role: "user", content: buildUserPrompt(input, brand, evidence) }],
  };
  // With a listener, the answer streams in so the page can show the posts being written as they start.
  const total = input.onCamera ?? 0;
  let res;
  if (onProgress) {
    onProgress({ type: "step", step: "fit", state: "active" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = anthropic.messages.stream(params as any);
    let started = 0;
    stream.on("text", (_delta: string, snapshot: string) => {
      const n = Math.min(postsStarted(snapshot), total || Infinity);
      if (n === started) return;
      if (started === 0) {
        onProgress({ type: "step", step: "fit", state: "done" });
        onProgress({ type: "step", step: "posts", state: "active" });
      }
      started = n;
      onProgress({ type: "posts", started: n, total: Math.max(total, n) });
    });
    res = await stream.finalMessage();
    if (started === 0) onProgress({ type: "step", step: "fit", state: "done" });
    onProgress({ type: "step", step: "posts", state: "done" });
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res = await anthropic.messages.create(params as any);
  }
  recordAiUsage(ownerId, "content_plan", res);
  if (res.stop_reason === "refusal") throw new PlanGenerationError("refusal", "The model declined this request. Try rephrasing the brief.");
  const textBlock = res.content.find((b) => b.type === "text");
  const text = textBlock && "text" in textBlock ? textBlock.text : "";
  if (!text) throw new PlanGenerationError("empty", "Empty response from the model. Try again.");
  const data = parsePlanJson(text) as Deliverable | null;
  if (!data) throw new PlanGenerationError("parse", "Could not parse the model's response. Try again.");
  // A post's "reference" is an id from the Reels the strategist was shown: SOCIA swaps it for that Reel's own link and numbers.
  const proven = evidence?.proven ?? [];
  data.weeklyPlan = withItemIds((data.weeklyPlan ?? []).map((p) => normalizePlanItem({ ...p, ref: pickRef(p.reference, proven) ?? undefined })));
  // Animated posts on top of the filmed ones (lib/animated/planPosts.ts): the number chosen for this week
  // (lib/planMix.ts), or, when none was given, the brand's setting of one or two a day.
  if (input.animated != null ? input.animated > 0 : brand?.animated?.on) {
    // Everything the person confirmed about the account: what it is, who it's for, how it posts and its look (lib/brandBrief.ts).
    const brandLine = brandLines({
      handle: input.clientHandle,
      niche: input.niche,
      description: brand?.description,
      specific: brand?.growth?.niche_path?.specific,
      audience: brand?.growth?.audience?.who,
      formats: brand?.formats,
      look: brand?.look,
      voice: brand?.voice,
      location: brand?.location,
      avoid: brand?.avoid,
    }).join("\n");
    onProgress?.({ type: "step", step: "animated", state: "active" });
    const animated = await writeAnimatedPosts({ brand, brandLine, filmed: data.weeklyPlan, platform: platformName(input.platform) ?? undefined, ownerId, count: input.animated });
    if (animated.length) data.weeklyPlan = [...data.weeklyPlan, ...withItemIds(animated)];
    onProgress?.({ type: "step", step: "animated", state: "done" });
  }
  // Record what the plan was built from, so the report and history can say so.
  if (evidence) data.evidenceUsed = { ...evidence.used, references: data.weeklyPlan.filter((p) => p.ref).length };
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
      // Saved without the workspace only before its column exists; any other
      // error must not drop a brand's plan into the default workspace.
      if (!isMissingColumnError(withWs.error)) return null;
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
  onProgress?: (e: PlanEvent) => void;
}): Promise<{ data: Deliverable; saved: SavedPlan | null }> {
  const t0 = Date.now();
  const data = await generatePlanData(opts.input, opts.brand, opts.evidence, opts.ownerId, opts.onProgress);
  // How long this plan took, so the page can tell the next one how long to expect.
  data.buildSeconds = Math.round((Date.now() - t0) / 1000);
  opts.onProgress?.({ type: "step", step: "saving", state: "active" });
  const saved = await savePlan(opts.client, opts.ownerId, opts.workspaceId, opts.input, data);
  opts.onProgress?.({ type: "step", step: "saving", state: "done" });
  return { data, saved };
}
