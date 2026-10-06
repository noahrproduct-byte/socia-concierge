// Server-side reads and writes for Build from Clips: rows ↔ the shapes the UI
// uses, clip registration under the plan's limits, and building one
// opportunity's EDL + guide. Everything is scoped to the workspace owner and
// the active Brand Workspace, like the rest of SOCIA.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLimit, type Entitlements } from "@/lib/entitlements";
import { getProfile } from "@/lib/profile";
import type { Workspace } from "@/lib/workspaces";
import { scopeToWorkspace } from "@/lib/workspaces";
import { signUrls, clipFolder, removeFolder } from "./storage";
import { checkClipFits, projectTotals, ownerStorageBytes, expiryFor, type FitResult } from "./limits";
import { opportunityEdl, type AccountContext, type ClipInput } from "./analysis";
import { validateEdl, guideFromEdl, edlDurationSec, type ClipForEdl } from "./edl";
import type { ClipCard, ClipFacts, ClipStatus, Edl, GuideStep, Opportunity, ProjectStatus, StudioBuild, StudioClip, StudioProject, Transcript, UnderstandProgress, YieldResult } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Supa = SupabaseClient<any, any, any>;

export type ProjectRow = {
  id: string; user_id: string; workspace_id: string | null; created_by: string | null; title: string | null;
  status: ProjectStatus; progress: UnderstandProgress | null; batch: unknown; yield: YieldResult | null; error: string | null;
  created_at: string; updated_at: string;
};

export type ClipRow = {
  id: string; project_id: string; user_id: string; workspace_id: string | null; position: number; fingerprint: string;
  name: string; mime: string | null; bytes: number; duration_s: number | null; width: number | null; height: number | null;
  recorded_at: string | null; source_path: string | null; frames: { t: number; path: string }[] | null; audio_path: string | null;
  facts: ClipFacts | null; transcript: Transcript | null; card: ClipCard | null; status: ClipStatus; error: string | null;
  expires_at: string | null; purged_at: string | null; created_at: string; updated_at: string;
};

type BuildRow = { id: string; project_id: string; opportunity_idx: number; edl: Edl; guide: GuideStep[]; caption: string | null; created_at: string };

const PROJECT_COLS = "id, user_id, workspace_id, created_by, title, status, progress, batch, yield, error, created_at, updated_at";
const now = () => new Date().toISOString();

// ------------------------------------------------------------ projects ----

export type ProjectSummary = { id: string; title: string | null; status: ProjectStatus; clips: number; posts: number | null; updatedAt: string };

export async function listProjects(client: Supa, ownerId: string, wsId: string | null, limit = 12): Promise<ProjectSummary[]> {
  const { data, error } = await scopeToWorkspace(
    client.from("studio_projects").select("id, title, status, updated_at, yield, studio_clips(count)").eq("user_id", ownerId),
    wsId,
  ).order("updated_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as (ProjectRow & { studio_clips: { count: number }[] })[]).map((r) => ({
    id: r.id, title: r.title, status: r.status, updatedAt: r.updated_at,
    clips: r.studio_clips?.[0]?.count ?? 0,
    posts: r.yield ? r.yield.opportunities.length : null,
  }));
}

export async function getProjectRow(client: Supa, ownerId: string, wsId: string | null, id: string): Promise<ProjectRow | null> {
  const { data, error } = await scopeToWorkspace(client.from("studio_projects").select(PROJECT_COLS).eq("user_id", ownerId).eq("id", id), wsId).limit(1);
  if (error) throw error;
  return ((data ?? []) as ProjectRow[])[0] ?? null;
}

export async function createProject(client: Supa, ownerId: string, wsId: string | null, createdBy: string, title: string | null): Promise<ProjectRow> {
  const row: Record<string, unknown> = { user_id: ownerId, created_by: createdBy, title, status: "collecting" };
  if (wsId) row.workspace_id = wsId;
  const { data, error } = await client.from("studio_projects").insert(row).select(PROJECT_COLS).single();
  if (error) throw error;
  return data as ProjectRow;
}

export async function updateProject(client: Supa, id: string, patch: Partial<Pick<ProjectRow, "title" | "status" | "progress" | "batch" | "yield" | "error">>): Promise<void> {
  const { error } = await client.from("studio_projects").update({ ...patch, updated_at: now() }).eq("id", id);
  if (error) throw error;
}

