// Generating a Content Plan: the model call, the parse, and the save. Shared
// by the Content Plan page (a person clicks "Generate") and the Monday job
// (SOCIA generates the coming week by itself). Usage metering and permission
// checks happen in the callers; this only produces and stores the plan.
import { cleanEvidenceSplit, normalizePlanItem, withItemIds } from "./planItems";
import { planHeadline } from "./planHeadline";
import { pickFilmRef, pickRef } from "./trendSignals";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anthropic, MODEL, effortFor } from "./anthropic";
import { recordAiUsage } from "./aiUsage";
import { SYSTEM, buildUserPrompt } from "./prompt";
import { cleanIdeas, markIdeaPosts } from "./planIdeas";
import { deliverableSchema, type Deliverable, type GenerateInput, type SavedPlan } from "./schema";
import type { BrandDetail } from "./profile";
import type { Evidence } from "./planEvidence";
import { isMissingColumnError } from "./workspaces";
import { writeAnimatedPosts } from "./animated/planPosts";
import { platformName } from "./planItems";
import { brandLines } from "./brandBrief";
import { pitchFromDetail, pitchLines } from "./brandPitch";
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

/**
 * One post as the strategist wrote it, made into a saved plan item: the account's own posts it cited (P#)
 * become their links and numbers, the niche Reel it named becomes that Reel's link and numbers, the Reel to
 * film from is one made the way a person films, and evidence lines cite only ids the model was shown.
 */
export function polishItem(p: Deliverable["weeklyPlan"][number], evidence: Evidence | null): Deliverable["weeklyPlan"][number] {
  const proven = evidence?.proven ?? [];
  const own = evidence?.ownPosts ?? [];
  const known = new Set([...own.map((o) => o.id), ...proven.map((r) => r.id)]);
  const cited = (p as { ownRefs?: unknown }).ownRefs;
  const ownPosts = Array.isArray(cited) ? own.filter((o) => cited.some((c) => typeof c === "string" && c.trim().toUpperCase() === o.id)).slice(0, 4) : [];
  const { ownRefs: _drop, ...rest } = p as typeof p & { ownRefs?: unknown };
  void _drop;
  // The Reel to film from must be made the way a person films (talking, screen, footage, a skit): an animated
  // or slides Reel is never a filming example, whatever the model picked (2026-11-23).
  const filmRef = p.animated ? null : pickFilmRef((p as { filmReference?: unknown }).filmReference, proven, evidence?.provenStyles ?? {});
  return normalizePlanItem({ ...rest, ref: pickRef(p.reference, proven) ?? undefined, filmRef: filmRef ?? undefined, filmLike: filmRef ? p.filmLike : undefined, ownPosts: ownPosts.length ? ownPosts : undefined, evidenceSplit: cleanEvidenceSplit(p.evidenceSplit, known) });
}

const SAVED_COLS = "id, client_handle, niche, platform, data, created_at";

/** Ask the strategist for the plan. Throws PlanGenerationError when no plan came out. */
export async function generatePlanData(input: GenerateInput, brand: BrandDetail | null, evidence: Evidence | null, ownerId?: string | null, onProgress?: (e: PlanEvent) => void): Promise<Deliverable> {
  // Params are cast loosely: `output_config` (structured outputs) is a newer
  // field, and casting keeps the build green across SDK versions while still
  // sending it in the request body.
  const params = {
    model: MODEL,
    // A week of posts, each with beats and filming directions, plus the thinking, ran past 16,000 and came
    // back cut off ("Could not parse the model's response", 2026-11-23). Streamed below, so this much is allowed.
    max_tokens: 32000,
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
    // Streamed as well: a non-streamed call this large is refused by the SDK.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res = await anthropic.messages.stream(params as any).finalMessage();
  }
  recordAiUsage(ownerId, "content_plan", res);
  if (res.stop_reason === "refusal") throw new PlanGenerationError("refusal", "The model declined this request. Try rephrasing the brief.");
  // Said as what it is, never as "couldn't parse": the plan ran out of room before it was finished.
  if (res.stop_reason === "max_tokens") throw new PlanGenerationError("parse", "The plan was too long to finish this time. Try again, or ask for fewer posts this week.");
  const textBlock = res.content.find((b) => b.type === "text");
  const text = textBlock && "text" in textBlock ? textBlock.text : "";
  if (!text) throw new PlanGenerationError("empty", "Empty response from the model. Try again.");
  const data = parsePlanJson(text) as Deliverable | null;
  if (!data) throw new PlanGenerationError("parse", "Could not parse the model's response. Try again.");
  data.headline = planHeadline(data.headline);
  // Posts made from the person's own ideas are marked as theirs; an idea no post was made from is kept to say so.
  const ideas = cleanIdeas(input.ideas);
  const marked = markIdeaPosts((data.weeklyPlan ?? []) as (Deliverable["weeklyPlan"][number] & { fromIdea?: unknown })[], ideas);
  data.ideasLeft = marked.left.length ? marked.left : undefined;
  data.weeklyPlan = withItemIds((marked.items as Deliverable["weeklyPlan"]).map((p) => polishItem(p, evidence)));
  // A competitor insight that names an account SOCIA never read is general knowledge: it says so, and names no one.
  data.competitorInsights = (data.competitorInsights ?? []).map((c) => (c.basis === "general" || !evidence?.competitorsBlock ? { ...c, basis: "general" as const } : { ...c, basis: "measured" as const }));
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
    }).concat(pitchLines(pitchFromDetail(brand, { name: input.clientHandle, goals: input.goal }))).join("\n");
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