export async function clipRows(client: Supa, projectId: string): Promise<ClipRow[]> {
  const { data, error } = await client.from("studio_clips").select("*").eq("project_id", projectId).order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ClipRow[];
}

/** Signed URLs for every keyframe of these clips (footage that expired has none). */
export async function frameUrls(client: Supa, rows: ClipRow[]): Promise<Record<string, string>> {
  const paths = rows.flatMap((r) => (r.purged_at ? [] : (r.frames ?? []).map((f) => f.path)));
  return signUrls(client, paths);
}

export function rowToClip(r: ClipRow, urls: Record<string, string>): StudioClip {
  return {
    id: r.id, projectId: r.project_id, position: r.position, name: r.name, mime: r.mime, bytes: r.bytes,
    durationSec: r.duration_s, width: r.width, height: r.height, recordedAt: r.recorded_at,
    status: r.status, error: r.error, facts: r.facts, transcript: r.transcript, card: r.card,
    frames: r.purged_at ? [] : (r.frames ?? []).map((f) => ({ t: f.t, url: urls[f.path] })).filter((f) => f.url),
    expiresAt: r.expires_at,
    // A card older than the row itself was copied from an identical clip analysed earlier.
    reused: Boolean(r.card && new Date(r.card.createdAt).getTime() < new Date(r.created_at).getTime() - 1000),
  };
}

export async function loadProject(client: Supa, ownerId: string, wsId: string | null, id: string): Promise<StudioProject | null> {
  const row = await getProjectRow(client, ownerId, wsId, id);
  if (!row) return null;
  const [rows, builds] = await Promise.all([
    clipRows(client, id),
    client.from("studio_builds").select("opportunity_idx").eq("project_id", id),
  ]);
  const urls = await frameUrls(client, rows);
  return {
    id: row.id, title: row.title, status: row.status, progress: row.progress, yield: row.yield, error: row.error,
    createdAt: row.created_at, updatedAt: row.updated_at,
    clips: rows.map((r) => rowToClip(r, urls)),
    builds: ((builds.data ?? []) as { opportunity_idx: number }[]).map((b) => b.opportunity_idx),
  };
}

export async function deleteProject(client: Supa, ownerId: string, wsId: string | null, id: string): Promise<boolean> {
  const row = await getProjectRow(client, ownerId, wsId, id);
  if (!row) return false;
  const rows = await clipRows(client, id);
  for (const c of rows) if (c.source_path && !c.purged_at) await removeFolder(client, c.source_path.split("/").slice(0, 3).join("/"));
  const { error } = await client.from("studio_projects").delete().eq("id", id).eq("user_id", ownerId);
  if (error) throw error;
  return true;
}

// --------------------------------------------------------------- clips ----

export type RegisterInput = {
  fingerprint: string; name: string; mime: string | null; bytes: number; durationSec: number;
  width: number | null; height: number | null; recordedAt: string | null;
};

export type RegisterResult =
  | { ok: true; clip: StudioClip; folder: string; reused: boolean; expiresAt: string }
  | { ok: false; status: number; body: Record<string, unknown> };

/**
 * Reserve a slot for a clip before its bytes are uploaded: the plan's limits
 * are checked here, on the server, and an identical clip the owner analysed
 * before lends its transcript, measurements and card (no second transcription
 * or model call). The bytes are still uploaded: each project owns its footage
 * and its retention date.
 */
export async function registerClip(client: Supa, args: { ownerId: string; viewerId: string; wsId: string | null; ent: Entitlements; project: ProjectRow; input: RegisterInput }): Promise<RegisterResult> {
  const { ownerId, viewerId, wsId, ent, project, input } = args;
  if (!(input.durationSec > 0)) return { ok: false, status: 400, body: { error: "SOCIA couldn't read this file's length." } };

  const existing = await clipRows(client, project.id);
  if (existing.some((c) => c.fingerprint === input.fingerprint && !c.purged_at)) {
    return { ok: false, status: 409, body: { error: "This clip is already in the project.", duplicate: true } };
  }
  const [totals, ownerBytes] = await Promise.all([projectTotals(client, project.id), ownerStorageBytes(client, ownerId)]);
  const fit: FitResult = checkClipFits(ent, totals, ownerBytes, { bytes: input.bytes, durationSec: input.durationSec });
  if (!fit.ok) return "plan" in fit ? { ok: false, status: 403, body: fit.plan as unknown as Record<string, unknown> } : { ok: false, status: 400, body: { error: fit.message } };

  // Reuse: the same footage analysed earlier (any project of this owner).
  let reuse: Pick<ClipRow, "facts" | "transcript" | "card"> | null = null;
  try {
    const { data } = await client.from("studio_clips").select("facts, transcript, card").eq("user_id", ownerId).eq("fingerprint", input.fingerprint).not("card", "is", null).order("created_at", { ascending: false }).limit(1);
    reuse = ((data ?? []) as ClipRow[])[0] ?? null;
  } catch { reuse = null; }

  const row: Record<string, unknown> = {
    project_id: project.id, user_id: ownerId, position: existing.length, fingerprint: input.fingerprint,
    name: input.name.slice(0, 160), mime: input.mime, bytes: input.bytes, duration_s: input.durationSec,
    width: input.width, height: input.height, recorded_at: input.recordedAt, status: "registered",
    expires_at: expiryFor(ent),
    facts: reuse?.facts ?? null, transcript: reuse?.transcript ?? null, card: reuse?.card ?? null,
  };
  if (wsId) row.workspace_id = wsId;
  const { data, error } = await client.from("studio_clips").insert(row).select("*").single();
  if (error) throw error;
  const clip = data as ClipRow;
  // New footage makes an existing Content Yield stale: back to collecting
  // (the old results stay readable until the next Understand replaces them).
  await updateProject(client, project.id, project.status === "ready" ? { status: "collecting" } : {}).catch(() => null);
  return { ok: true, clip: rowToClip(clip, {}), folder: clipFolder(viewerId, project.id, clip.id), reused: Boolean(reuse), expiresAt: clip.expires_at ?? "" };
}

export type CompleteInput = { sourcePath: string; frames: { t: number; path: string }[]; audioPath: string | null; facts: ClipFacts | null };

/** The browser finished uploading the bytes, frames and audio and measured the facts. */
export async function completeClip(client: Supa, ownerId: string, clipId: string, input: CompleteInput): Promise<StudioClip | null> {
  const { data: cur } = await client.from("studio_clips").select("*").eq("id", clipId).eq("user_id", ownerId).limit(1);
  const row = ((cur ?? []) as ClipRow[])[0];
  if (!row) return null;
  const patch: Record<string, unknown> = {
    source_path: input.sourcePath, frames: input.frames, audio_path: input.audioPath,
    // Measurements from this upload win over reused ones (same bytes, same numbers; this one is fresh).
    facts: input.facts ?? row.facts,
    status: row.card ? "ready" : "uploaded", error: null, updated_at: now(),
  };
  const { data, error } = await client.from("studio_clips").update(patch).eq("id", clipId).eq("user_id", ownerId).select("*").single();
  if (error) throw error;
  await updateProject(client, row.project_id, {}).catch(() => null);
  const r = data as ClipRow;
  return rowToClip(r, await frameUrls(client, [r]));
}

export async function deleteClip(client: Supa, ownerId: string, clipId: string): Promise<boolean> {
  const { data } = await client.from("studio_clips").select("*").eq("id", clipId).eq("user_id", ownerId).limit(1);
  const row = ((data ?? []) as ClipRow[])[0];
  if (!row) return false;
  if (row.source_path && !row.purged_at) await removeFolder(client, row.source_path.split("/").slice(0, 3).join("/"));
  const { error } = await client.from("studio_clips").delete().eq("id", clipId).eq("user_id", ownerId);
  if (error) throw error;
  // Positions stay stable (labels in existing guides refer to them); a project
  // whose footage changed needs a new Understand to get a trustworthy yield.
  await updateProject(client, row.project_id, { status: "collecting", yield: null, error: null }).catch(() => null);
  return true;
}

// ----------------------------------------------------------- analysis ----

export async function accountContext(client: Supa, ownerId: string, brandWs: Workspace | null): Promise<AccountContext> {
  const p = (await getProfile(client, ownerId, brandWs).catch(() => null)) as { niche?: string | null; goals?: string | null; brand_detail?: AccountContext["brand"] } | null;
  return { niche: p?.niche ?? null, location: p?.brand_detail?.location ?? null, goals: p?.goals ?? null, brand: p?.brand_detail ?? null };
}

export function toClipInputs(rows: ClipRow[], urls: Record<string, string>): ClipInput[] {
  return rows.map((r) => ({
    id: r.id, position: r.position, name: r.name, durationSec: r.duration_s ?? 0, recordedAt: r.recorded_at,
    facts: r.facts, transcript: r.transcript, card: r.card,
    frames: r.purged_at ? [] : (r.frames ?? []).map((f) => ({ t: f.t, url: urls[f.path] })).filter((f) => f.url),
  }));
}

export function toClipForEdl(r: ClipRow): ClipForEdl {
  const a = r.facts?.audio ?? null, v = r.facts?.visual ?? null;
  return {
    id: r.id, position: r.position, durationSec: r.duration_s ?? 0,
    words: r.transcript?.words?.length ? r.transcript.words : null,
    silences: a?.silences ?? null,
    medianLuma: v?.medianLuma ?? null, warmth: v ? (v.sampled.length ? v.sampled.map((s) => s.warmth).sort((x, y) => x - y)[v.sampled.length >> 1] : null) : null,
    brightness: v?.brightness ?? null, contrastLevel: v?.contrast ?? null,
    rmsDb: a?.rmsDb ?? null, audioLevel: a?.level ?? null,
    hasSpeech: Boolean(r.card?.speech.present && r.transcript?.words?.length),
  };
}

function rowToBuild(b: BuildRow, rows: ClipRow[]): StudioBuild {
  const used = new Set(b.edl.segments.map((s) => s.clipId));
  return {
    id: b.id, projectId: b.project_id, opportunityIdx: b.opportunity_idx, edl: b.edl, guide: b.guide, caption: b.caption,
    createdAt: b.created_at, durationSec: edlDurationSec(b.edl),
    footageExpired: rows.some((r) => used.has(r.id) && (r.purged_at || r.status === "expired")),
  };
}

export async function loadBuild(client: Supa, projectId: string, idx: number, rows: ClipRow[]): Promise<StudioBuild | null> {
  const { data, error } = await client.from("studio_builds").select("id, project_id, opportunity_idx, edl, guide, caption, created_at").eq("project_id", projectId).eq("opportunity_idx", idx).limit(1);
  if (error) throw error;
  const b = ((data ?? []) as BuildRow[])[0];
  return b ? rowToBuild(b, rows) : null;
}

/** Pass 3 for one opportunity: EDL proposal → validated EDL → edit guide, saved. */
export async function buildOpportunity(client: Supa, args: { ownerId: string; wsId: string | null; project: ProjectRow; idx: number; acct: AccountContext }): Promise<StudioBuild> {
  const { ownerId, wsId, project, idx, acct } = args;
  const opp: Opportunity | undefined = project.yield?.opportunities.find((o) => o.idx === idx);
  if (!opp) throw new Error("That post is not in this project's results.");
  const rows = await clipRows(client, project.id);
  const used = rows.filter((r) => opp.clipIds.includes(r.id));
  const urls = await frameUrls(client, used);
  const { raw, model } = await opportunityEdl(opp, toClipInputs(used, urls), acct);
  const forEdl = used.map(toClipForEdl);
  const { edl } = validateEdl(raw, forEdl);
  if (!edl.segments.length) throw new Error("SOCIA couldn't build a usable cut from these clips.");
  const guide = guideFromEdl(edl, forEdl);
  const row: Record<string, unknown> = { project_id: project.id, user_id: ownerId, opportunity_idx: idx, edl, guide, caption: edl.caption || null, model, updated_at: now() };
  if (wsId) row.workspace_id = wsId;
  const { data, error } = await client.from("studio_builds").upsert(row, { onConflict: "project_id,opportunity_idx" }).select("id, project_id, opportunity_idx, edl, guide, caption, created_at").single();
  if (error) throw error;
  return rowToBuild(data as BuildRow, rows);
}

/** Plan numbers the UI shows next to the drop zone (never hard-coded there). */
export function studioLimits(ent: Entitlements) {
  return {
    clipsPerProject: getLimit(ent, "studio_clips_per_project"),
    footageMinutes: getLimit(ent, "studio_footage_minutes"),
    uploadMb: getLimit(ent, "studio_upload_mb"),
    retentionDays: getLimit(ent, "studio_retention_days"),
  };
}
